import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initDatabase, closeDatabase } from '../src/db/index.js';
import * as store from '../src/db/store.js';

let dir;
let dbFile;

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'it-store-'));
  dbFile = path.join(dir, 'test.db');
  await initDatabase({ driver: 'sqlite', file: dbFile });
});

after(async () => {
  await closeDatabase();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('datasets can be created, updated and listed with counts', async () => {
  const table = await store.createDataset({
    name: '价格追踪',
    icon: '🛒',
    description: '测试',
    urlTemplate: 'https://example.com/item?asin={{asin}}',
    variables: [{ key: 'asin', label: 'ASIN', required: true }],
    settings: { intervalSec: 60 },
  });
  assert.ok(table.id);
  assert.equal(table.name, '价格追踪');
  assert.equal(table.variables[0].key, 'asin');
  assert.equal(table.settings.intervalSec, 60);

  const updated = await store.updateDataset(table.id, { name: '价格追踪 2', sortOrder: 5 });
  assert.equal(updated.name, '价格追踪 2');
  assert.equal(updated.sortOrder, 5);

  const list = await store.listDatasets();
  assert.equal(list.length, 1);
  assert.equal(list[0].entryCount, 0);
});

test('fields keep their order and can be reordered', async () => {
  const table = (await store.listDatasets())[0];
  const a = await store.createField(table.id, { name: '价格', dataType: 'number', template: { extract: 'text', selector: '.price' } });
  const b = await store.createField(table.id, { name: '库存', dataType: 'text', template: { extract: 'text', selector: '.stock' } });
  let fields = await store.listFields(table.id);
  assert.deepEqual(fields.map((field) => field.name), ['价格', '库存']);

  await store.reorderFields(table.id, [b.id, a.id]);
  fields = await store.listFields(table.id);
  assert.deepEqual(fields.map((field) => field.name), ['库存', '价格']);

  await store.deleteField(b.id);
  fields = await store.listFields(table.id);
  assert.equal(fields.length, 1);
  assert.equal(fields[0].name, '价格');
});

test('entries store variables and snapshots update the latest values', async () => {
  const table = (await store.listDatasets())[0];
  const fields = await store.listFields(table.id);
  const entry = await store.createEntry(table.id, { vars: { asin: 'B0TEST' }, note: '备注' });
  assert.equal(entry.vars.asin, 'B0TEST');
  assert.equal(entry.status, 'idle');

  const first = await store.saveSnapshot({
    entryId: entry.id,
    datasetId: table.id,
    values: { [fields[0].id]: 100 },
    status: 'ok',
    source: 'manual',
    durationMs: 42,
  });
  assert.ok(first.id);

  let refreshed = await store.getEntry(entry.id);
  assert.equal(refreshed.latestValues[fields[0].id], 100);
  assert.equal(refreshed.latestStatus, 'ok');
  assert.equal(refreshed.status, 'ok');
  assert.ok(refreshed.lastRunAt);

  await new Promise((resolve) => setTimeout(resolve, 5));
  await store.saveSnapshot({
    entryId: entry.id,
    datasetId: table.id,
    values: { [fields[0].id]: 80 },
    errors: { [fields[0].id]: '没有匹配到元素' },
    status: 'partial',
    source: 'schedule',
    durationMs: 12,
  });
  refreshed = await store.getEntry(entry.id);
  assert.equal(refreshed.latestValues[fields[0].id], 80);
  assert.equal(refreshed.latestStatus, 'partial');

  assert.equal(await store.countSnapshots(entry.id), 2);
  const history = await store.listSnapshots(entry.id, { limit: 10 });
  assert.equal(history[0].values[fields[0].id], 80);
  assert.equal(history[0].source, 'schedule');
  assert.equal(history[1].values[fields[0].id], 100);

  const all = await store.listSnapshotsForDataset(table.id);
  assert.equal(all.length, 2);
  const future = await store.listSnapshotsForDataset(table.id, { since: new Date(Date.now() + 60_000).toISOString() });
  assert.equal(future.length, 0);

  const listed = await store.listDatasets();
  assert.equal(listed[0].entryCount, 1);
  assert.equal(listed[0].lastRunAt, refreshed.lastRunAt);
});

test('deleting an entry cascades its snapshots', async () => {
  const table = (await store.listDatasets())[0];
  const entry = (await store.listEntries(table.id))[0];
  await store.deleteEntry(entry.id);
  assert.equal(await store.countSnapshots(entry.id), 0);
  assert.equal((await store.listEntries(table.id)).length, 0);
});

test('runs and app settings persist', async () => {
  const table = (await store.listDatasets())[0];
  const run = await store.createRun({ datasetId: table.id, source: 'manual', total: 2 });
  assert.equal(run.status, 'running');
  run.done = 1;
  run.failed = 1;
  run.status = 'done';
  run.finishedAt = new Date().toISOString();
  await store.updateRun(run);
  const fetched = await store.getRun(run.id);
  assert.equal(fetched.done, 1);
  assert.equal(fetched.failed, 1);
  assert.equal(fetched.status, 'done');

  await store.setAppSetting('demo_seeded_v1', '1');
  assert.equal(await store.getAppSetting('demo_seeded_v1'), '1');

  const stats = await store.getStats();
  assert.equal(stats.datasets, 1);
  assert.ok(stats.runs >= 1);
});

test('deleting a dataset removes fields and entries', async () => {
  const table = (await store.listDatasets())[0];
  await store.deleteDataset(table.id);
  assert.equal(await store.getDataset(table.id), null);
  assert.equal((await store.listFields(table.id)).length, 0);
  assert.equal((await store.listEntries(table.id)).length, 0);
});
