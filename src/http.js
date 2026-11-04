import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export class Router {
  #routes = [];

  add(method, pattern, handler) {
    const keys = [];
    const source = pattern.replace(/\/:([A-Za-z0-9_]+)/g, (_, key) => {
      keys.push(key);
      return '/([^/]+)';
    });
    this.#routes.push({
      method,
      regex: new RegExp(`^${source}/?$`),
      keys,
      handler,
    });
    return this;
  }

  get(pattern, handler) {
    return this.add('GET', pattern, handler);
  }

  post(pattern, handler) {
    return this.add('POST', pattern, handler);
  }

  patch(pattern, handler) {
    return this.add('PATCH', pattern, handler);
  }

  put(pattern, handler) {
    return this.add('PUT', pattern, handler);
  }

  delete(pattern, handler) {
    return this.add('DELETE', pattern, handler);
  }

  match(method, pathname) {
    const wanted = method === 'HEAD' ? 'GET' : method;
    for (const route of this.#routes) {
      if (route.method !== wanted) continue;
      const match = pathname.match(route.regex);
      if (!match) continue;
      const params = {};
      route.keys.forEach((key, index) => {
        params[key] = decodeURIComponent(match[index + 1]);
      });
      return { handler: route.handler, params };
    }
    return null;
  }
}

export class EventHub {
  constructor() {
    this.clients = new Set();
    this.timer = setInterval(() => this.ping(), 20000);
    this.timer.unref?.();
  }

  subscribe(req, res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.isEventStream = true;
    res.write('retry: 2000\n\n');
    const client = { res };
    this.clients.add(client);
    this.send(client, 'hello', { ts: new Date().toISOString() });
    const cleanup = () => {
      this.clients.delete(client);
    };
    req.on('close', cleanup);
    req.on('error', cleanup);
    req.socket?.setTimeout?.(0);
  }

  send(client, type, data) {
    try {
      client.res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch {
      this.clients.delete(client);
    }
  }

  broadcast(type, data) {
    const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of this.clients) {
      try {
        client.res.write(payload);
      } catch {
        this.clients.delete(client);
      }
    }
  }

  ping() {
    for (const client of this.clients) {
      try {
        client.res.write(': ping\n\n');
      } catch {
        this.clients.delete(client);
      }
    }
  }

  close() {
    clearInterval(this.timer);
    for (const client of this.clients) {
      try {
        client.res.end();
      } catch {
        /* ignore */
      }
    }
    this.clients.clear();
  }
}

export function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

export function sendError(res, err) {
  const status = err instanceof HttpError ? err.status : 500;
  if (status >= 500) console.error('[http]', err);
  if (res.headersSent) {
    res.end();
    return;
  }
  sendJson(res, status, { error: err.message || '服务器内部错误', ...(err.details ? { details: err.details } : {}) });
}

function readBody(req, limit = 10 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new HttpError(413, '请求内容过大'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const buffer = Buffer.concat(chunks);
      if (!buffer.length) return resolve(null);
      const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      if (type === 'application/json') {
        try {
          resolve(JSON.parse(buffer.toString('utf8')));
        } catch {
          reject(new HttpError(400, 'JSON 格式错误'));
        }
        return;
      }
      if (type === 'application/x-www-form-urlencoded') {
        resolve(Object.fromEntries(new URLSearchParams(buffer.toString('utf8'))));
        return;
      }
      resolve(buffer);
    });
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

async function serveStatic(req, res, publicDir, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  if (rel === '/export' || rel === '/export/') rel = '/export.html';
  if (rel.endsWith('/')) rel += 'index.html';
  const filePath = path.join(publicDir, rel);
  const root = `${publicDir}${path.sep}`;
  if (!filePath.startsWith(root) || filePath.includes('\0')) return false;

  let stat;
  try {
    stat = await fsp.stat(filePath);
  } catch {
    return false;
  }
  if (!stat.isFile()) return false;

  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  });
  if (req.method === 'HEAD') {
    res.end();
    return true;
  }
  fs.createReadStream(filePath).pipe(res);
  return true;
}

export function createHttpServer({ router, publicDir, events, log = true }) {
  const server = http.createServer(async (req, res) => {
    const started = Date.now();
    const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');

    if (url.pathname === '/favicon.ico') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === 'OPTIONS') {
      // No cross-origin API access: local tools should not be readable by
      // arbitrary websites. Preflight therefore has no allow headers.
      res.writeHead(204, { Allow: 'GET, POST, PATCH, PUT, DELETE' });
      res.end();
      return;
    }

    const route = router.match(req.method, url.pathname);
    if (route) {
      try {
        const body = req.method === 'GET' || req.method === 'HEAD' ? null : await readBody(req);
        const ctx = {
          req,
          res,
          params: route.params,
          query: Object.fromEntries(url.searchParams),
          body,
          url,
        };
        await route.handler(ctx);
        if (!res.writableEnded && !res.isEventStream) res.end();
      } catch (err) {
        sendError(res, err);
      }
      if (log) {
        const status = res.statusCode;
        console.log(`${req.method} ${url.pathname}${url.search} → ${status} (${Date.now() - started}ms)`);
      }
      return;
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
      if (await serveStatic(req, res, publicDir, url.pathname)) {
        if (log) console.log(`${req.method} ${url.pathname} → ${res.statusCode} (${Date.now() - started}ms)`);
        return;
      }
    }

    sendJson(res, 404, { error: '未找到该资源' });
  });

  server.on('clientError', (err, socket) => {
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
  });

  return server;
}
