import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { resolvePath } from '../config.js';

function candidates() {
  const home = os.homedir();
  const list = [];
  if (process.platform === 'darwin') {
    list.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
      path.join(home, 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
    );
  } else if (process.platform === 'win32') {
    const roots = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean);
    for (const root of roots) {
      list.push(
        path.join(root, 'Google/Chrome/Application/chrome.exe'),
        path.join(root, 'Microsoft/Edge/Application/msedge.exe'),
        path.join(root, 'BraveSoftware/Brave-Browser/Application/brave.exe'),
      );
    }
  } else {
    list.push(
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/snap/bin/chromium',
      '/usr/bin/microsoft-edge',
      '/usr/bin/brave-browser',
    );
  }
  return list;
}

export function findChrome(configured = '') {
  const checked = [];
  const explicit = configured || process.env.CHROME_PATH || '';
  if (explicit) {
    const exists = fs.existsSync(explicit);
    checked.push({ path: explicit, exists, explicit: true });
    if (exists) return { path: explicit, checked, source: 'config' };
  }
  for (const candidate of candidates()) {
    const exists = fs.existsSync(candidate);
    checked.push({ path: candidate, exists });
    if (exists) return { path: candidate, checked, source: 'auto' };
  }
  return { path: '', checked, source: 'none' };
}

export class BrowserManager {
  constructor({ getConfig, logger = console }) {
    this.getConfig = getConfig;
    this.logger = logger;
    this.browser = null;
    this.launching = null;
    this.lastError = null;
  }

  status() {
    const config = this.getConfig();
    const found = findChrome(config.scraper.chromePath);
    return {
      running: Boolean(this.browser?.connected),
      path: found.path,
      configuredPath: config.scraper.chromePath || '',
      source: found.source,
      checked: found.checked,
      headless: config.scraper.headless,
      lastError: this.lastError,
    };
  }

  async ensure() {
    if (this.browser?.connected) return this.browser;
    if (this.launching) return this.launching;
    this.launching = this.#launch().finally(() => {
      this.launching = null;
    });
    return this.launching;
  }

  async #launch() {
    const config = this.getConfig();
    const found = findChrome(config.scraper.chromePath);
    if (!found.path) {
      throw new Error(
        '未找到 Chrome/Chromium。请安装 Google Chrome，或在“设置 → 浏览器”中填写可执行文件路径。',
      );
    }
    const profileDir = resolvePath(config.scraper.profileDir || path.join('data', 'chrome-profile'));
    fs.mkdirSync(profileDir, { recursive: true });

    const args = [
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--window-size=1440,900',
      `--lang=${config.scraper.locale || 'zh-CN'}`,
    ];
    if (config.scraper.noSandbox) args.push('--no-sandbox');
    if (config.scraper.headless) args.push('--hide-scrollbars', '--mute-audio');

    try {
      const browser = await puppeteer.launch({
        executablePath: found.path,
        headless: Boolean(config.scraper.headless),
        userDataDir: profileDir,
        args,
        defaultViewport: { width: 1440, height: 900 },
        protocolTimeout: 180000,
        timeout: 60000,
      });
      browser.on('disconnected', () => {
        if (this.browser === browser) {
          this.browser = null;
          this.logger.log('[browser] Chrome 已断开');
        }
      });
      this.browser = browser;
      this.lastError = null;
      this.logger.log(`[browser] Chrome 已启动 (${found.path})`);
      return browser;
    } catch (err) {
      this.lastError = String(err?.message || err);
      if (/SingletonLock|profile.*in use/i.test(this.lastError)) {
        throw new Error(`Chrome 用户目录被占用，请关闭残留的 Chrome 进程后重试。\n${this.lastError}`);
      }
      throw err;
    }
  }

  async newPage() {
    const browser = await this.ensure();
    const config = this.getConfig();
    const page = await browser.newPage();
    const timeout = Number(config.scraper.timeoutMs) || 30000;
    page.setDefaultTimeout(timeout);
    page.setDefaultNavigationTimeout(timeout);
    if (config.scraper.userAgent) await page.setUserAgent(config.scraper.userAgent);
    await page.setViewport({ width: 1440, height: 900 });
    return page;
  }

  async close() {
    const browser = this.browser;
    this.browser = null;
    if (!browser) return;
    try {
      await browser.close();
    } catch {
      /* already gone */
    }
  }
}
