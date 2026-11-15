const fs = require('fs');
const os = require('os');
const path = require('path');
const puppeteer = require('puppeteer-core');
const { execFileSync } = require('child_process');
const { resolvePath } = require('../config');
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

function findChrome(configured = '') {
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


const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

function pidLooksLikeChrome(pid) {
  const probes = [
    ['ps', ['-p', String(pid), '-o', 'comm=']],
    ['lsof', ['-p', String(pid), '-Fn']],
  ];
  for (const [command, args] of probes) {
    try {
      const output = execFileSync(command, args, {
        encoding: 'utf8',
        timeout: 3000,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      if (/chrome|chromium|msedge|brave/i.test(output)) return true;
      if (output.trim()) return false;
    } catch (err) {
      // Command missing or blocked; try the next probe.
    }
  }
  return null;
}

/**
 * Chrome leaves SingletonLock behind when the browser is killed with the app.
 * Remove a stale lock, and stop an orphaned Chrome that still owns our dedicated
 * automation profile, otherwise every following launch fails with a 502.
 */
async function releaseProfileLock(profileDir, logger) {
  const lockPath = path.join(profileDir, 'SingletonLock');
  let target;
  try {
    target = fs.readlinkSync(lockPath);
  } catch (err) {
    return false;
  }
  const match = /^(.*)-(\d+)$/.exec(target);
  if (!match) return false;
  const host = match[1];
  const pid = Number(match[2]);
  if (host !== os.hostname()) return false;

  if (pidAlive(pid)) {
    const looksLikeChrome = pidLooksLikeChrome(pid);
    // A different process reusing the PID means the lock itself is stale.
    if (looksLikeChrome !== false) {
      logger.log(`[browser] 发现残留的 Chrome 占用用户目录（PID ${pid}），正在结束它`);
      try {
        process.kill(pid, 'SIGTERM');
      } catch (err) {
        /* already gone */
      }
      for (let i = 0; i < 20 && pidAlive(pid); i += 1) await sleep(150);
      if (pidAlive(pid)) {
        try {
          process.kill(pid, 'SIGKILL');
        } catch (err) {
          /* already gone */
        }
        await sleep(300);
      }
    }
  }

  for (const name of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) {
    try {
      fs.unlinkSync(path.join(profileDir, name));
    } catch (err) {
      /* not present */
    }
  }
  return true;
}

class BrowserManager {
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
      running: Boolean(this.browser && this.browser.isConnected()),
      path: found.path,
      configuredPath: config.scraper.chromePath || '',
      source: found.source,
      checked: found.checked,
      headless: config.scraper.headless,
      lastError: this.lastError,
    };
  }

  async ensure() {
    if (this.browser && this.browser.isConnected()) return this.browser;
    if (this.launching) return this.launching;
    this.launching = this._launch().finally(() => {
      this.launching = null;
    });
    return this.launching;
  }

  async _launch() {
    const config = this.getConfig();
    const found = findChrome(config.scraper.chromePath);
    if (!found.path) {
      throw new Error(
        '未找到 Chrome/Chromium。请安装 Google Chrome，或在“设置 → 浏览器”中填写可执行文件路径。',
      );
    }
    const profileDir = resolvePath(config.scraper.profileDir || path.join('data', 'chrome-profile'));
    fs.mkdirSync(profileDir, { recursive: true });
    await releaseProfileLock(profileDir, this.logger);

    const args = [
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-blink-features=AutomationControlled',
      '--remote-allow-origins=*',
      '--disable-dev-shm-usage',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--window-size=1440,900',
      `--lang=${config.scraper.locale || 'zh-CN'}`,
    ];
    if (config.scraper.noSandbox) args.push('--no-sandbox');
    if (config.scraper.headless) args.push('--hide-scrollbars', '--mute-audio');

    const launch = () =>
      puppeteer.launch({
        executablePath: found.path,
        headless: Boolean(config.scraper.headless),
        userDataDir: profileDir,
        args,
        defaultViewport: { width: 1440, height: 900 },
        timeout: 60000,
      });

    try {
      let browser;
      try {
        browser = await launch();
      } catch (launchError) {
        const message = String((launchError && launchError.message) || launchError);
        if (!/SingletonLock|ProcessSingleton|profile/i.test(message)) throw launchError;
        // The previous instance may have died without closing Chrome.
        await releaseProfileLock(profileDir, this.logger);
        browser = await launch();
      }
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
      this.lastError = String((err && err.message) || err);
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

module.exports = {
  findChrome,
  BrowserManager,
};
