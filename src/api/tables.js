import * as store from '../db/store.js';
import { HttpError, sendJson } from '../http.js';
import { normalizeTemplate, normalizeDataType } from '../scraper/extract.js';
import { humanizeError, scrapeEntry } from '../scraper/runner.js';
import {
  normalizeSettings,
  normalizeVariables,
  optionalString,
  requireObject,
  requireString,
  sanitizeIcon,
  validateUrlTemplate,
} from './helpers.js';

export function registerTableRoutes(router, ctx) {
  const { getConfig, browser } = ctx;

  router.get('/api/tables', async ({ res }) => {
    sendJson(res, 200, { tables: await store.listDatasets() });
  });

  router.post('/api/tables', async ({ res, body }) => {
    const payload = requireObject(body);
    const name = requireString(payload.name, '数据表名称', { max: 120 });
    const table = await store.createDataset({
      name,
      icon: sanitizeIcon(payload.icon),
      description: optionalString(payload.description, '描述', { max: 2000 }),
      urlTemplate: validateUrlTemplate(payload.urlTemplate),
      variables: normalizeVariables(payload.variables),
      settings: normalizeSettings(payload.settings),
    });
    sendJson(res, 201, { table });
  });

  router.get('/api/tables/:id', async ({ res, params }) => {
    const table = await store.getDataset(params.id);
    if (!table) throw new HttpError(404, '数据表不存在');
    const [fields, entries, runs] = await Promise.all([
      store.listFields(params.id),
      store.listEntries(params.id),
      store.listRuns({ datasetId: params.id, limit: 10 }),
    ]);
    sendJson(res, 200, { table, fields, entries, runs });
  });

  router.patch('/api/tables/:id', async ({ res, params, body }) => {
    const existing = await store.getDataset(params.id);
    if (!existing) throw new HttpError(404, '数据表不存在');
    const payload = requireObject(body);
    const patch = {};
    if (payload.name !== undefined) patch.name = requireString(payload.name, '数据表名称', { max: 120 });
    if (payload.icon !== undefined) patch.icon = sanitizeIcon(payload.icon);
    if (payload.description !== undefined) patch.description = optionalString(payload.description, '描述', { max: 2000 });
    if (payload.urlTemplate !== undefined) patch.urlTemplate = validateUrlTemplate(payload.urlTemplate);
    if (payload.variables !== undefined) patch.variables = normalizeVariables(payload.variables);
    if (payload.settings !== undefined) patch.settings = normalizeSettings(payload.settings);
    if (payload.sortOrder !== undefined) patch.sortOrder = Number(payload.sortOrder) || 0;
    const table = await store.updateDataset(params.id, patch);
    sendJson(res, 200, { table });
  });

  router.delete('/api/tables/:id', async ({ res, params }) => {
    const existing = await store.getDataset(params.id);
    if (!existing) throw new HttpError(404, '数据表不存在');
    await store.deleteDataset(params.id);
    sendJson(res, 200, { ok: true });
  });

  router.post('/api/tables/:id/refresh', async ({ res, params, body }) => {
    const table = await store.getDataset(params.id);
    if (!table) throw new HttpError(404, '数据表不存在');
    const fields = await store.listFields(params.id);
    if (!fields.length) throw new HttpError(400, '请先添加至少一个列模板');
    const payload = body && typeof body === 'object' ? body : {};
    const entryIds = Array.isArray(payload.entryIds) ? payload.entryIds.map(String) : null;
    let entries = await store.listEntries(params.id);
    if (entryIds) entries = entries.filter((entry) => entryIds.includes(entry.id));
    if (!entries.length) throw new HttpError(400, '没有可刷新的行');
    const run = await ctx.refresher.refreshEntries({ dataset: table, entries, source: payload.source || 'manual' });
    sendJson(res, 202, { run });
  });

  router.post('/api/tables/:id/preview', async ({ res, params, body }) => {
    const table = await store.getDataset(params.id);
    if (!table) throw new HttpError(404, '数据表不存在');
    const payload = requireObject(body);
    const vars = payload.vars && typeof payload.vars === 'object' ? payload.vars : {};

    const dataset = {
      ...table,
      urlTemplate: payload.urlTemplate !== undefined ? validateUrlTemplate(payload.urlTemplate) : table.urlTemplate,
      settings: payload.settings !== undefined ? normalizeSettings(payload.settings) : table.settings,
    };

    let fields;
    if (payload.field && payload.field.template) {
      let template;
      try {
        template = normalizeTemplate(payload.field.template);
      } catch (err) {
        throw new HttpError(400, `正则表达式无效：${err.message}`);
      }
      fields = [
        {
          id: 'draft',
          name: payload.field.name || '预览',
          dataType: normalizeDataType(payload.field.dataType),
          template,
        },
      ];
    } else {
      const all = await store.listFields(params.id);
      const ids = Array.isArray(payload.fieldIds) ? payload.fieldIds.map(String) : null;
      fields = ids ? all.filter((field) => ids.includes(field.id)) : all;
    }
    if (!fields.length) throw new HttpError(400, '没有可预览的列模板');

    const started = Date.now();
    let page;
    try {
      page = await browser.newPage();
      const result = await scrapeEntry(page, {
        dataset,
        vars,
        fields,
        timeoutMs: dataset.settings?.timeoutMs || getConfig().scraper.timeoutMs,
      });
      const failed = Object.keys(result.errors).length;
      const status = failed === 0 ? 'ok' : failed === fields.length ? 'error' : 'partial';
      sendJson(res, 200, {
        ...result,
        status,
        durationMs: Date.now() - started,
        vars,
      });
    } catch (err) {
      throw new HttpError(422, `预览失败：${humanizeError(err)}`);
    } finally {
      if (page) await page.close().catch(() => {});
    }
  });

  router.get('/api/tables/:id/template', async ({ res, params }) => {
    const table = await store.getDataset(params.id);
    if (!table) throw new HttpError(404, '数据表不存在');
    const fields = await store.listFields(params.id);
    const payload = {
      kind: 'internet-tracker/template',
      version: 1,
      table: {
        name: table.name,
        icon: table.icon,
        description: table.description,
        urlTemplate: table.urlTemplate,
        variables: table.variables,
        settings: table.settings,
      },
      fields: fields.map((field) => ({
        name: field.name,
        dataType: field.dataType,
        template: field.template,
      })),
    };
    const filename = `${table.name.replace(/[\\/:*?"<>|\s]+/g, '_') || 'template'}.json`;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/[^\x20-\x7e]/g, '_')}"`);
    res.end(JSON.stringify(payload, null, 2));
  });

  router.post('/api/tables/import', async ({ res, body }) => {
    const template = requireObject(body, '模板');
    const tablePart = template.table && typeof template.table === 'object' ? template.table : template;
    if (!Array.isArray(template.fields) || !template.fields.length) {
      throw new HttpError(400, '模板文件里没有列定义（fields）');
    }
    const name = requireString(tablePart.name || '导入的数据表', '数据表名称', { max: 120 });
    const table = await store.createDataset({
      name,
      icon: sanitizeIcon(tablePart.icon),
      description: optionalString(tablePart.description, '描述', { max: 2000 }),
      urlTemplate: validateUrlTemplate(tablePart.urlTemplate),
      variables: normalizeVariables(tablePart.variables),
      settings: normalizeSettings(tablePart.settings),
    });
    const created = [];
    for (const field of template.fields.slice(0, 60)) {
      if (!field || typeof field !== 'object') continue;
      let fieldTemplate;
      try {
        fieldTemplate = normalizeTemplate(field.template || {});
      } catch (err) {
        throw new HttpError(400, `列「${field.name}」的正则无效：${err.message}`);
      }
      created.push(
        await store.createField(table.id, {
          name: requireString(field.name, '列名称', { max: 120 }),
          dataType: normalizeDataType(field.dataType),
          template: fieldTemplate,
        }),
      );
    }
    sendJson(res, 201, { table: await store.getDataset(table.id), fields: created });
  });
}
