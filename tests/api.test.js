const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const net = require('net');
const path = require('path');
const { assert, defineSuite, tempDir, removeDir } = require('./harness');

const ROOT = path.resolve(__dirname, '..');

let child;
let dir;
let port;
let base;
let tableId;
let fieldId;
let entryId;

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

function request(method, pathname, options) {
  const opts = options || {};
  return new Promise((resolve, reject) => {
    const headers = {};
    let payload = null;
    if (opts.body !== undefined) {
      payload = Buffer.from(JSON.stringify(opts.body));
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = payload.length;
    }
    Object.assign(headers, opts.headers || {});
    const req = http.request(
      { host: '127.0.0.1', port, path: pathname, method, headers },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          resolve({ status: res.statusCode, headers: res.headers, buffer, text: buffer.toString('utf8') });
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function json(response) {
  try {
    return JSON.parse(response.text);
  } catch (err) {
    return {};
  }
}

async function waitForHealth(timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 15000);
  while (Date.now() < deadline) {
    try {
      const res = await request('GET', '/api/health');
      if (res.status === 200) return json(res);
    } catch (err) {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('server did not become healthy in time');
}

module.exports = defineSuite('api', {
  before: async () => {
    dir = tempDir('it-api-');
    port = await freePort();
    base = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, ['src/server.js'], {
      cwd: ROOT,
      env: Object.assign({}, process.env, {
        PORT: String(port),
        HOST: '127.0.0.1',
        IT_DATA_DIR: dir,
        IT_DB_FILE: path.join(dir, 'api.db'),
        IT_SEED_DEMO: '0',
        IT_SCHEDULER: '0',
      }),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.resume();
    child.stderr.resume();
    await waitForHealth();
  },
  after: async () => {
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
    removeDir(dir);
  },
  tests: [
    [
      'health exposes the sqlite database and version',
      async () => {
        const res = await request('GET', '/api/health');
        const data = json(res);
        assert.equal(res.status, 200);
        assert.equal(data.ok, true);
        assert.equal(data.db.driver, 'sqlite');
        assert.ok(data.version);
      },
    ],
    [
      'a table can be created with variables and fields',
      async () => {
        let res = await request('POST', '/api/tables', {
          body: {
            name: 'API 测试表',
            icon: '🧪',
            urlTemplate: `${base}/demo/market?asin={{asin}}`,
            variables: [{ key: 'asin', label: '商品 ASIN', required: true }],
            settings: { intervalSec: 0 },
          },
        });
        assert.equal(res.status, 201);
        assert.equal(json(res).table.name, 'API 测试表');
        tableId = json(res).table.id;

        res = await request('POST', `/api/tables/${tableId}/fields`, {
          body: { name: '价格', dataType: 'number', template: { extract: 'text', selector: '.price .amount' } },
        });
        assert.equal(res.status, 201);
        assert.equal(json(res).field.name, '价格');
        fieldId = json(res).field.id;

        res = await request('GET', `/api/tables/${tableId}`);
        assert.equal(res.status, 200);
        assert.equal(json(res).fields.length, 1);
        assert.equal(json(res).table.variables[0].key, 'asin');
      },
    ],
    [
      'a row can be added from variables only and is stored without scraping',
      async () => {
        const res = await request('POST', `/api/tables/${tableId}/entries`, {
          body: { vars: { asin: 'B0DEMO002' }, note: '测试行', refresh: false },
        });
        assert.equal(res.status, 201);
        const data = json(res);
        assert.equal(data.entry.vars.asin, 'B0DEMO002');
        assert.equal(data.entry.note, '测试行');
        assert.equal(data.entry.status, 'idle');
        entryId = data.entry.id;

        const history = await request('GET', `/api/entries/${entryId}/history`);
        assert.equal(history.status, 200);
        assert.equal(json(history).snapshots.length, 0);
      },
    ],
    [
      'invalid variables are rejected with a readable message',
      async () => {
        let res = await request('POST', `/api/tables/${tableId}/entries`, { body: { vars: {}, refresh: false } });
        assert.equal(res.status, 400);
        assert.ok(/缺少变量/.test(json(res).error));

        res = await request('POST', `/api/tables/${tableId}/entries`, {
          body: { vars: { asin: 'B0DEMO002', other: 'x' }, refresh: false },
        });
        assert.equal(res.status, 400);
        assert.ok(/没有定义变量/.test(json(res).error));
      },
    ],
    [
      'CSV export contains variable, field and status columns',
      async () => {
        const res = await request('GET', `/api/export?tableId=${tableId}&format=csv&mode=latest`);
        assert.equal(res.status, 200);
        assert.ok(/text\/csv/.test(res.headers['content-type']));
        assert.ok(/attachment/.test(res.headers['content-disposition']));
        assert.deepStrictEqual([...res.buffer.slice(0, 3)], [0xef, 0xbb, 0xbf]);
        assert.ok(res.text.indexOf('商品 ASIN,价格,状态,最后更新,备注') >= 0);
        assert.ok(res.text.indexOf('B0DEMO002') >= 0);
        assert.ok(res.text.indexOf('未抓取') >= 0);
      },
    ],
    [
      'CSV with both modes returns 400',
      async () => {
        const res = await request('GET', `/api/export?tableId=${tableId}&format=csv&mode=both`);
        assert.equal(res.status, 400);
        assert.ok(/CSV/.test(json(res).error));
      },
    ],
    [
      'settings can test a sqlite connection',
      async () => {
        const probe = path.join(dir, 'probe.db');
        const res = await request('POST', '/api/settings/db/test', {
          body: { driver: 'sqlite', file: probe },
        });
        assert.equal(res.status, 200);
        assert.equal(json(res).ok, true);
        assert.ok(fs.existsSync(probe));
      },
    ],
    [
      'settings expose LAN URLs and validate the listen host',
      async () => {
        const res = await request('GET', '/api/settings');
        assert.equal(res.status, 200);
        const network = json(res).network;
        assert.equal(network.host, '127.0.0.1');
        assert.equal(network.localUrl, base);
        assert.equal(network.lanVisible, false);
        assert.deepStrictEqual(network.lanUrls, []);

        const bad = await request('PUT', '/api/settings', { body: { host: '8.8.8.8' } });
        assert.equal(bad.status, 400);
        assert.ok(/监听地址/.test(json(bad).error));
      },
    ],
    [
      'cross-origin writes are rejected',
      async () => {
        const res = await request('POST', '/api/tables', {
          headers: { Origin: 'https://evil.example' },
          body: { name: 'evil', urlTemplate: 'https://example.com/{{id}}' },
        });
        assert.equal(res.status, 403);
        assert.ok(/跨站/.test(json(res).error));
      },
    ],
    [
      'SSE stream stays open and sends the hello event',
      async () => {
        const received = await new Promise((resolve, reject) => {
          const req = http.get(`${base}/api/events`, (res) => {
            assert.equal(res.statusCode, 200);
            assert.ok(/text\/event-stream/.test(res.headers['content-type']));
            let buffer = '';
            const timer = setTimeout(() => {
              req.destroy();
              resolve(buffer);
            }, 5000);
            res.on('data', (chunk) => {
              buffer += chunk.toString('utf8');
              if (buffer.indexOf('event: hello') >= 0) {
                clearTimeout(timer);
                req.destroy();
                resolve(buffer);
              }
            });
          });
          req.on('error', (err) => {
            if (err.code !== 'ECONNRESET') reject(err);
          });
        });
        assert.ok(/retry: 2000/.test(received));
        assert.ok(/event: hello/.test(received));
      },
    ],
    [
      'unknown resources return a JSON 404',
      async () => {
        const res = await request('GET', '/api/tables/does-not-exist');
        assert.equal(res.status, 404);
        assert.ok(/不存在/.test(json(res).error));
      },
    ],
    [
      'a table can be deleted together with its rows',
      async () => {
        const res = await request('DELETE', `/api/tables/${tableId}`);
        assert.equal(res.status, 200);
        const gone = await request('GET', `/api/tables/${tableId}`);
        assert.equal(gone.status, 404);
      },
    ],
  ],
});
