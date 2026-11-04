import { randomUUID } from 'node:crypto';
import * as store from '../db/store.js';
import { extractField, interpolate, interpolationMissing } from './extract.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function humanizeError(err) {
  const raw = String(err?.message || err || '未知错误');
  if (/net::ERR_NAME_NOT_RESOLVED/.test(raw)) return '域名解析失败（ERR_NAME_NOT_RESOLVED）';
  if (/net::ERR_CONNECTION_REFUSED/.test(raw)) return '目标站点拒绝连接（ERR_CONNECTION_REFUSED）';
  if (/net::ERR_CONNECTION_TIMED_OUT|Timeout of \d+ms exceeded|Navigation timeout/i.test(raw)) return '页面加载超时';
  if (/net::ERR_CERT/.test(raw)) return 'HTTPS 证书错误';
  if (/net::ERR_ABORTED/.test(raw)) return '页面加载被中断（ERR_ABORTED）';
  if (/net::ERR_INTERNET_DISCONNECTED/.test(raw)) return '网络未连接';
  if (/net::ERR_HTTP_RESPONSE_CODE_FAILURE/.test(raw)) return '目标站点返回错误状态码';
  if (/Target closed|Session closed|Protocol error/i.test(raw)) return '浏览器页面意外关闭';
  return raw.split('\n')[0].slice(0, 800);
}

export function buildUrl(dataset, vars = {}) {
  const template = String(dataset.urlTemplate || '').trim();
  if (!template) throw new Error('该数据表还没有设置 URL 模板');
  const missing = interpolationMissing(template, vars);
  if (missing.length) throw new Error(`缺少变量：${missing.join('、')}`);
  const url = interpolate(template, vars, { encode: true });
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`URL 无效：${url}`);
  }
  if (!/^https?:$/.test(parsed.protocol)) throw new Error('只支持 http/https 网址');
  return parsed.href;
}

function actionConfig(action = {}, vars = {}) {
  return {
    type: action.type,
    selector: interpolate(action.selector || '', vars, { encode: false }),
    value: interpolate(action.value ?? action.text ?? '', vars, { encode: false }),
    key: action.key || 'Enter',
    ms: Number(action.ms) || 0,
    x: Number(action.x) || 0,
    y: Number(action.y) || 0,
    code: interpolate(action.code || '', vars, { encode: false }),
    delayMs: Number(action.delayMs ?? 80),
  };
}

async function runAction(page, action, vars, timeout) {
  const a = actionConfig(action, vars);
  switch (a.type) {
    case 'click':
      await page.click(a.selector);
      break;
    case 'type':
      await page.type(a.selector, a.value, { delay: 20 });
      break;
    case 'fill':
      await page.$eval(
        a.selector,
        (el, value) => {
          el.value = value;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        },
        a.value,
      );
      break;
    case 'press':
      await page.keyboard.press(a.key);
      break;
    case 'wait':
      await sleep(a.ms || 500);
      break;
    case 'waitSelector':
      await page.waitForSelector(a.selector, { timeout: a.ms || timeout });
      break;
    case 'scrollTo':
      await page.$eval(a.selector, (el) => el.scrollIntoView({ block: 'center' }));
      break;
    case 'scroll':
      await page.evaluate(({ x, y }) => window.scrollBy(x, y), { x: a.x, y: a.y || 600 });
      break;
    case 'select':
      await page.select(a.selector, a.value);
      break;
    case 'eval':
      await page.evaluate((code) => {
        // eslint-disable-next-line no-new-func
        new Function(code)();
      }, a.code);
      break;
    default:
      throw new Error(`未知的页面动作：${a.type}`);
  }
  if (a.delayMs > 0) await sleep(a.delayMs);
}

async function autoScroll(page) {
  for (let i = 0; i < 30; i += 1) {
    const atBottom = await page.evaluate(
      () => window.scrollY + window.innerHeight >= (document.documentElement?.scrollHeight || 0) - 8,
    );
    if (atBottom) break;
    await page.evaluate(() => window.scrollBy(0, 700));
    await sleep(120);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
}

/**
 * Navigate a page for a dataset + entry and run every field template.
 * Returns extracted values keyed by field id and per-field errors.
 */
export async function scrapeEntry(page, { dataset, vars, fields, timeoutMs }) {
  const settings = dataset.settings || {};
  const url = buildUrl(dataset, vars);
  const timeout = Number(settings.timeoutMs) || Number(timeoutMs) || 30000;
  const waitUntil = ['load', 'domcontentloaded', 'networkidle0', 'networkidle2'].includes(settings.waitUntil)
    ? settings.waitUntil
    : 'domcontentloaded';

  await page.goto(url, { waitUntil, timeout });

  if (settings.waitForSelector) {
    const selector = interpolate(settings.waitForSelector, vars, { encode: false });
    try {
      await page.waitForSelector(selector, { timeout: Math.min(timeout, 20000) });
    } catch {
      // Missing optional selector should not abort the whole run; field
      // extraction will report what is actually broken.
    }
  }
  if (Number(settings.waitMs) > 0) await sleep(Math.min(Number(settings.waitMs), 60000));
  for (const action of Array.isArray(settings.actions) ? settings.actions : []) {
    await runAction(page, action, vars, timeout);
  }
  if (settings.scroll) await autoScroll(page);

  const values = {};
  const errors = {};
  for (const field of fields) {
    try {
      values[field.id] = await extractField(page, field, { vars, url: page.url() });
    } catch (err) {
      values[field.id] = null;
      errors[field.id] = humanizeError(err);
    }
  }
  return { values, errors, url: page.url(), title: await page.title().catch(() => '') };
}

export class RefreshService {
  constructor({ getConfig, events, browser, logger = console }) {
    this.getConfig = getConfig;
    this.events = events;
    this.browser = browser;
    this.logger = logger;
    this.active = 0;
    this.waiters = [];
    this.busyEntries = new Set();
    this.runs = new Map();
  }

  get limit() {
    const configured = Number(this.getConfig().scraper.concurrency) || 3;
    return Math.max(1, Math.min(10, configured));
  }

  isEntryBusy(entryId) {
    return this.busyEntries.has(entryId);
  }

  isDatasetBusy(datasetId) {
    for (const run of this.runs.values()) {
      if (run.datasetId === datasetId && run.status === 'running') return true;
    }
    return false;
  }

  #acquire() {
    if (this.active < this.limit) {
      this.active += 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  #release() {
    const next = this.waiters.shift();
    if (next) next();
    else this.active = Math.max(0, this.active - 1);
  }

  cancelRun(runId) {
    const run = this.runs.get(runId);
    if (!run || run.status !== 'running') return false;
    run.cancelled = true;
    this.events.broadcast('run:update', run);
    return true;
  }

  /**
   * Queue a refresh for a set of entries. Resolves with the run record as soon
   * as the queue is created; progress is delivered through SSE + runs API.
   */
  async refreshEntries({ dataset, entries, source = 'manual' }) {
    const list = (entries || []).filter((entry) => entry && !this.busyEntries.has(entry.id));
    const run = {
      id: randomUUID(),
      datasetId: dataset.id,
      source,
      status: 'running',
      total: list.length,
      done: 0,
      failed: 0,
      skipped: (entries || []).length - list.length,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      error: null,
      cancelled: false,
    };
    await store.createRun(run);
    this.runs.set(run.id, run);
    this.events.broadcast('run:update', run);

    if (!list.length) {
      run.status = 'done';
      run.finishedAt = new Date().toISOString();
      await store.updateRun(run);
      this.runs.delete(run.id);
      this.events.broadcast('run:update', run);
      return run;
    }

    const fields = await store.listFields(dataset.id);
    const timeoutMs = this.getConfig().scraper.timeoutMs;

    const worker = async () => {
      for (;;) {
        if (run.cancelled) return;
        const entry = list.shift();
        if (!entry) return;
        await this.#runOne(run, dataset, fields, entry, source, timeoutMs);
      }
    };

    const workers = Array.from({ length: Math.min(this.limit, list.length) }, () => worker());
    Promise.all(workers)
      .then(async () => {
        run.status = run.cancelled ? 'cancelled' : run.failed >= run.total && run.total > 0 ? 'error' : 'done';
        run.finishedAt = new Date().toISOString();
        await store.updateRun(run);
        this.runs.delete(run.id);
        this.events.broadcast('run:update', run);
        this.events.broadcast('datasets:changed', { datasetId: dataset.id });
      })
      .catch(async (err) => {
        run.status = 'error';
        run.error = humanizeError(err);
        run.finishedAt = new Date().toISOString();
        await store.updateRun(run).catch(() => {});
        this.runs.delete(run.id);
        this.events.broadcast('run:update', run);
        this.logger.error('[refresh] run failed:', err);
      });

    return run;
  }

  async #runOne(run, dataset, fields, entry, source, timeoutMs) {
    await this.#acquire();
    this.busyEntries.add(entry.id);
    const startedAt = Date.now();
    let page = null;
    let values = {};
    let errors = {};
    let status = 'ok';
    let error = null;

    try {
      const running = { ...entry, status: 'running', error: null };
      this.events.broadcast('entry:update', running);

      page = await this.browser.newPage();
      const result = await scrapeEntry(page, { dataset, vars: entry.vars || {}, fields, timeoutMs });
      values = result.values;
      errors = result.errors;
      const total = fields.length;
      const failed = Object.keys(errors).length;
      if (total === 0) {
        status = 'error';
        error = '该数据表还没有列模板，无法提取数据';
      } else if (failed === total) {
        status = 'error';
        error = '所有列都提取失败，请检查选择器或页面结构';
      } else if (failed > 0) {
        status = 'partial';
      }
    } catch (err) {
      status = 'error';
      error = humanizeError(err);
      this.logger.warn(`[refresh] ${dataset.name} / ${entry.id} 失败：${error}`);
    } finally {
      if (page) await page.close().catch(() => {});
      this.busyEntries.delete(entry.id);
      this.#release();
    }

    const snapshot = {
      id: randomUUID(),
      entryId: entry.id,
      datasetId: dataset.id,
      values,
      errors,
      status,
      error,
      source,
      durationMs: Date.now() - startedAt,
      capturedAt: new Date().toISOString(),
    };

    try {
      await store.saveSnapshot(snapshot);
      const updated = await store.getEntry(entry.id);
      run.done += 1;
      if (status === 'error') run.failed += 1;
      this.events.broadcast('entry:update', updated);
      this.events.broadcast('run:update', run);
    } catch (err) {
      run.done += 1;
      run.failed += 1;
      this.logger.error('[refresh] 保存快照失败:', err);
    }
  }
}
