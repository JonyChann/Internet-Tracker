import fs from 'node:fs';
import path from 'node:path';
import { HttpError, sendJson } from '../http.js';
import * as store from '../db/store.js';
import { describeDb, dbDescriptor, publicConfig, resolvePath, networkInfo, VERSION, DATA_DIR, CONFIG_PATH } from '../config.js';
import { initDatabase, testDatabase } from '../db/index.js';
import { clampInt, optionalString, requireObject } from './helpers.js';

function dbPayload(body) {
  const payload = requireObject(body, '数据库配置');
  const driver = String(payload.driver || 'sqlite');
  if (driver === 'sqlite') {
    const file = String(payload.file || '').trim();
    if (!file) throw new HttpError(400, '请填写 SQLite 文件路径');
    return { driver: 'sqlite', file: resolvePath(file) };
  }
  if (driver === 'postgres' || driver === 'mysql') {
    const url = String(payload.url || '').trim();
    if (!url) throw new HttpError(400, '请填写数据库连接串');
    const scheme = url.split(':')[0].toLowerCase();
    const expected = driver === 'postgres' ? ['postgres', 'postgresql'] : ['mysql', 'mariadb'];
    if (!expected.includes(scheme)) {
      throw new HttpError(400, `连接串必须以 ${expected.map((item) => `${item}://`).join(' 或 ')} 开头`);
    }
    return { driver, url };
  }
  throw new HttpError(400, `不支持的数据库类型：${driver}`);
}

export function registerSettingsRoutes(router, ctx) {
  const { getConfig, saveConfig, browser } = ctx;

  router.get('/api/health', async ({ res }) => {
    sendJson(res, 200, {
      ok: true,
      version: VERSION,
      uptime: Math.round(process.uptime()),
      db: describeDb(dbDescriptor(getConfig().db)),
      chrome: browser.status().running,
    });
  });

  router.get('/api/settings', async ({ res }) => {
    const config = getConfig();
    sendJson(res, 200, {
      version: VERSION,
      node: process.version,
      config: publicConfig(config),
      chrome: browser.status(),
      db: describeDb(dbDescriptor(config.db)),
      stats: await store.getStats(),
      network: networkInfo(config),
      paths: { dataDir: DATA_DIR, config: CONFIG_PATH, database: dbDescriptor(config.db).file || '' },
    });
  });

  router.put('/api/settings', async ({ res, body }) => {
    const config = getConfig();
    const payload = requireObject(body);
    let restartBrowser = false;
    let restartServer = false;

    if (payload.host !== undefined) {
      const host = String(payload.host).trim();
      if (!['0.0.0.0', '127.0.0.1', '::', '::1', 'localhost'].includes(host)) {
        throw new HttpError(400, '监听地址只支持 0.0.0.0（所有网络接口）或 127.0.0.1（仅本机）');
      }
      if (host !== config.host) restartServer = true;
      config.host = host;
    }

    if (payload.scraper !== undefined) {
      const scraper = requireObject(payload.scraper, '浏览器设置');
      if (scraper.chromePath !== undefined) {
        const value = optionalString(scraper.chromePath, 'Chrome 路径', { max: 2000 });
        if (value !== config.scraper.chromePath) restartBrowser = true;
        config.scraper.chromePath = value;
      }
      if (scraper.headless !== undefined) {
        const value = Boolean(scraper.headless);
        if (value !== config.scraper.headless) restartBrowser = true;
        config.scraper.headless = value;
      }
      if (scraper.noSandbox !== undefined) {
        const value = Boolean(scraper.noSandbox);
        if (value !== config.scraper.noSandbox) restartBrowser = true;
        config.scraper.noSandbox = value;
      }
      if (scraper.concurrency !== undefined) config.scraper.concurrency = clampInt(scraper.concurrency, 3, 1, 10);
      if (scraper.timeoutMs !== undefined) config.scraper.timeoutMs = clampInt(scraper.timeoutMs, 30000, 3000, 120000);
      if (scraper.locale !== undefined) {
        const value = optionalString(scraper.locale, '语言', { max: 40 }) || 'zh-CN';
        if (value !== config.scraper.locale) restartBrowser = true;
        config.scraper.locale = value;
      }
      if (scraper.userAgent !== undefined) {
        const value = optionalString(scraper.userAgent, 'User-Agent', { max: 500 });
        if (value !== config.scraper.userAgent) restartBrowser = true;
        config.scraper.userAgent = value;
      }
      if (scraper.profileDir !== undefined) {
        config.scraper.profileDir = optionalString(scraper.profileDir, '浏览器配置目录', { max: 1000 }) || path.join('data', 'chrome-profile');
      }
    }

    if (payload.scheduler !== undefined) {
      const scheduler = requireObject(payload.scheduler, '调度设置');
      if (scheduler.enabled !== undefined) config.scheduler.enabled = Boolean(scheduler.enabled);
    }

    saveConfig(config);
    if (restartBrowser) await browser.close();
    sendJson(res, 200, {
      ok: true,
      config: publicConfig(config),
      chrome: browser.status(),
      network: networkInfo(config),
      restartRequired: restartServer,
    });
  });

  router.get('/api/settings/chrome', async ({ res }) => {
    sendJson(res, 200, { chrome: browser.status() });
  });

  router.post('/api/settings/chrome/test', async ({ res }) => {
    const started = Date.now();
    await browser.close();
    let page;
    try {
      page = await browser.newPage();
      await page.goto('data:text/html,<title>Internet Tracker</title><h1 id="ok">ok</h1>', {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      const text = await page.$eval('#ok', (el) => el.textContent);
      sendJson(res, 200, {
        ok: text === 'ok',
        version: await page.browser().version(),
        path: browser.status().path,
        durationMs: Date.now() - started,
      });
    } catch (err) {
      throw new HttpError(502, `Chrome 启动失败：${err.message}`);
    } finally {
      if (page) await page.close().catch(() => {});
    }
  });

  router.post('/api/settings/chrome/close', async ({ res }) => {
    await browser.close();
    sendJson(res, 200, { ok: true, chrome: browser.status() });
  });

  router.post('/api/settings/db/test', async ({ res, body }) => {
    const desc = dbPayload(body);
    try {
      await testDatabase(desc);
    } catch (err) {
      throw new HttpError(400, `连接失败：${err.message}`);
    }
    sendJson(res, 200, { ok: true, db: describeDb(desc) });
  });

  router.put('/api/settings/db', async ({ res, body }) => {
    const config = getConfig();
    const desc = dbPayload(body);
    try {
      await initDatabase(desc);
    } catch (err) {
      throw new HttpError(400, `切换失败：${err.message}`);
    }
    config.db = desc.driver === 'sqlite' ? { driver: 'sqlite', file: desc.file } : { driver: desc.driver, url: desc.url };
    saveConfig(config);
    sendJson(res, 200, {
      ok: true,
      db: describeDb(desc),
      stats: await store.getStats(),
    });
  });

  router.get('/api/settings/backup', async ({ res }) => {
    const desc = dbDescriptor(getConfig().db);
    if (desc.driver !== 'sqlite') {
      throw new HttpError(
        400,
        `当前使用 ${describeDb(desc).label}，请使用对应的备份工具（pg_dump / mysqldump）导出数据库。`,
      );
    }
    if (!fs.existsSync(desc.file)) throw new HttpError(404, '数据库文件不存在');
    // Fold the WAL into the main file so the downloaded copy is complete.
    try {
      await (await import('../db/index.js')).getDb().exec('PRAGMA wal_checkpoint(TRUNCATE)');
    } catch {
      /* checkpoint is best effort */
    }
    const stat = await fs.promises.stat(desc.file);
    const filename = `internet-tracker-${new Date().toISOString().slice(0, 10)}.db`;
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', stat.size);
    fs.createReadStream(desc.file).pipe(res);
  });
}
