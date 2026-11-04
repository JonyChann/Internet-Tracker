import { apiGet, exportUrl, queryString } from './api.js';
import { escapeHtml, icons, statusBadge, toast } from './ui.js';

const root = document.querySelector('#export-app');

const MODES = [
  { id: 'latest', title: '最新数据', desc: '每个数据行只导出一行，取最近一次抓取的值。适合做当前快照。' },
  { id: 'history', title: '历史记录', desc: '每次刷新都保留一行，按时间从早到晚排列。适合观察价格/库存变化。' },
  { id: 'both', title: '两者都要', desc: '生成两个工作表：最新数据 + 历史记录。仅支持 xlsx。' },
];

const state = {
  tables: [],
  table: null,
  fields: [],
  entries: [],
  selectedFields: new Set(),
  selectedEntries: new Set(),
  mode: 'latest',
  format: 'xlsx',
  since: '',
  until: '',
  loading: true,
  busy: false,
  error: '',
};

boot();

async function boot() {
  const params = new URLSearchParams(location.search);
  const wantedMode = params.get('mode');
  if (MODES.some((item) => item.id === wantedMode)) state.mode = wantedMode;

  try {
    const data = await apiGet('/api/tables');
    state.tables = data.tables || [];
  } catch (err) {
    state.loading = false;
    state.error = err.message;
    render();
    return;
  }

  state.loading = false;
  render();

  const wantedTable = params.get('table');
  const tableId = state.tables.some((item) => item.id === wantedTable) ? wantedTable : state.tables[0]?.id;
  if (tableId) {
    await loadTable(tableId, params.get('entries'));
  }
}

async function loadTable(tableId, entriesParam) {
  if (!tableId) return;
  state.table = state.tables.find((item) => item.id === tableId) || null;
  try {
    const detail = await apiGet(`/api/tables/${tableId}`);
    state.table = detail.table;
    state.fields = detail.fields || [];
    state.entries = detail.entries || [];
  } catch (err) {
    toast(err.message, 'error');
    return;
  }

  state.selectedFields = new Set(state.fields.map((field) => field.id));
  const wanted = String(entriesParam || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  state.selectedEntries = new Set(
    state.entries.filter((entry) => !wanted.length || wanted.includes(entry.id)).map((entry) => entry.id),
  );
  syncUrl();
  render();
}

function syncUrl() {
  const params = {};
  if (state.table) params.table = state.table.id;
  if (state.mode !== 'latest') params.mode = state.mode;
  try {
    history.replaceState(null, '', `/export${queryString(params)}`);
  } catch {
    /* ignore */
  }
}

function render() {
  if (state.loading) {
    root.innerHTML = `
      <div class="export-card"><div class="skeleton skeleton-line" style="width:45%"></div>
      <div class="skeleton skeleton-line" style="width:70%;margin-top:10px"></div></div>`;
    return;
  }
  if (!state.tables.length) {
    root.innerHTML = `
      <div class="export-card">
        <div class="empty-state">
          <h3>还没有数据表</h3>
          <p>先在工作台创建一个数据表并抓取一些数据，再回来导出。</p>
          <a class="btn primary" href="/">去创建工作台</a>
        </div>
      </div>`;
    return;
  }

  const table = state.table;
  const fieldCount = state.selectedFields.size;
  const entryCount = state.selectedEntries.size;
  const varLabels = (table?.variables || []).map((variable) => variable.label || variable.key);

  root.innerHTML = `
    <div class="export-card">
      <h3><span class="step">1</span> 选择数据表</h3>
      <div class="field" style="margin:0">
        <select id="export-table">
          ${state.tables
            .map(
              (item) =>
                `<option value="${item.id}" ${table?.id === item.id ? 'selected' : ''}>${escapeHtml(item.icon || '📊')} ${escapeHtml(item.name)} · ${item.entryCount ?? 0} 行</option>`,
            )
            .join('')}
        </select>
        ${table ? `<div class="hint">${escapeHtml(table.urlTemplate || '')}</div>` : ''}
      </div>
    </div>

    <div class="export-card">
      <h3><span class="step">2</span> 选择内容</h3>
      <div class="export-formats">
        ${MODES.map(
          (mode) => `
          <label class="format-option ${state.mode === mode.id ? 'active' : ''}">
            <input type="radio" name="export-mode" value="${mode.id}" ${state.mode === mode.id ? 'checked' : ''}>
            <span class="radio-text"><strong>${mode.title}</strong><span>${mode.desc}</span></span>
          </label>`,
        ).join('')}
      </div>
      <div class="form-grid two" id="export-range" style="${state.mode === 'latest' ? 'display:none' : ''};margin-top:16px">
        <div class="field"><label>开始时间（可选）</label><input type="date" id="export-since" value="${escapeHtml(state.since)}"></div>
        <div class="field"><label>结束时间（可选）</label><input type="date" id="export-until" value="${escapeHtml(state.until)}"></div>
      </div>
    </div>

    <div class="export-card">
      <h3><span class="step">3</span> 选择列
        <span class="badge" style="margin-left:auto">${fieldCount} / ${state.fields.length} 列</span>
      </h3>
      <div class="column-grid" id="export-columns">
        <label class="column-item locked">
          <input type="checkbox" checked disabled>
          <span class="column-name">变量列</span>
          <span class="column-type">${escapeHtml(varLabels.join(' / ') || '—')}</span>
        </label>
        ${state.fields
          .map(
            (field) => `
          <label class="column-item">
            <input type="checkbox" data-field-id="${field.id}" ${state.selectedFields.has(field.id) ? 'checked' : ''}>
            <span class="column-name">${escapeHtml(field.name)}</span>
            <span class="column-type">${escapeHtml(field.dataType || 'text')}</span>
          </label>`,
          )
          .join('')}
      </div>
      <div class="form-row" style="margin-top:12px">
        <button class="btn ghost sm" data-action="cols-all">全选</button>
        <button class="btn ghost sm" data-action="cols-none">全不选</button>
        <span class="hint">变量列（${escapeHtml(varLabels.join('、') || '无')}）会自动包含在导出结果里。</span>
      </div>
    </div>

    <div class="export-card">
      <h3><span class="step">4</span> 选择行
        <span class="badge" style="margin-left:auto">${entryCount} / ${state.entries.length} 行</span>
      </h3>
      <div class="entry-grid" id="export-entries">
        ${state.entries
          .map(
            (entry) => `
          <label class="entry-item">
            <input type="checkbox" data-entry-id="${entry.id}" ${state.selectedEntries.has(entry.id) ? 'checked' : ''}>
            <span class="var-pill">${escapeHtml(varsText(entry))}</span>
            <span class="entry-note">${escapeHtml(entry.note || '')}</span>
            ${statusBadge(entry.status)}
          </label>`,
          )
          .join('') || '<div class="hint">这张表还没有数据行。</div>'}
      </div>
      <div class="form-row" style="margin-top:12px">
        <button class="btn ghost sm" data-action="rows-all">全选</button>
        <button class="btn ghost sm" data-action="rows-none">全不选</button>
        <span class="hint">只导出行不会被包含。</span>
      </div>
    </div>

    <div class="export-card">
      <h3><span class="step">5</span> 选择格式并下载</h3>
      <div class="export-formats">
        <label class="format-option ${state.format === 'xlsx' ? 'active' : ''}">
          <input type="radio" name="export-format" value="xlsx" ${state.format === 'xlsx' ? 'checked' : ''}>
          <span class="radio-text"><strong>Excel 工作簿（.xlsx）</strong><span>带表头样式、冻结首行和自动筛选。</span></span>
        </label>
        <label class="format-option ${state.format === 'csv' ? 'active' : ''} ${state.mode === 'both' ? 'disabled' : ''}">
          <input type="radio" name="export-format" value="csv" ${state.format === 'csv' ? 'checked' : ''} ${state.mode === 'both' ? 'disabled' : ''}>
          <span class="radio-text"><strong>CSV 文件（.csv）</strong><span>通用格式，UTF-8 编码（Excel 可直接打开）。</span></span>
        </label>
      </div>

      <div class="export-summary" id="export-summary">
        ${escapeHtml(summaryText())}
      </div>

      ${state.error ? `<div class="export-error" style="margin-top:10px">${escapeHtml(state.error)}</div>` : ''}

      <div class="export-foot">
        <button class="btn primary" id="export-download" ${state.busy ? 'disabled' : ''}>
          ${icons.download} ${state.busy ? '正在生成…' : '下载文件'}
        </button>
        <button class="btn ghost" id="export-copy">${icons.copy} 复制此导出链接</button>
        <span class="spacer"></span>
        <a class="link-btn" href="/">返回工作台</a>
      </div>
    </div>`;

  bind();
}

function varsText(entry) {
  const vars = entry.vars || {};
  const keys = Object.keys(vars);
  if (!keys.length) return '（无变量）';
  return keys.map((key) => String(vars[key] ?? '')).join(' · ');
}

function summaryText() {
  if (!state.table) return '请选择一个数据表。';
  const parts = [
    `${state.table.icon || '📊'} ${state.table.name}`,
    MODES.find((mode) => mode.id === state.mode)?.title || state.mode,
    `${state.selectedEntries.size} 行`,
    `${state.selectedFields.size} 列（+变量列）`,
    state.format.toUpperCase(),
  ];
  return parts.join(' · ');
}

function updateSummary() {
  const summary = document.querySelector('#export-summary');
  if (summary) summary.textContent = summaryText();
  const countBadges = document.querySelectorAll('.export-card .badge');
  if (countBadges.length >= 2) {
    countBadges[0].textContent = `${state.selectedFields.size} / ${state.fields.length} 列`;
    countBadges[1].textContent = `${state.selectedEntries.size} / ${state.entries.length} 行`;
  }
}

function bind() {
  document.querySelector('#export-table')?.addEventListener('change', (event) => {
    loadTable(event.target.value);
  });

  document.querySelectorAll('input[name="export-mode"]').forEach((input) => {
    input.addEventListener('change', () => {
      state.mode = input.value;
      if (state.mode === 'both' && state.format === 'csv') state.format = 'xlsx';
      state.error = '';
      syncUrl();
      render();
    });
  });

  document.querySelectorAll('input[name="export-format"]').forEach((input) => {
    input.addEventListener('change', () => {
      state.format = input.value;
      state.error = '';
      render();
    });
  });

  document.querySelectorAll('[data-field-id]').forEach((input) => {
    input.addEventListener('change', () => {
      if (input.checked) state.selectedFields.add(input.dataset.fieldId);
      else state.selectedFields.delete(input.dataset.fieldId);
      updateSummary();
    });
  });

  document.querySelectorAll('[data-entry-id]').forEach((input) => {
    input.addEventListener('change', () => {
      if (input.checked) state.selectedEntries.add(input.dataset.entryId);
      else state.selectedEntries.delete(input.dataset.entryId);
      updateSummary();
    });
  });

  document.querySelector('#export-since')?.addEventListener('change', (event) => {
    state.since = event.target.value;
  });
  document.querySelector('#export-until')?.addEventListener('change', (event) => {
    state.until = event.target.value;
  });

  document.querySelectorAll('[data-action]').forEach((button) => {
    button.addEventListener('click', () => {
      const action = button.dataset.action;
      if (action === 'cols-all') state.selectedFields = new Set(state.fields.map((field) => field.id));
      if (action === 'cols-none') state.selectedFields = new Set();
      if (action === 'rows-all') state.selectedEntries = new Set(state.entries.map((entry) => entry.id));
      if (action === 'rows-none') state.selectedEntries = new Set();
      render();
    });
  });

  document.querySelector('#export-download')?.addEventListener('click', download);
  document.querySelector('#export-copy')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(buildUrl(true));
      toast('导出链接已复制', 'ok');
    } catch {
      toast('复制失败，请手动复制地址栏链接', 'error');
    }
  });
}

function buildUrl(absolute = false) {
  const params = {
    tableId: state.table?.id || '',
    format: state.format,
    mode: state.mode,
    columns: [...state.selectedFields].join(','),
    entryIds: [...state.selectedEntries].join(','),
  };
  if (state.mode !== 'latest') {
    if (state.since) params.since = new Date(`${state.since}T00:00:00`).toISOString();
    if (state.until) params.until = new Date(`${state.until}T23:59:59.999`).toISOString();
  }
  const path = exportUrl(params);
  return absolute ? new URL(path, location.origin).href : path;
}

async function download() {
  if (!state.table) return;
  if (!state.selectedFields.size) {
    state.error = '请至少选择一列（变量列会自动包含，但还需要至少一个抓取列）。';
    render();
    return;
  }
  if (!state.selectedEntries.size) {
    state.error = '请至少选择一行。';
    render();
    return;
  }

  state.busy = true;
  state.error = '';
  render();
  try {
    const res = await fetch(buildUrl());
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `导出失败（HTTP ${res.status}）`);
    }
    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition') || '';
    const match = /filename\*=UTF-8''([^;]+)/i.exec(disposition) || /filename="([^"]+)"/i.exec(disposition);
    const filename = match ? decodeURIComponent(match[1]) : `export-${Date.now()}.${state.format}`;

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast(`已导出 ${filename}`, 'ok');
  } catch (err) {
    state.error = err.message;
  } finally {
    state.busy = false;
    render();
  }
}

