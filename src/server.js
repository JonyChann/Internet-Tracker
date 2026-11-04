import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { VERSION, loadConfig, saveConfig, dbDescriptor, publicConfig } from './config.js';
import { EventHub, Router, createHttpServer, sendJson } from './http.js';
import { initDatabase, closeDatabase, currentDbInfo } from './db/index.js';
import { seedDemo } from './db/seed.js';
import { listDatasets, listEntries, listSnapshots, getDataset } from './db/store.js';
import { BrowserManager } from './scraper/browser.js';
import { RefreshService } from './scraper/runner.js';
import { Scheduler } from './scraper/scheduler.js';
import { registerApiRoutes } from './api/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');

function log(...args) {
  console.log(`[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}]`, ...args);
}

const logger = { log, info: log, warn: log, error: (...args) => console.error(`[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}]`, ...args) };

async function main() {
  const config = loadConfig();
  const events = new EventHub();

  await initDatabase(dbDescriptor(config.db));
  log(`数据库就绪：${currentDbInfo().label}`);

  const browser = new BrowserManager({ getConfig: () => config, logger });
  const refresher = new RefreshService({ getConfig: () => config, events, browser, logger });
  const scheduler = new Scheduler({ getConfig: () => config, refresher, logger });

  let demoTable = null;
  if (config.seedDemo !== false) {
    try {
      demoTable = await seedDemo({ port: config.port });
      if (demoTable) log(`已创建演示数据表「${demoTable.name}」`);
    } catch (err) {
      log('演示数据初始化失败（可忽略）：', err.message);
    }
  }

  const router = new Router();
  router.get('/api/events', async ({ req, res }) => {
    events.subscribe(req, res);
  });
  router.get('/api/meta', async ({ res }) => {
    sendJson(res, 200, {
      name: 'Internet Tracker',
      version: VERSION,
      publicConfig: publicConfig(config),
      db: currentDbInfo(),
    });
  });

  registerApiRoutes(router, {
    getConfig: () => config,
    saveConfig,
    events,
    browser,
    refresher,
    scheduler,
    logger,
  });

  const server = createHttpServer({ router, publicDir: PUBLIC_DIR, events, log });

  await new Promise((resolve, reject) => {
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        reject(
          new Error(
            `端口 ${config.port} 已被占用。请关闭占用它的程序，或修改 ${path.join(process.env.IT_DATA_DIR || 'data', 'config.json')} 中的 port。`,
          ),
        );
      } else {
        reject(err);
      }
    });
    server.listen(config.port, config.host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  scheduler.start();
  log(`Internet Tracker v${VERSION} 已启动：http://${config.host}:${config.port}`);
  log(`Chrome 抓取器：${browser.status().path || '未找到 Chrome'}`);
  log('按 Ctrl+C 停止');

  // 首次启动时，对演示表的空行做一次抓取，方便用户立刻看到效果。
  if (demoTable) {
    setTimeout(async () => {
      try {
        const table = await getDataset(demoTable.id);
        if (!table) return;
        const entries = await listEntries(table.id);
        const empty = [];
        for (const entry of entries) {
          const total = await listSnapshots(entry.id, { limit: 1 });
          if (total.length === 0) empty.push(entry);
        }
        if (empty.length > 0) {
          log(`首次抓取演示数据表（${empty.length} 行）…`);
          await refresher.refreshEntries({ dataset: table, entries: empty, source: 'demo' });
        }
      } catch (err) {
        log('演示抓取失败：', err.message);
      }
    }, 800);
  }

  let closing = false;
  const shutdown = async (signal) => {
    if (closing) return;
    closing = true;
    log(`收到 ${signal}，正在关闭…`);
    scheduler.stop();
    server.close();
    try {
      await browser.close();
    } catch {
      /* ignore */
    }
    try {
      await closeDatabase();
    } catch {
      /* ignore */
    }
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  process.on('unhandledRejection', (err) => {
    log('未处理的异步错误：', err && err.stack ? err.stack : err);
  });
}

main().catch((err) => {
  console.error(err && err.message ? err.message : err);
  process.exit(1);
});
