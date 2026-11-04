import { createDataset, createField, createEntry, getAppSetting, listDatasets, setAppSetting } from './store.js';

const SEED_KEY = 'demo_seeded_v1';

export const DEMO_FIELDS = [
  {
    name: '商品名称',
    dataType: 'text',
    template: { selector: '.product-title', extract: 'text' },
  },
  {
    name: '价格',
    dataType: 'number',
    template: { selector: '.price .amount', extract: 'text', regex: '[\\d,\\.]+', trim: true },
  },
  {
    name: '评分',
    dataType: 'number',
    template: { selector: '.rating .score', extract: 'attribute', attribute: 'data-score' },
  },
  {
    name: '评价数',
    dataType: 'number',
    template: { selector: '.rating .count', extract: 'text', regex: '[\\d,]+' },
  },
  {
    name: '库存',
    dataType: 'text',
    template: { selector: '.stock .label', extract: 'text' },
  },
  {
    name: '卖家',
    dataType: 'text',
    template: { selector: '.seller .name', extract: 'text' },
  },
  {
    name: '规格',
    dataType: 'text',
    template: { selector: '.specs li', extract: 'text', multiple: true },
  },
  {
    name: '商品图',
    dataType: 'image',
    template: { selector: '.gallery img', extract: 'src' },
  },
];

export const DEMO_VARIABLES = [
  { key: 'asin', label: '商品 ASIN', placeholder: 'B0DEMO001', default: 'B0DEMO001', required: true },
];

export function demoTablePayload(port) {
  return {
    name: '示例 · 商品价格追踪',
    icon: '🛍️',
    description: '内置演示数据表：抓取本地示例商店的商品页，价格每 12 秒浮动一次，适合验证模板与历史记录。',
    urlTemplate: `http://127.0.0.1:${port}/demo/market?asin={{asin}}`,
    variables: DEMO_VARIABLES,
    settings: {
      intervalSec: 0,
      waitUntil: 'domcontentloaded',
      waitMs: 0,
      timeoutMs: 30000,
      scroll: false,
      autoRefresh: true,
      actions: [],
    },
  };
}

export async function seedDemo({ port }) {
  const seeded = await getAppSetting(SEED_KEY);
  if (seeded) return null;
  const existing = await listDatasets();
  if (existing.length > 0) {
    await setAppSetting(SEED_KEY, new Date().toISOString());
    return null;
  }

  const table = await createDataset(demoTablePayload(port));
  for (const field of DEMO_FIELDS) {
    await createField(table.id, field);
  }
  for (const asin of ['B0DEMO001', 'B0DEMO002', 'B0DEMO003']) {
    await createEntry(table.id, { vars: { asin } });
  }
  await setAppSetting(SEED_KEY, new Date().toISOString());
  return table;
}
