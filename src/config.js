import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PUBLIC_DIR = path.join(ROOT, 'public');
export const DATA_DIR = path.resolve(process.env.IT_DATA_DIR || path.join(ROOT, 'data'));
export const CONFIG_PATH = path.join(DATA_DIR, 'config.json');

export const VERSION = '0.1.0';

/** Resolve a user supplied path relative to the project root. */
export function resolvePath(p) {
  if (!p) return p;
  return path.isAbsolute(p) ? p : path.resolve(ROOT, p);
}

function defaults() {
  const config = {
    port: Number(process.env.PORT || 4780),
    host: process.env.HOST || '0.0.0.0',
    db: {
      driver: 'sqlite',
      file: process.env.IT_DB_FILE || path.join('data', 'tracker.db'),
    },
    scraper: {
      chromePath: process.env.CHROME_PATH || '',
      headless: true,
      // Chrome's sandbox cannot start inside some restricted/containerised
      // environments. Turn this off if you run the tracker on a trusted machine
      // and want the browser sandbox enabled.
      noSandbox: true,
      concurrency: 3,
      timeoutMs: 30000,
      locale: 'zh-CN',
      userAgent: '',
      profileDir: path.join('data', 'chrome-profile'),
      keepBrowserOpen: true,
    },
    scheduler: { enabled: process.env.IT_SCHEDULER !== '0', tickMs: 5000 },
    seedDemo: process.env.IT_SEED_DEMO !== '0',
  };
  if (process.env.IT_DB_URL) {
    config.db = { driver: driverFromUrl(process.env.IT_DB_URL), url: process.env.IT_DB_URL };
  }
  return config;
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);
// Skip loopback and virtual adapters (bridges, VPN tunnels, container networks)
// so the addresses we advertise are the ones other devices can actually reach.
const VIRTUAL_IFACE = /^(lo|bridge|utun|awdl|llw|vmnet|vboxnet|docker|veth|br-|tun|tap|zt|tailscale|wg)/i;

/** Human readable bind mode plus the URLs other devices can use. */
export function networkInfo(config = {}) {
  const host = config.host || '0.0.0.0';
  const port = Number(config.port) || 4780;
  const lanVisible = host === '0.0.0.0' || host === '::';
  const interfaces = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    if (VIRTUAL_IFACE.test(name)) continue;
    for (const item of list || []) {
      if (item.family !== 'IPv4' || item.internal) continue;
      interfaces.push({ name, address: item.address, url: `http://${item.address}:${port}` });
    }
  }
  return {
    host,
    port,
    lanVisible,
    bindLabel: lanVisible ? '所有网络接口（局域网可访问）' : LOOPBACK_HOSTS.has(host) ? '仅本机' : host,
    localUrl: `http://127.0.0.1:${port}`,
    lanUrls: lanVisible ? [...new Set(interfaces.map((item) => item.url))] : [],
    interfaces,
  };
}

export function driverFromUrl(url = '') {
  const scheme = String(url).split(':')[0].toLowerCase();
  if (scheme === 'postgres' || scheme === 'postgresql') return 'postgres';
  if (scheme === 'mysql' || scheme === 'mariadb') return 'mysql';
  if (scheme === 'sqlite' || scheme === 'file') return 'sqlite';
  return 'postgres';
}

function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function merge(base, patch) {
  const out = { ...base };
  for (const [key, value] of Object.entries(patch || {})) {
    out[key] = isObject(value) && isObject(base[key]) ? merge(base[key], value) : value;
  }
  return out;
}

function applyEnv(config) {
  if (process.env.PORT) config.port = Number(process.env.PORT) || config.port;
  if (process.env.HOST) config.host = process.env.HOST;
  if (process.env.IT_DB_URL) {
    config.db = { driver: driverFromUrl(process.env.IT_DB_URL), url: process.env.IT_DB_URL };
  } else if (process.env.IT_DB_FILE) {
    config.db = { driver: 'sqlite', file: process.env.IT_DB_FILE };
  }
  if (process.env.CHROME_PATH) config.scraper.chromePath = process.env.CHROME_PATH;
  if (process.env.IT_SEED_DEMO !== undefined) config.seedDemo = process.env.IT_SEED_DEMO !== '0';
  if (process.env.IT_SCHEDULER !== undefined) config.scheduler.enabled = process.env.IT_SCHEDULER !== '0';
  return config;
}

export function loadConfig() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  let stored = {};
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      stored = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch (err) {
      console.warn(`[config] 无法解析 ${CONFIG_PATH}，使用默认配置：${err.message}`);
    }
  }
  const config = applyEnv(merge(defaults(), stored));
  if (!fs.existsSync(CONFIG_PATH)) saveConfig(config);
  return config;
}

export function saveConfig(config) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${CONFIG_PATH}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(config, null, 2)}\n`);
  fs.renameSync(tmp, CONFIG_PATH);
}

/** Turn the config's db block into a concrete descriptor for the adapters. */
export function dbDescriptor(db = {}) {
  if (db.url) {
    return { driver: db.driver || driverFromUrl(db.url), url: String(db.url).trim() };
  }
  return { driver: db.driver || 'sqlite', file: resolvePath(db.file || path.join('data', 'tracker.db')) };
}

export function describeDb(desc) {
  if (!desc) return null;
  if (desc.driver === 'sqlite') {
    return { driver: 'sqlite', file: desc.file, label: 'SQLite' };
  }
  return { driver: desc.driver, url: desc.url, label: desc.driver === 'postgres' ? 'PostgreSQL' : 'MySQL' };
}

/** Safe subset of the config handed to the browser. */
export function publicConfig(config) {
  return {
    version: VERSION,
    host: config.host,
    port: config.port,
    db: describeDb(dbDescriptor(config.db)),
    scraper: {
      chromePath: config.scraper.chromePath,
      headless: config.scraper.headless,
      noSandbox: config.scraper.noSandbox,
      concurrency: config.scraper.concurrency,
      timeoutMs: config.scraper.timeoutMs,
      locale: config.scraper.locale,
      profileDir: config.scraper.profileDir,
    },
    scheduler: config.scheduler,
    dataDir: DATA_DIR,
  };
}
