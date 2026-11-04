export const STATUS_LABELS = {
  ok: '成功',
  partial: '部分成功',
  error: '失败',
  running: '抓取中',
  idle: '未抓取',
};

export function statusLabel(status) {
  return STATUS_LABELS[status] || status || '未知';
}

export function valueFor(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map((item) => valueFor(item)).join(' | ');
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}

function variableValues(dataset, entry) {
  return (dataset.variables || []).map((variable) => {
    const value = entry.vars?.[variable.key];
    return value === undefined || value === null ? '' : valueFor(value);
  });
}

export function buildSheet({ dataset, fields, entries, snapshots, mode = 'latest', columns }) {
  const selected = Array.isArray(columns) && columns.length ? fields.filter((field) => columns.includes(field.id)) : fields;
  const headers = [
    ...(dataset.variables || []).map((variable) => variable.label || variable.key),
    ...selected.map((field) => field.name),
    '状态',
    mode === 'history' ? '抓取时间' : '最后更新',
    '备注',
  ];

  const rows = [];
  if (mode === 'history') {
    const entryMap = new Map(entries.map((entry) => [entry.id, entry]));
    for (const snapshot of snapshots || []) {
      const entry = entryMap.get(snapshot.entryId);
      if (!entry) continue;
      rows.push([
        ...variableValues(dataset, entry),
        ...selected.map((field) => valueFor(snapshot.values?.[field.id])),
        statusLabel(snapshot.status),
        snapshot.capturedAt,
        entry.note || '',
      ]);
    }
  } else {
    for (const entry of entries) {
      rows.push([
        ...variableValues(dataset, entry),
        ...selected.map((field) => valueFor(entry.latestValues?.[field.id])),
        statusLabel(entry.latestStatus),
        entry.lastRunAt || '',
        entry.note || '',
      ]);
    }
  }

  return { name: mode === 'history' ? '历史记录' : '最新数据', headers, rows };
}

export function buildSheets({ dataset, fields, entries, snapshots, mode = 'latest', columns }) {
  if (mode === 'history') {
    return [buildSheet({ dataset, fields, entries, snapshots, mode: 'history', columns })];
  }
  if (mode === 'both') {
    return [
      buildSheet({ dataset, fields, entries, snapshots, mode: 'latest', columns }),
      buildSheet({ dataset, fields, entries, snapshots, mode: 'history', columns }),
    ];
  }
  return [buildSheet({ dataset, fields, entries, snapshots, mode: 'latest', columns })];
}

export function exportFileName(dataset, mode, extension) {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}`;
  const modeLabel = mode === 'history' ? '历史' : mode === 'both' ? '全部' : '最新';
  const base = String(dataset.name || '数据')
    .replace(/[\\/:*?"<>|\s]+/g, '_')
    .slice(0, 60);
  return `${base}_${modeLabel}_${stamp}.${extension}`;
}
