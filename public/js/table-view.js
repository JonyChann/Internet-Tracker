import { api, apiDelete, apiGet, apiPatch, apiPost, apiPut } from './api.js';
import {
  debounce, escapeHtml, formatDateTime, formatNumber,
  icons, intervalLabel, loadingBlock, openModal, relativeTime, renderValue, safeImageUrl, statusBadge,
  toast, confirmDialog,
} from './ui.js';
import { openFieldEditor } from './field-editor.js';
import { openTableEditor } from './table-settings.js';
import { openHistory } from './history.js';
import { bus } from './app.js';

const TYPE_LABEL = { text: '文本', number: '数字', date: '日期', url: '链接', image: '图片', json: 'JSON', boolean: '是否' };

let current = null;

export async function renderTableView(container, tableId, { state, table: tableHint }) {
  current = null;
  container.innerHTML = `<div class="page page-wide">${loadingBlock(6).outerHTML}</div>`;

  let detail;
  try {
    detail = await apiGet(`/api/tables/${encodeURIComponent(tableId)}`);
  } catch (err) {
    container.innerHTML = `<div class="page"><div class="empty-state"><div class="empty-art">🗂️</div><h3>找不到这张数据表</h3><p>${escapeHtml(err.message)}</p><a class="btn" href="#/">返回首页</a></div></div>`;
    return;
  }

  const view = {
    table: detail.table,
    fields: detail.fields || [],
    entries: detail.entries || [],
    runs: detail.runs || [],
    selected: new Set(),
    query: '',
    activeRun: (detail.runs || []).find((run) => run.status === 'running') || null,
    container,
  };
  current = view;

  container.innerHTML = `
    <div class="page page-wide">
      <div class="page-head">
        <div class="breadcrumb"><a href="#/">数据表</a><span>/</span><span>${escapeHtml(view.table.name)}</span></div>
        <div class="page-title-row">
          <span class="page-icon">${escapeHtml(view.table.icon || '📊')}</span>
          <h1 class="page-title">${escapeHtml(view.table.name)}</h1>
        </div>
        <p class="page-desc">${escapeHtml(view.table.description || '还没有描述。可以在「表设置」中补充。')}</p>
        <div class="page-meta" id="tv-meta"></div>
        <div class="page-actions">
          <button class="btn ghost" id="tv-columns">${icons.columns} 列模板 <span style="color:var(--faint);font-weight:400">${view.fields.length}</span></button>
          <button class="btn ghost" id="tv-settings">${icons.settings} 表设置</button>
          <a class="btn ghost" id="tv-export" href="/export?table=${encodeURIComponent(view.table.id)}">${icons.download} 导出</a>
          <span class="spacer"></span>
          <button class="btn" id="tv-refresh">${icons.refresh} 刷新全部</button>
          <button class="btn primary" id="tv-add">${icons.plus} 添加数据行</button>
        </div>
      </div>
      <div class="table-shell">
        <div class="table-toolbar" id="tv-toolbar"></div>
        <div class="table-scroll">
          <table class="data-table">
            <thead id="tv-head"></thead>
            <tbody id="tv-body"></tbody>
          </table>
        </div>
        <div class="table-foot" id="tv-foot"></div>
      </div>
    </div>`;

  const headEl = container.querySelector('#tv-head');
  const bodyEl = container.querySelector('#tv-body');
  const toolbarEl = container.querySelector('#tv-toolbar');
  const footEl = container.querySelector('#tv-foot');
  const metaEl = container.querySelector('#tv-meta');

  function renderMeta() {
    const t = view.table;
    const lastRun = view.entries
      .map((entry) => entry.lastRunAt)
      .filter(Boolean)
      .sort()
      .pop();
    const failed = view.entries.filter((entry) => entry.status === 'error' || entry.status === 'partial').length;
    const running = view.entries.filter((entry) => entry.status === 'running').length;
    metaEl.innerHTML = `
      <span class="meta-item">${icons.refresh} ${t.settings?.autoRefresh === false ? '仅手动刷新' : intervalLabel(t.settings?.intervalSec)}</span>
      <span class="meta-item">${icons.history} ${lastRun ? `更新于 ${relativeTime(lastRun)}` : '还没有抓取过'}</span>
      <span class="meta-item">${view.entries.length} 行 · ${view.fields.length} 列</span>
      ${running ? `<span class="meta-item" style="color:var(--accent)">${running} 行抓取中</span>` : ''}
      ${failed ? `<span class="meta-item" style="color:var(--red)">${failed} 行有问题</span>` : ''}
    `;
  }

  function renderHead() {
    const allSelected = view.entries.length > 0 && view.entries.every((entry) => view.selected.has(entry.id));
    headEl.innerHTML = `<tr>
      <th class="col-check"><input type="checkbox" id="tv-select-all" ${allSelected ? 'checked' : ''} title="全选"></th>
      ${(view.table.variables || []).map((variable) => `<th title="变量 {{${escapeHtml(variable.key)}}}">${escapeHtml(variable.label || variable.key)}</th>`).join('')}
      ${view.fields
        .map(
          (field) => `<th data-field-id="${field.id}" class="tv-field-th" title="点击编辑列模板">
            <span class="th-inner">${escapeHtml(field.name)}<span class="th-type">${TYPE_LABEL[field.dataType] || field.dataType}</span></span></th>`,
        )
        .join('')}
      <th class="col-status">状态</th>
      <th class="col-time">最后更新</th>
      <th class="col-actions"></th>
    </tr>`;
    headEl.querySelector('#tv-select-all')?.addEventListener('change', (event) => {
      view.selected.clear();
      if (event.target.checked) for (const entry of view.entries) view.selected.add(entry.id);
      renderBody();
      renderToolbar();
    });
    headEl.querySelectorAll('.tv-field-th').forEach((th) => {
      th.addEventListener('click', () => {
        const field = view.fields.find((item) => item.id === th.dataset.fieldId);
        if (field) editField(field);
      });
    });
  }

  function variableCells(entry) {
    const variables = view.table.variables || [];
    if (!variables.length) return '';
    return variables
      .map((variable) => {
        const value = entry.vars?.[variable.key];
        return `<td class="cell-var" title="${escapeHtml(variable.label || variable.key)}"><span class="var-pill">${escapeHtml(value || '—')}</span></td>`;
      })
      .join('');
  }

  function valueCell(field, entry) {
    const error = entry.latestValues?.[field.id] === undefined && entry.error ? entry.error : null;
    let value = entry.latestValues?.[field.id];
    if (Array.isArray(value) && value.length === 0) value = null;
    if (value === undefined || value === null || value === '') {
      if (entry.status === 'error' && entry.error) {
        return `<td class="cell-value"><span class="cell-error" title="${escapeHtml(entry.error)}">${icons.alert} 提取失败</span></td>`;
      }
      return '<td class="cell-value"><span class="cell-muted">—</span></td>';
    }
    return `<td class="cell-value">${renderValue(field, value)}</td>`;
  }

  function renderRow(entry) {
    const selected = view.selected.has(entry.id);
    const busy = entry.status === 'running';
    return `<tr data-entry="${entry.id}" class="${selected ? 'selected' : ''}">
      <td class="col-check"><input type="checkbox" data-select="${entry.id}" ${selected ? 'checked' : ''}></td>
      ${variableCells(entry)}
      ${view.fields.map((field) => valueCell(field, entry)).join('')}
      <td class="col-status">${statusBadge(entry.status)}</td>
      <td class="col-time"><span class="time-text" title="${escapeHtml(formatDateTime(entry.lastRunAt))}">${entry.lastRunAt ? relativeTime(entry.lastRunAt) : '—'}</span></td>
      <td class="col-actions"><div class="row-actions">
        <button class="icon-btn sm" data-refresh="${entry.id}" title="刷新这一行" ${busy ? 'disabled' : ''}>${icons.refresh}</button>
        <button class="icon-btn sm" data-history="${entry.id}" title="历史记录">${icons.history}</button>
        <button class="icon-btn sm" data-delete="${entry.id}" title="删除这一行">${icons.trash}</button>
      </div></td>
    </tr>`;
  }

  function filteredEntries() {
    const query = view.query.trim().toLowerCase();
    if (!query) return view.entries;
    return view.entries.filter((entry) => {
      const parts = Object.values(entry.vars || {}).map(String);
      for (const field of view.fields) {
        const value = entry.latestValues?.[field.id];
        if (value !== undefined && value !== null) parts.push(Array.isArray(value) ? value.join(' ') : String(value));
      }
      return parts.some((part) => part.toLowerCase().includes(query));
    });
  }

  function renderBody() {
    const rows = filteredEntries();
    if (!view.entries.length) {
      bodyEl.innerHTML = '';
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 4 + (view.table.variables || []).length + view.fields.length;
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.innerHTML = `<div class="empty-art">🧩</div><h3>${view.fields.length ? '开始添加第一行' : '先定义列模板'}</h3>
        <p>${view.fields.length ? '只需要填变量，Chrome 会自动打开网址并抓取每一列。' : '每一列是一个选择器模板。定义好列以后，添加行时只需输入变量。'}</p>`;
      const actions = document.createElement('div');
      actions.style.display = 'flex';
      actions.style.gap = '8px';
      const addBtn = document.createElement('button');
      addBtn.className = 'btn primary';
      addBtn.innerHTML = `${icons.plus} 添加数据行`;
      addBtn.addEventListener('click', openAddEntry);
      const colBtn = document.createElement('button');
      colBtn.className = 'btn';
      colBtn.innerHTML = `${icons.columns} 添加列模板`;
      colBtn.addEventListener('click', () => openColumnsManager());
      actions.append(addBtn, colBtn);
      empty.append(actions);
      td.append(empty);
      tr.append(td);
      bodyEl.append(tr);
      return;
    }
    if (!rows.length) {
      bodyEl.innerHTML = `<tr><td colspan="${4 + (view.table.variables || []).length + view.fields.length}"><div class="empty-state" style="padding:40px"><div class="empty-art">🔍</div><h3>没有匹配的行</h3><p>试试清空搜索关键词。</p></div></td></tr>`;
      return;
    }
    bodyEl.innerHTML = rows.map(renderRow).join('');
  }

  function renderToolbar() {
    const run = view.activeRun;
    const selectedCount = view.selected.size;
    toolbarEl.innerHTML = `
      <div class="search-box">${icons.search}<input type="text" id="tv-search" placeholder="搜索变量或结果…" value="${escapeHtml(view.query)}"></div>
      ${selectedCount ? `<div class="selection-bar">已选 ${selectedCount} 行
        <button class="btn sm" data-bulk="refresh">${icons.refresh} 刷新</button>
        <button class="btn sm danger" data-bulk="delete">${icons.trash} 删除</button>
        <button class="btn sm ghost" data-bulk="clear">取消选择</button></div>` : ''}
      <div class="spacer"></div>
      ${run ? `<div class="selection-bar" style="color:var(--accent-ink)">${icons.refresh} ${run.source === 'schedule' ? '定时刷新中' : '抓取中'} ${run.done}/${run.total}${run.failed ? ` · ${run.failed} 失败` : ''}
        <button class="btn sm ghost" data-cancel-run="${run.id}">取消</button></div>` : ''}
      <span style="color:var(--faint);font-size:12px">${view.entries.length} 行 · 最后同步 ${relativeTime(view.entries.map((e) => e.lastRunAt).filter(Boolean).sort().pop())}</span>
    `;
    const search = toolbarEl.querySelector('#tv-search');
    search?.addEventListener('input', debounce((event) => {
      view.query = event.target.value;
      renderBody();
    }, 180));
    toolbarEl.querySelector('[data-bulk="refresh"]')?.addEventListener('click', () => refreshSelected());
    toolbarEl.querySelector('[data-bulk="delete"]')?.addEventListener('click', () => deleteSelected());
    toolbarEl.querySelector('[data-bulk="clear"]')?.addEventListener('click', () => {
      view.selected.clear();
      renderBody();
      renderToolbar();
    });
    toolbarEl.querySelector('[data-cancel-run]')?.addEventListener('click', async (event) => {
      const id = event.currentTarget.dataset.cancelRun;
      try {
        await apiPost(`/api/runs/${id}/cancel`);
        toast('已请求取消剩余行', 'info');
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }

  function renderFoot() {
    footEl.innerHTML = `<button class="add-row-inline" id="tv-add-inline">${icons.plus} 新增一行</button>
      <span style="font-size:11.5px;color:var(--faint)">变量列 + ${view.fields.length} 个抓取列</span>
      <span class="spacer" style="flex:1"></span>
      <span style="font-size:11.5px;color:var(--faint)">点击行查看历史快照</span>`;
    footEl.querySelector('#tv-add-inline').addEventListener('click', openAddEntry);
  }

  function renderAll() {
    renderMeta();
    renderHead();
    renderBody();
    renderToolbar();
    renderFoot();
  }

  bodyEl.addEventListener('click', async (event) => {
    const target = event.target.closest('button, a, input');
    if (target) {
      if (target.matches('[data-select]')) {
        const id = target.dataset.select;
        if (target.checked) view.selected.add(id);
        else view.selected.delete(id);
        target.closest('tr').classList.toggle('selected', target.checked);
        renderToolbar();
        return;
      }
      if (target.matches('[data-refresh]')) {
        await refreshEntries([target.dataset.refresh]);
        return;
      }
      if (target.matches('[data-history]')) {
        const entry = view.entries.find((item) => item.id === target.dataset.history);
        if (entry) openEntryHistory(entry);
        return;
      }
      if (target.matches('[data-delete]')) {
        const entry = view.entries.find((item) => item.id === target.dataset.delete);
        if (entry) await deleteEntry(entry);
        return;
      }
      return;
    }
    const row = event.target.closest('tr[data-entry]');
    if (row) {
      const entry = view.entries.find((item) => item.id === row.dataset.entry);
      if (entry) openEntryHistory(entry);
    }
  });

  function openEntryHistory(entry) {
    openHistory({
      table: view.table,
      entry,
      fields: view.fields,
      onRefresh: async () => {
        await refreshEntries([entry.id]);
      },
      onChanged: async () => {
        await reload({ silent: true });
      },
    });
  }

  async function refreshEntries(ids, { silent = false } = {}) {
    try {
      const body = ids && ids.length ? { entryIds: ids } : {};
      const result = await apiPost(`/api/tables/${view.table.id}/refresh`, body);
      view.activeRun = result.run;
      renderToolbar();
      renderMeta();
      if (!silent) toast(ids?.length ? `已开始刷新 ${ids.length} 行` : '已开始刷新全部行', 'info');
      return result.run;
    } catch (err) {
      toast(err.message, 'error');
      return null;
    }
  }

  async function refreshSelected() {
    if (!view.selected.size) return;
    await refreshEntries([...view.selected]);
  }

  async function deleteEntry(entry) {
    const label = Object.values(entry.vars || {}).join(' · ') || entry.id.slice(0, 8);
    const yes = await confirmDialog({
      title: '删除这一行？',
      message: `将删除「${label}」及其全部历史快照，无法恢复。`,
      confirmText: '删除',
      danger: true,
    });
    if (!yes) return;
    try {
      await apiDelete(`/api/entries/${entry.id}`);
      view.entries = view.entries.filter((item) => item.id !== entry.id);
      view.selected.delete(entry.id);
      renderAll();
      toast('已删除', 'ok');
      bus.dispatchEvent(new CustomEvent('tables:changed'));
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function deleteSelected() {
    const ids = [...view.selected];
    if (!ids.length) return;
    const yes = await confirmDialog({
      title: `删除 ${ids.length} 行？`,
      message: '这些行的全部历史快照也会被删除，无法恢复。',
      confirmText: '全部删除',
      danger: true,
    });
    if (!yes) return;
    try {
      for (const id of ids) await apiDelete(`/api/entries/${id}`);
      view.entries = view.entries.filter((entry) => !ids.includes(entry.id));
      view.selected.clear();
      renderAll();
      toast(`已删除 ${ids.length} 行`, 'ok');
      bus.dispatchEvent(new CustomEvent('tables:changed'));
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  function openAddEntry() {
    buildAddEntryModal(view, async (entry, run, warning) => {
      if (entry) view.entries.push(entry);
      if (run) view.activeRun = run;
      renderAll();
      if (warning) toast(warning, 'info', 5000);
      bus.dispatchEvent(new CustomEvent('tables:changed'));
    });
  }

  async function editField(field) {
    view.table._entries = view.entries;
    openFieldEditor({
      table: view.table,
      field,
      onSaved: async () => {
        await reload({ silent: true });
        toast('列已更新', 'ok');
      },
    });
  }

  function openColumnsManager() {
    view.table._entries = view.entries;
    const modal = openModal({
      title: '列模板',
      subtitle: '每一列是一个选择器模板；拖动顺序可以用上下箭头调整',
      size: 'wide',
      body: '<div id="cm-list"></div>',
      actions: [
        { label: '关闭', variant: 'ghost' },
        {
          label: '添加列',
          variant: 'primary',
          close: false,
          onClick: () => {
            modal.close();
            openFieldEditor({
              table: view.table,
              onSaved: async () => {
                await reload({ silent: true });
              },
            });
          },
        },
      ],
    });
    const list = modal.body.querySelector('#cm-list');

    function renderList() {
      if (!view.fields.length) {
        list.innerHTML = '<div class="empty-state" style="padding:30px"><div class="empty-art">🧱</div><h3>还没有列</h3><p>添加第一列，比如商品名称或价格。</p></div>';
        return;
      }
      list.innerHTML = view.fields
        .map(
          (field, index) => `<div class="var-card" data-cm="${field.id}" style="grid-template-columns:1fr auto;display:flex;align-items:center;gap:10px">
            <div style="min-width:0;flex:1">
              <div style="display:flex;gap:8px;align-items:center">
                <strong style="font-size:13px">${escapeHtml(field.name)}</strong>
                <span class="pill">${TYPE_LABEL[field.dataType] || field.dataType}</span>
                <span class="pill">${escapeHtml(field.template?.extract || 'text')}</span>
              </div>
              <div style="font:11.5px var(--mono);color:var(--muted);margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(field.template?.selector || field.template?.code || '')}">${escapeHtml(field.template?.selector || (field.template?.extract === 'js' ? '自定义 JS' : ''))}</div>
            </div>
            <div style="display:flex;gap:2px">
              <button class="icon-btn sm" data-move="up" data-id="${field.id}" title="上移" ${index === 0 ? 'disabled' : ''}>${icons.arrowUp}</button>
              <button class="icon-btn sm" data-move="down" data-id="${field.id}" title="下移" ${index === view.fields.length - 1 ? 'disabled' : ''}>${icons.arrowDown}</button>
              <button class="icon-btn sm" data-edit="${field.id}" title="编辑">${icons.settings}</button>
              <button class="icon-btn sm" data-del="${field.id}" title="删除">${icons.trash}</button>
            </div>
          </div>`,
        )
        .join('');
      list.querySelectorAll('[data-edit]').forEach((btn) => btn.addEventListener('click', () => {
        const field = view.fields.find((item) => item.id === btn.dataset.edit);
        modal.close();
        if (field) editField(field);
      }));
      list.querySelectorAll('[data-del]').forEach((btn) => btn.addEventListener('click', async () => {
        const field = view.fields.find((item) => item.id === btn.dataset.del);
        if (!field) return;
        const yes = await confirmDialog({
          title: `删除列「${field.name}」？`,
          message: '这一列已有的抓取值会从展示中消失（历史快照仍保留原始 JSON）。',
          confirmText: '删除列',
          danger: true,
        });
        if (!yes) return;
        try {
          await apiDelete(`/api/fields/${field.id}`);
          view.fields = view.fields.filter((item) => item.id !== field.id);
          renderList();
          await reload({ silent: true });
          toast('列已删除', 'ok');
        } catch (err) {
          toast(err.message, 'error');
        }
      }));
      list.querySelectorAll('[data-move]').forEach((btn) => btn.addEventListener('click', async () => {
        const field = view.fields.find((item) => item.id === btn.dataset.id);
        if (!field) return;
        const index = view.fields.indexOf(field);
        const swap = btn.dataset.move === 'up' ? index - 1 : index + 1;
        if (swap < 0 || swap >= view.fields.length) return;
        const reordered = [...view.fields];
        [reordered[index], reordered[swap]] = [reordered[swap], reordered[index]];
        view.fields = reordered;
        try {
          await apiPut(`/api/tables/${view.table.id}/fields/order`, { ids: reordered.map((item) => item.id) });
          renderList();
          renderAll();
        } catch (err) {
          toast(err.message, 'error');
          await reload({ silent: true });
        }
      }));
    }
    renderList();
  }

  async function reload({ silent = false } = {}) {
    try {
      const detailData = await apiGet(`/api/tables/${view.table.id}`);
      view.table = detailData.table;
      view.fields = detailData.fields || [];
      view.entries = detailData.entries || [];
      const runs = detailData.runs || [];
      view.activeRun = runs.find((run) => run.status === 'running') || null;
      for (const id of [...view.selected]) {
        if (!view.entries.some((entry) => entry.id === id)) view.selected.delete(id);
      }
      if (!silent) toast('已刷新', 'ok');
      renderAll();
    } catch (err) {
      if (!silent) toast(err.message, 'error');
    }
  }

  /* ---------- 事件 ---------- */
  const onEntry = (event) => {
    if (!container.isConnected || !current) return;
    const entry = event.detail;
    if (!entry || entry.datasetId !== view.table.id) return;
    const index = view.entries.findIndex((item) => item.id === entry.id);
    if (index >= 0) {
      const merged = { ...view.entries[index], ...entry };
      view.entries[index] = merged;
    } else {
      view.entries.push(entry);
    }
    const row = bodyEl.querySelector(`tr[data-entry="${entry.id}"]`);
    const entryNow = view.entries.find((item) => item.id === entry.id);
    if (row && entryNow) row.outerHTML = renderRow(entryNow);
    else renderBody();
    renderMeta();
    renderToolbar();
    renderFoot();
  };

  const onRun = (event) => {
    if (!container.isConnected || !current) return;
    const run = event.detail;
    if (!run || run.datasetId !== view.table.id) return;
    view.activeRun = run.status === 'running' ? run : null;
    renderToolbar();
    renderMeta();
    if (run.status !== 'running') {
      const failed = run.failed ? `，${run.failed} 行失败` : '';
      toast(`刷新完成：${run.done}/${run.total} 行${failed}`, run.failed ? 'info' : 'ok');
      setTimeout(() => reload({ silent: true }), 500);
    }
  };

  const onDataset = () => {
    if (!container.isConnected) return;
    reload({ silent: true });
  };

  bus.addEventListener('entry:update', onEntry);
  bus.addEventListener('run:update', onRun);
  bus.addEventListener('datasets:changed', onDataset);

  const cleanup = () => {
    bus.removeEventListener('entry:update', onEntry);
    bus.removeEventListener('run:update', onRun);
    bus.removeEventListener('datasets:changed', onDataset);
    clearInterval(pollTimer);
  };
  const previousCleanup = cleanupRegistry.get(container);
  if (previousCleanup) previousCleanup();
  cleanupRegistry.set(container, cleanup);

  const pollTimer = setInterval(() => {
    if (!container.isConnected || document.hidden) return;
    if (view.activeRun) return;
    apiGet(`/api/tables/${view.table.id}`)
      .then((data) => {
        if (!container.isConnected) return;
        const before = view.entries.map((entry) => `${entry.id}:${entry.lastRunAt}:${entry.status}`).join('|');
        view.entries = data.entries || [];
        view.fields = data.fields || [];
        const after = view.entries.map((entry) => `${entry.id}:${entry.lastRunAt}:${entry.status}`).join('|');
        if (before !== after) renderAll();
      })
      .catch(() => {});
  }, 15000);

  /* ---------- 顶部动作 ---------- */
  container.querySelector('#tv-columns').addEventListener('click', openColumnsManager);
  container.querySelector('#tv-settings').addEventListener('click', () => {
    openTableEditor({
      table: view.table,
      onSaved: async () => {
        await reload({ silent: true });
        bus.dispatchEvent(new CustomEvent('tables:changed'));
      },
      onDeleted: () => {
        location.hash = '#/';
        setTimeout(() => location.reload(), 30);
      },
    });
  });
  container.querySelector('#tv-refresh').addEventListener('click', () => refreshEntries());
  container.querySelector('#tv-add').addEventListener('click', openAddEntry);

  renderAll();

  // 演示数据表首次打开时的温和提示
  if (view.table.settings?.intervalSec === 0 && view.fields.length && !view.entries.some((entry) => entry.lastRunAt)) {
    setTimeout(() => toast('点「刷新全部」把演示数据抓下来', 'info', 4200), 600);
  }
}

const cleanupRegistry = new WeakMap();

/* ---------- 添加行（本文件内，便于访问视图状态） ---------- */
function buildAddEntryModal(view, onDone) {
  const variables = view.table.variables || [];
  const body = document.createElement('div');
  const defaults = {};
  for (const variable of variables) defaults[variable.key] = variable.default || '';

  body.innerHTML = `
    <div class="form-grid">
      ${variables.length
        ? variables.map((variable) => `<div class="field"><label>${escapeHtml(variable.label || variable.key)} ${variable.required === false ? '<span class="optional">可选</span>' : ''}</label>
            <input type="text" data-entry-var="${escapeHtml(variable.key)}" value="${escapeHtml(defaults[variable.key])}" placeholder="${escapeHtml(variable.placeholder || '')}">
            <div class="hint">对应网址中的 <code>{{${escapeHtml(variable.key)}}}</code></div></div>`).join('')
        : '<div class="empty-hint">这张表没有定义变量：每次刷新都会抓取同一个网址。</div>'}
      <div class="field"><label>备注 <span class="optional">可选</span></label>
        <input type="text" id="entry-note" placeholder="例如：竞品 A / 大促期间" maxlength="2000"></div>
      <div class="field"><label>抓取地址预览</label>
        <div class="preview-box"><div class="pv-row"><span class="pv-label">URL</span><span class="pv-value mono" id="entry-url-preview">—</span></div></div></div>
      <label class="checkbox"><input type="checkbox" id="entry-refresh" checked>
        <span class="cb-text">保存后立即用 Chrome 抓取<span class="cb-hint">取消勾选则只保存这一行</span></span></label>
    </div>`;

  const preview = () => {
    const template = view.table.urlTemplate || '';
    const url = template.replace(/\{\{\s*!?\s*([\p{L}\p{N}_-]+)\s*\}\}/gu, (match, key) => {
      const input = body.querySelector(`[data-entry-var="${key}"]`);
      return encodeURIComponent(input ? input.value : '');
    });
    const el = body.querySelector('#entry-url-preview');
    if (el) el.textContent = url || '—';
  };
  body.querySelectorAll('[data-entry-var]').forEach((input) => input.addEventListener('input', preview));
  preview();

  const modal = openModal({
    title: '添加数据行',
    subtitle: variables.length ? '只需要填变量，其余交给列模板' : '这张表没有变量',
    body,
    actions: [
      { label: '取消', variant: 'ghost' },
      {
        label: '保存并抓取',
        variant: 'primary',
        onClick: async (controller) => {
          controller.clearError();
          const vars = {};
          body.querySelectorAll('[data-entry-var]').forEach((input) => {
            vars[input.dataset.entryVar] = input.value.trim();
          });
          for (const variable of variables) {
            if (variable.required !== false && !vars[variable.key] && !variable.default) {
              controller.setError(`请填写「${variable.label || variable.key}」`);
              return true;
            }
          }
          controller.setBusy(true);
          try {
            const result = await apiPost(`/api/tables/${view.table.id}/entries`, {
              vars,
              note: body.querySelector('#entry-note').value.trim(),
              refresh: body.querySelector('#entry-refresh').checked,
            });
            toast(result.warning || '已添加，正在后台抓取', result.warning ? 'info' : 'ok', 4200);
            await onDone(result.entry, result.run, result.warning);
            return false;
          } catch (err) {
            controller.setError(err.message);
            return true;
          } finally {
            controller.setBusy(false);
          }
        },
      },
    ],
  });
  return modal;
}
