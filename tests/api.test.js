import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let child;
let dir;
let base;
let tableId;
let fieldId;
let entryId;

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitForHealth(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/api/health`);
      if (res.ok) return await res.json();
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('server did not become healthy in time');
}

async function api(pathname, { method = 'GET', body } = {}) {
  const res = await fetch(`${base}${pathname}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { res, data };
}

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'it-api-'));
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['--experimental-sqlite', 'src/server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      IT_DATA_DIR: dir,
      IT_DB_FILE: path.join(dir, 'api.db'),
      IT_SEED_DEMO: '0',
      IT_SCHEDULER: '0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.resume();
  child.stderr.resume();
  await waitForHealth();
});

after(async () => {
  if (child && !child.killed) {
    child.kill('SIGTERM');
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        resolve();
      }, 4000);
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

test('health exposes the sqlite database and version', async () => {
  const { res, data } = await api('/api/health');
  assert.equal(res.status, 200);
  assert.equal(data.ok, true);
  assert.equal(data.db.driver, 'sqlite');
  assert.ok(data.version);
});

test('settings expose network info and reject invalid listen hosts', async () => {
  const { res, data } = await api('/api/settings');
  assert.equal(res.status, 200);
  assert.ok(data.network);
  assert.equal(data.network.localUrl, base);
  assert.equal(data.network.host, '127.0.0.1');
  assert.equal(data.network.lanVisible, false);
  assert.deepEqual(data.network.lanUrls, []);

  const invalid = await api('/api/settings', { method: 'PUT', body: { host: '1.2.3.4' } });
  assert.equal(invalid.res.status, 400);
  assert.match(invalid.data.error, /监听地址/);
});

test('a table can be created with variables and fields', async () => {
  let result = await api('/api/tables', {
    method: 'POST',
    body: {
      name: 'API 测试表',
      icon: '🧪',
      urlTemplate: `${base}/demo/market?asin={{asin}}`,
      variables: [{ key: 'asin', label: '商品 ASIN', required: true }],
      settings: { intervalSec: 0 },
    },
  });
  assert.equal(result.res.status, 201);
  assert.equal(result.data.table.name, 'API 测试表');
  tableId = result.data.table.id;

  result = await api(`/api/tables/${tableId}/fields`, {
    method: 'POST',
    body: { name: '价格', dataType: 'number', template: { extract: 'text', selector: '.price .amount' } },
  });
  assert.equal(result.res.status, 201);
  assert.equal(result.data.field.name, '价格');
  fieldId = result.data.field.id;

  result = await api(`/api/tables/${tableId}`);
  assert.equal(result.res.status, 200);
  assert.equal(result.data.fields.length, 1);
  assert.equal(result.data.table.variables[0].key, 'asin');
});

test('a row can be added from variables only and is stored without scraping', async () => {
  const { res, data } = await api(`/api/tables/${tableId}/entries`, {
    method: 'POST',
    body: { vars: { asin: 'B0DEMO002' }, note: '测试行', refresh: false },
  });
  assert.equal(res.status, 201);
  assert.equal(data.entry.vars.asin, 'B0DEMO002');
  assert.equal(data.entry.note, '测试行');
  assert.equal(data.entry.status, 'idle');
  entryId = data.entry.id;

  const history = await api(`/api/entries/${entryId}/history`);
  assert.equal(history.res.status, 200);
  assert.equal(history.data.snapshots.length, 0);
});

test('invalid variables are rejected with a readable message', async () => {
  let result = await api(`/api/tables/${tableId}/entries`, { method: 'POST', body: { vars: {}, refresh: false } });
  assert.equal(result.res.status, 400);
  assert.match(result.data.error, /缺少变量/);

  result = await api(`/api/tables/${tableId}/entries`, { method: 'POST', body: { vars: { asin: 'B0DEMO002', other: 'x' }, refresh: false } });
  assert.equal(result.res.status, 400);
  assert.match(result.data.error, /没有定义变量/);
});

test('CSV export contains variable, field and status columns', async () => {
  const res = await fetch(`${base}/api/export?tableId=${tableId}&format=csv&mode=latest`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/csv/);
  assert.match(res.headers.get('content-disposition'), /attachment/);
  const bytes = new Uint8Array(await res.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf]);
  const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
  assert.match(text, /商品 ASIN,价格,状态,最后更新,备注/);
  assert.match(text, /B0DEMO002/);
  assert.match(text, /未抓取/);
});

test('CSV with both modes returns 400', async () => {
  const { res, data } = await api(`/api/export?tableId=${tableId}&format=csv&mode=both`);
  assert.equal(res.status, 400);
  assert.match(data.error, /CSV/);
});

test('settings can test a sqlite connection', async () => {
  const probe = path.join(dir, 'probe.db');
  const { res, data } = await api('/api/settings/db/test', {
    method: 'POST',
    body: { driver: 'sqlite', file: probe },
  });
  assert.equal(res.status, 200);
  assert.equal(data.ok, true);
  assert.ok(fs.existsSync(probe));
});

test('cross-origin writes are rejected', async () => {
  const res = await fetch(`${base}/api/tables`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
    body: JSON.stringify({ name: 'csrf' }),
  });
  assert.equal(res.status, 403);
  assert.match((await res.json()).error, /跨站/);
});

test('SSE stream stays open and sends the hello event', async () => {
  const controller = new AbortController();
  const res = await fetch(`${base}/api/events`, { signal: controller.signal });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/event-stream/);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline && !buffer.includes('event: hello')) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
  }
  controller.abort();
  assert.match(buffer, /retry: 2000/);
  assert.match(buffer, /event: hello/);
});

test('unknown resources return a JSON 404', async () => {
  const { res, data } = await api('/api/tables/does-not-exist');
  assert.equal(res.status, 404);
  assert.match(data.error, /不存在/);
});

test('a table can be deleted together with its rows', async () => {
  const { res } = await api(`/api/tables/${tableId}`, { method: 'DELETE' });
  assert.equal(res.status, 200);
  const gone = await api(`/api/tables/${tableId}`);
  assert.equal(gone.res.status, 404);
});
