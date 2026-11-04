import * as store from '../db/store.js';
import { HttpError, sendJson } from '../http.js';
import { clampInt, optionalString, requireObject } from './helpers.js';

function normalizeVars(table, input = {}) {
  if (input !== null && (typeof input !== 'object' || Array.isArray(input))) {
    throw new HttpError(400, '变量值格式不正确');
  }
  const vars = {};
  const tableVars = Array.isArray(table.variables) ? table.variables : [];
  for (const variable of tableVars) {
    const raw = input?.[variable.key];
    const value = raw === undefined || raw === null ? variable.default ?? '' : raw;
    const text = String(value).trim();
    if (!text && variable.required !== false) {
      throw new HttpError(400, `缺少变量「${variable.label || variable.key}」`);
    }
    if (text.length > 2000) throw new HttpError(400, `变量「${variable.key}」的值过长`);
    vars[variable.key] = text;
  }
  for (const key of Object.keys(input || {})) {
    if (!tableVars.some((variable) => variable.key === key)) {
      throw new HttpError(400, `数据表没有定义变量「${key}」`);
    }
  }
  return vars;
}

export function registerEntryRoutes(router, ctx) {
  router.get('/api/tables/:id/entries', async ({ res, params }) => {
    const table = await store.getDataset(params.id);
    if (!table) throw new HttpError(404, '数据表不存在');
    sendJson(res, 200, { entries: await store.listEntries(params.id) });
  });

  router.post('/api/tables/:id/entries', async ({ res, params, body }) => {
    const table = await store.getDataset(params.id);
    if (!table) throw new HttpError(404, '数据表不存在');
    const payload = requireObject(body);
    const vars = normalizeVars(table, payload.vars || {});
    const entry = await store.createEntry(params.id, {
      vars,
      note: optionalString(payload.note, '备注', { max: 2000 }),
    });

    let run = null;
    let warning = null;
    if (payload.refresh !== false) {
      const fields = await store.listFields(params.id);
      if (fields.length) {
        run = await ctx.refresher.refreshEntries({ dataset: table, entries: [entry], source: 'manual' });
      } else {
        warning = '数据表还没有列模板，已保存该行但未抓取';
      }
    }
    sendJson(res, 201, { entry, run, warning });
  });

  router.get('/api/entries/:id', async ({ res, params }) => {
    const entry = await store.getEntry(params.id);
    if (!entry) throw new HttpError(404, '该行不存在');
    const [table, fields, total] = await Promise.all([
      store.getDataset(entry.datasetId),
      store.listFields(entry.datasetId),
      store.countSnapshots(entry.id),
    ]);
    sendJson(res, 200, { entry, table, fields, totalSnapshots: total });
  });

  router.patch('/api/entries/:id', async ({ res, params, body }) => {
    const entry = await store.getEntry(params.id);
    if (!entry) throw new HttpError(404, '该行不存在');
    const table = await store.getDataset(entry.datasetId);
    if (!table) throw new HttpError(404, '数据表不存在');
    const payload = requireObject(body);
    const patch = {};

    if (payload.vars !== undefined) {
      const vars = normalizeVars(table, payload.vars);
      const changed = JSON.stringify(vars) !== JSON.stringify(entry.vars);
      patch.vars = vars;
      if (changed) {
        // Cached values belong to the previous URL; force a fresh scrape.
        patch.latestValues = {};
        patch.latestStatus = 'idle';
        patch.status = 'idle';
        patch.error = null;
        patch.lastRunAt = null;
      }
    }
    if (payload.note !== undefined) patch.note = optionalString(payload.note, '备注', { max: 2000 });

    const updated = await store.updateEntry(params.id, patch);
    sendJson(res, 200, { entry: updated });
  });

  router.delete('/api/entries/:id', async ({ res, params }) => {
    const entry = await store.getEntry(params.id);
    if (!entry) throw new HttpError(404, '该行不存在');
    await store.deleteEntry(params.id);
    sendJson(res, 200, { ok: true });
  });

  router.post('/api/entries/:id/refresh', async ({ res, params, body }) => {
    const entry = await store.getEntry(params.id);
    if (!entry) throw new HttpError(404, '该行不存在');
    if (ctx.refresher.isEntryBusy(entry.id)) throw new HttpError(409, '该行正在刷新中，请稍候');
    const table = await store.getDataset(entry.datasetId);
    if (!table) throw new HttpError(404, '数据表不存在');
    const fields = await store.listFields(entry.datasetId);
    if (!fields.length) throw new HttpError(400, '请先添加至少一个列模板');
    const source = body && typeof body === 'object' && body.source ? String(body.source) : 'manual';
    const run = await ctx.refresher.refreshEntries({ dataset: table, entries: [entry], source });
    sendJson(res, 202, { run, entry });
  });

  router.get('/api/entries/:id/history', async ({ res, params, query }) => {
    const entry = await store.getEntry(params.id);
    if (!entry) throw new HttpError(404, '该行不存在');
    const limit = clampInt(query.limit, 30, 1, 100);
    const offset = clampInt(query.offset, 0, 0, 100000);
    const [snapshots, total, table, fields] = await Promise.all([
      store.listSnapshots(entry.id, { limit, offset }),
      store.countSnapshots(entry.id),
      store.getDataset(entry.datasetId),
      store.listFields(entry.datasetId),
    ]);
    sendJson(res, 200, { entry, snapshots, total, table, fields });
  });

  router.post('/api/runs/:id/cancel', async ({ res, params }) => {
    const cancelled = ctx.refresher.cancelRun(params.id);
    sendJson(res, cancelled ? 200 : 409, { ok: cancelled, run: await store.getRun(params.id) });
  });

  router.get('/api/runs/:id', async ({ res, params }) => {
    const run = await store.getRun(params.id);
    if (!run) throw new HttpError(404, '任务不存在');
    sendJson(res, 200, { run });
  });

  router.get('/api/tables/:id/runs', async ({ res, params, query }) => {
    const limit = clampInt(query.limit, 20, 1, 100);
    sendJson(res, 200, { runs: await store.listRuns({ datasetId: params.id, limit }) });
  });
}
