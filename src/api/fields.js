import * as store from '../db/store.js';
import { HttpError, sendJson } from '../http.js';
import { normalizeDataType, normalizeTemplate } from '../scraper/extract.js';
import { requireObject, requireString } from './helpers.js';

function normalizeFieldPayload(payload, creating) {
  const patch = {};
  if (creating || payload.name !== undefined) {
    patch.name = requireString(payload.name, '列名称', { max: 120 });
  }
  if (creating || payload.dataType !== undefined) {
    patch.dataType = normalizeDataType(payload.dataType);
  }
  if (creating || payload.template !== undefined) {
    let template;
    try {
      template = normalizeTemplate(payload.template || {});
    } catch (err) {
      throw new HttpError(400, `正则表达式无效：${err.message}`);
    }
    if (template.extract === 'js') {
      if (!template.code.trim()) throw new HttpError(400, 'JS 提取模式需要填写代码');
    } else if (!template.selector.trim()) {
      throw new HttpError(400, '请填写 CSS 选择器');
    }
    if (['attribute', 'property'].includes(template.extract) && !template.attribute.trim()) {
      throw new HttpError(400, '该提取模式需要填写属性名');
    }
    patch.template = template;
  }
  return patch;
}

export function registerFieldRoutes(router) {
  router.get('/api/tables/:id/fields', async ({ res, params }) => {
    const table = await store.getDataset(params.id);
    if (!table) throw new HttpError(404, '数据表不存在');
    sendJson(res, 200, { fields: await store.listFields(params.id) });
  });

  router.post('/api/tables/:id/fields', async ({ res, params, body }) => {
    const table = await store.getDataset(params.id);
    if (!table) throw new HttpError(404, '数据表不存在');
    const payload = requireObject(body);
    const patch = normalizeFieldPayload(payload, true);
    const field = await store.createField(params.id, patch);
    sendJson(res, 201, { field });
  });

  router.patch('/api/fields/:id', async ({ res, params, body }) => {
    const existing = await store.getField(params.id);
    if (!existing) throw new HttpError(404, '列不存在');
    const payload = requireObject(body);
    const patch = normalizeFieldPayload(payload, false);
    const field = await store.updateField(params.id, patch);
    sendJson(res, 200, { field });
  });

  router.delete('/api/fields/:id', async ({ res, params }) => {
    const existing = await store.getField(params.id);
    if (!existing) throw new HttpError(404, '列不存在');
    await store.deleteField(params.id);
    sendJson(res, 200, { ok: true });
  });

  router.put('/api/tables/:id/fields/order', async ({ res, params, body }) => {
    const table = await store.getDataset(params.id);
    if (!table) throw new HttpError(404, '数据表不存在');
    const payload = requireObject(body);
    if (!Array.isArray(payload.ids)) throw new HttpError(400, 'ids 必须是数组');
    const fields = await store.reorderFields(params.id, payload.ids.map(String));
    sendJson(res, 200, { fields });
  });
}
