const { randomUUID, coalesce } = require('../util');
const { getDb } = require('./index');
const nowIso = () => new Date().toISOString();
const json = (value) => JSON.stringify(coalesce(value, null));
const parse = (value, fallback) => {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

/* ------------------------------------------------------------------ datasets */

function mapDataset(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    icon: row.icon || '📊',
    description: row.description || '',
    urlTemplate: row.url_template || '',
    variables: parse(row.variables, []),
    settings: parse(row.settings, {}),
    sortOrder: Number(coalesce(row.sort_order, 0)),
    lastAutoAt: row.last_auto_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    entryCount: row.entry_count !== undefined ? Number(row.entry_count) : undefined,
    errorCount: row.error_count !== undefined ? Number(row.error_count) : undefined,
    lastRunAt: row.last_run_at || null,
  };
}

async function listDatasets() {
  const db = getDb();
  const rows = await db.all(
    `SELECT d.*,
       (SELECT COUNT(*) FROM entries e WHERE e.dataset_id = d.id) AS entry_count,
       (SELECT COUNT(*) FROM entries e WHERE e.dataset_id = d.id AND e.latest_status = 'error') AS error_count,
       (SELECT MAX(e.last_run_at) FROM entries e WHERE e.dataset_id = d.id) AS last_run_at
     FROM datasets d
     ORDER BY d.sort_order ASC, d.created_at ASC`,
  );
  return rows.map(mapDataset);
}

async function getDataset(id) {
  const db = getDb();
  const row = await db.get(
    `SELECT d.*,
       (SELECT COUNT(*) FROM entries e WHERE e.dataset_id = d.id) AS entry_count,
       (SELECT COUNT(*) FROM entries e WHERE e.dataset_id = d.id AND e.latest_status = 'error') AS error_count,
       (SELECT MAX(e.last_run_at) FROM entries e WHERE e.dataset_id = d.id) AS last_run_at
     FROM datasets d WHERE d.id = ?`,
    [id],
  );
  return mapDataset(row);
}

async function createDataset(data) {
  const db = getDb();
  const id = data.id || randomUUID();
  const timestamp = nowIso();
  const next = await db.get('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM datasets');
  await db.run(
    `INSERT INTO datasets (id, name, icon, description, url_template, variables, settings, sort_order, last_auto_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.name,
      data.icon || '📊',
      data.description || '',
      data.urlTemplate || '',
      json(data.variables || []),
      json(data.settings || {}),
      Number(coalesce(data.sortOrder, coalesce(next && next.next_order, 0))),
      data.lastAutoAt || null,
      timestamp,
      timestamp,
    ],
  );
  return getDataset(id);
}

const DATASET_COLUMNS = {
  name: 'name',
  icon: 'icon',
  description: 'description',
  urlTemplate: 'url_template',
  variables: 'variables',
  settings: 'settings',
  sortOrder: 'sort_order',
  lastAutoAt: 'last_auto_at',
};

async function updateDataset(id, patch = {}) {
  const db = getDb();
  const sets = [];
  const params = [];
  for (const [key, column] of Object.entries(DATASET_COLUMNS)) {
    if (patch[key] === undefined) continue;
    const value = ['variables', 'settings'].includes(key) ? json(patch[key]) : patch[key];
    sets.push(`${column} = ?`);
    params.push(value);
  }
  if (!sets.length) return getDataset(id);
  sets.push('updated_at = ?');
  params.push(nowIso(), id);
  await db.run(`UPDATE datasets SET ${sets.join(', ')} WHERE id = ?`, params);
  return getDataset(id);
}

async function deleteDataset(id) {
  const db = getDb();
  await db.run('DELETE FROM datasets WHERE id = ?', [id]);
}

/* -------------------------------------------------------------------- fields */

function mapField(row) {
  return {
    id: row.id,
    datasetId: row.dataset_id,
    name: row.name,
    dataType: row.data_type || 'text',
    template: parse(row.template, {}),
    sortOrder: Number(coalesce(row.sort_order, 0)),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listFields(datasetId) {
  const db = getDb();
  const rows = await db.all('SELECT * FROM fields WHERE dataset_id = ? ORDER BY sort_order ASC, created_at ASC', [
    datasetId,
  ]);
  return rows.map(mapField);
}

async function getField(id) {
  const db = getDb();
  return mapField(await db.get('SELECT * FROM fields WHERE id = ?', [id]));
}

async function createField(datasetId, data) {
  const db = getDb();
  const id = data.id || randomUUID();
  const timestamp = nowIso();
  const next = await db.get(
    'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM fields WHERE dataset_id = ?',
    [datasetId],
  );
  await db.run(
    `INSERT INTO fields (id, dataset_id, name, data_type, template, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      datasetId,
      data.name,
      data.dataType || 'text',
      json(data.template || {}),
      Number(coalesce(data.sortOrder, coalesce(next && next.next_order, 0))),
      timestamp,
      timestamp,
    ],
  );
  return getField(id);
}

const FIELD_COLUMNS = { name: 'name', dataType: 'data_type', template: 'template', sortOrder: 'sort_order' };

async function updateField(id, patch = {}) {
  const db = getDb();
  const sets = [];
  const params = [];
  for (const [key, column] of Object.entries(FIELD_COLUMNS)) {
    if (patch[key] === undefined) continue;
    sets.push(`${column} = ?`);
    params.push(key === 'template' ? json(patch[key]) : patch[key]);
  }
  if (!sets.length) return getField(id);
  sets.push('updated_at = ?');
  params.push(nowIso(), id);
  await db.run(`UPDATE fields SET ${sets.join(', ')} WHERE id = ?`, params);
  return getField(id);
}

async function deleteField(id) {
  const db = getDb();
  await db.run('DELETE FROM fields WHERE id = ?', [id]);
}

async function reorderFields(datasetId, ids = []) {
  const db = getDb();
  const timestamp = nowIso();
  let order = 0;
  for (const id of ids) {
    await db.run('UPDATE fields SET sort_order = ?, updated_at = ? WHERE id = ? AND dataset_id = ?', [
      order++,
      timestamp,
      id,
      datasetId,
    ]);
  }
  return listFields(datasetId);
}

/* ------------------------------------------------------------------- entries */

function mapEntry(row) {
  if (!row) return null;
  return {
    id: row.id,
    datasetId: row.dataset_id,
    vars: parse(row.vars, {}),
    note: row.note || '',
    status: row.status || 'idle',
    error: row.error || null,
    latestValues: parse(row.latest_values, {}),
    latestStatus: row.latest_status || 'idle',
    lastRunAt: row.last_run_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listEntries(datasetId) {
  const db = getDb();
  const rows = await db.all('SELECT * FROM entries WHERE dataset_id = ? ORDER BY created_at ASC', [datasetId]);
  return rows.map(mapEntry);
}

async function getEntry(id) {
  const db = getDb();
  return mapEntry(await db.get('SELECT * FROM entries WHERE id = ?', [id]));
}

async function createEntry(datasetId, data) {
  const db = getDb();
  const id = data.id || randomUUID();
  const timestamp = nowIso();
  await db.run(
    `INSERT INTO entries (id, dataset_id, vars, note, status, error, latest_values, latest_status, last_run_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      datasetId,
      json(data.vars || {}),
      data.note || '',
      data.status || 'idle',
      data.error || null,
      json(data.latestValues || {}),
      data.latestStatus || 'idle',
      data.lastRunAt || null,
      timestamp,
      timestamp,
    ],
  );
  return getEntry(id);
}

const ENTRY_COLUMNS = {
  vars: 'vars',
  note: 'note',
  status: 'status',
  error: 'error',
  latestValues: 'latest_values',
  latestStatus: 'latest_status',
  lastRunAt: 'last_run_at',
};

async function updateEntry(id, patch = {}) {
  const db = getDb();
  const sets = [];
  const params = [];
  for (const [key, column] of Object.entries(ENTRY_COLUMNS)) {
    if (patch[key] === undefined) continue;
    sets.push(`${column} = ?`);
    params.push(['vars', 'latestValues'].includes(key) ? json(patch[key]) : patch[key]);
  }
  if (!sets.length) return getEntry(id);
  sets.push('updated_at = ?');
  params.push(nowIso(), id);
  await db.run(`UPDATE entries SET ${sets.join(', ')} WHERE id = ?`, params);
  return getEntry(id);
}

async function deleteEntry(id) {
  const db = getDb();
  await db.run('DELETE FROM entries WHERE id = ?', [id]);
}

/* ----------------------------------------------------------------- snapshots */

function mapSnapshot(row) {
  return {
    id: row.id,
    entryId: row.entry_id,
    datasetId: row.dataset_id,
    values: parse(row.values_json, {}),
    errors: parse(row.errors_json, {}),
    status: row.status,
    error: row.error || null,
    source: row.source,
    durationMs: row.duration_ms === null || row.duration_ms === undefined ? null : Number(row.duration_ms),
    capturedAt: row.captured_at,
  };
}

async function saveSnapshot(snapshot) {
  const db = getDb();
  const capturedAt = snapshot.capturedAt || nowIso();
  const id = snapshot.id || randomUUID();
  await db.run(
    `INSERT INTO snapshots (id, entry_id, dataset_id, values_json, errors_json, status, error, source, duration_ms, captured_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      snapshot.entryId,
      snapshot.datasetId,
      json(snapshot.values || {}),
      json(snapshot.errors || {}),
      snapshot.status,
      snapshot.error || null,
      snapshot.source || 'manual',
      coalesce(snapshot.durationMs, null),
      capturedAt,
    ],
  );
  await db.run(
    `UPDATE entries SET latest_values = ?, latest_status = ?, last_run_at = ?, status = ?, error = ?, updated_at = ?
     WHERE id = ?`,
    [json(snapshot.values || {}), snapshot.status, capturedAt, snapshot.status, snapshot.error || null, capturedAt, snapshot.entryId],
  );
  return mapSnapshot({
    id,
    entry_id: snapshot.entryId,
    dataset_id: snapshot.datasetId,
    values_json: json(snapshot.values || {}),
    errors_json: json(snapshot.errors || {}),
    status: snapshot.status,
    error: snapshot.error,
    source: snapshot.source,
    duration_ms: snapshot.durationMs,
    captured_at: capturedAt,
  });
}

async function listSnapshots(entryId, { limit = 30, offset = 0 } = {}) {
  const db = getDb();
  const rows = await db.all(
    'SELECT * FROM snapshots WHERE entry_id = ? ORDER BY captured_at DESC LIMIT ? OFFSET ?',
    [entryId, Number(limit), Number(offset)],
  );
  return rows.map(mapSnapshot);
}

async function countSnapshots(entryId) {
  const db = getDb();
  const row = await db.get('SELECT COUNT(*) AS total FROM snapshots WHERE entry_id = ?', [entryId]);
  return Number(coalesce(row && row.total, 0));
}

async function listSnapshotsForDataset(datasetId, { since, until } = {}) {
  const db = getDb();
  const where = ['dataset_id = ?'];
  const params = [datasetId];
  if (since) {
    where.push('captured_at >= ?');
    params.push(since);
  }
  if (until) {
    where.push('captured_at <= ?');
    params.push(until);
  }
  const rows = await db.all(
    `SELECT * FROM snapshots WHERE ${where.join(' AND ')} ORDER BY captured_at ASC`,
    params,
  );
  return rows.map(mapSnapshot);
}

/* ---------------------------------------------------------------------- runs */

function mapRun(row) {
  if (!row) return null;
  return {
    id: row.id,
    datasetId: row.dataset_id,
    source: row.source,
    status: row.status,
    total: Number(coalesce(row.total, 0)),
    done: Number(coalesce(row.done_count, 0)),
    failed: Number(coalesce(row.failed_count, 0)),
    startedAt: row.started_at,
    finishedAt: row.finished_at || null,
    error: row.error || null,
  };
}

async function createRun(run) {
  const db = getDb();
  const id = run.id || randomUUID();
  await db.run(
    `INSERT INTO runs (id, dataset_id, source, status, total, done_count, failed_count, started_at, finished_at, error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      run.datasetId || null,
      run.source || 'manual',
      run.status || 'running',
      Number(coalesce(run.total, 0)),
      Number(coalesce(run.done, 0)),
      Number(coalesce(run.failed, 0)),
      run.startedAt || nowIso(),
      run.finishedAt || null,
      run.error || null,
    ],
  );
  return getRun(id);
}

async function updateRun(run) {
  const db = getDb();
  await db.run(
    `UPDATE runs SET status = ?, total = ?, done_count = ?, failed_count = ?, finished_at = ?, error = ? WHERE id = ?`,
    [
      run.status,
      Number(coalesce(run.total, 0)),
      Number(coalesce(run.done, 0)),
      Number(coalesce(run.failed, 0)),
      run.finishedAt || null,
      run.error || null,
      run.id,
    ],
  );
  return getRun(run.id);
}

async function getRun(id) {
  const db = getDb();
  return mapRun(await db.get('SELECT * FROM runs WHERE id = ?', [id]));
}

async function listRuns({ datasetId, limit = 20 } = {}) {
  const db = getDb();
  const rows = datasetId
    ? await db.all('SELECT * FROM runs WHERE dataset_id = ? ORDER BY started_at DESC LIMIT ?', [datasetId, Number(limit)])
    : await db.all('SELECT * FROM runs ORDER BY started_at DESC LIMIT ?', [Number(limit)]);
  return rows.map(mapRun);
}

/* ---------------------------------------------------------------- app settings */

async function getAppSetting(key, fallback = null) {
  const db = getDb();
  const row = await db.get('SELECT v FROM app_settings WHERE k = ?', [key]);
  return row ? row.v : fallback;
}

async function setAppSetting(key, value) {
  const db = getDb();
  const existing = await db.get('SELECT k FROM app_settings WHERE k = ?', [key]);
  if (existing) {
    await db.run('UPDATE app_settings SET v = ? WHERE k = ?', [String(value), key]);
  } else {
    await db.run('INSERT INTO app_settings (k, v) VALUES (?, ?)', [key, String(value)]);
  }
}

async function getStats() {
  const db = getDb();
  const row = await db.get(
    `SELECT
       (SELECT COUNT(*) FROM datasets) AS datasets,
       (SELECT COUNT(*) FROM entries) AS entries,
       (SELECT COUNT(*) FROM snapshots) AS snapshots,
       (SELECT COUNT(*) FROM runs) AS runs`,
  );
  return {
    datasets: Number(coalesce(row && row.datasets, 0)),
    entries: Number(coalesce(row && row.entries, 0)),
    snapshots: Number(coalesce(row && row.snapshots, 0)),
    runs: Number(coalesce(row && row.runs, 0)),
  };
}

module.exports = {
  listDatasets,
  getDataset,
  createDataset,
  updateDataset,
  deleteDataset,
  listFields,
  getField,
  createField,
  updateField,
  deleteField,
  reorderFields,
  listEntries,
  getEntry,
  createEntry,
  updateEntry,
  deleteEntry,
  saveSnapshot,
  listSnapshots,
  countSnapshots,
  listSnapshotsForDataset,
  createRun,
  updateRun,
  getRun,
  listRuns,
  getAppSetting,
  setAppSetting,
  getStats,
};
