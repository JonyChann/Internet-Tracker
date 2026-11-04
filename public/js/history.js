import { apiGet } from './api.js';
import {
  escapeHtml, formatDateTime, formatDuration, formatNumber, icons, loadingBlock, openModal,
  relativeTime, renderValue, sourceLabel, statusBadge, toast,
} from './ui.js';

export async function openHistory({ table, entry, fields, onRefresh, onChanged }) {
  const body = document.createElement('div');
  body.innerHTML = loadingBlock(4);

  const modal = openModal({
    title: '历史快照',
    subtitle: '每次刷新都会保存一条记录',
    size: 'xwide',
    body,
    actions: [
      {
        label: '导出历史',
        variant: 'ghost',
        close: false,
        onClick: () => {
          window.open(`/export?table=${encodeURIComponent(table.id)}&mode=history&entries=${encodeURIComponent(entry.id)}`, '_blank');
        },
      },
      { spacer: true },
      { label: '关闭', variant: 'ghost' },
      {
        label: '刷新这一行',
        variant: 'primary',
        onClick: async (controller) => {
          if (typeof onRefresh !== 'function') return false;
          controller.setBusy(true);
          try {
            await onRefresh();
            toast('已开始刷新，完成后可在历史里查看新快照', 'info', 4000);
          } catch (err) {
            toast(err.message, 'error');
          } finally {
            controller.setBusy(false);
          }
          return false;
        },
      },
    ],
  });

  let offset = 0;
  const limit = 20;
  let snapshots = [];
  let total = 0;

  function entrySummary() {
    const vars = table.variables || [];
    const currentEntry = entry;
    return `<div class="preview-box" style="margin-bottom:14px">
      <div class="pv-row"><span class="pv-label">变量</span><span class="pv-value">${vars.length
        ? vars.map((variable) => `<span class="var-pill" style="margin-right:4px">${escapeHtml(variable.label || variable.key)}: ${escapeHtml(currentEntry.vars?.[variable.key] || '—')}</span>`).join('')
        : '<span class="cell-muted">无变量</span>'}</span></div>
      <div class="pv-row"><span class="pv-label">状态</span><span class="pv-value">${statusBadge(currentEntry.status)} ${currentEntry.error ? `<span style="color:var(--red);font-size:12px">${escapeHtml(currentEntry.error)}</span>` : ''}</span></div>
      <div class="pv-row"><span class="pv-label">抓取地址</span><span class="pv-value mono">${escapeHtml(renderUrl(table, currentEntry))}</span></div>
      ${currentEntry.note ? `<div class="pv-row"><span class="pv-label">备注</span><span class="pv-value">${escapeHtml(currentEntry.note)}</span></div>` : ''}
    </div>`;
  }

  function snapshotCard(snapshot, older) {
    const values = snapshot.values || {};
    const errors = snapshot.errors || {};
    const items = fields
      .filter((field) => values[field.id] !== undefined || errors[field.id])
      .map((field) => {
        const error = errors[field.id];
        if (error) {
          return `<div class="snap-field"><div class="sf-label">${escapeHtml(field.name)}</div><div class="sf-value err" title="${escapeHtml(error)}">${icons.alert} ${escapeHtml(error)}</div></div>`;
        }
        let value = values[field.id];
        let delta = '';
        if (older && field.dataType === 'number') {
          const before = Number(older.values?.[field.id]);
          const after = Number(value);
          if (Number.isFinite(before) && Number.isFinite(after) && before !== after) {
            const diff = after - before;
            delta = `<span class="${diff > 0 ? 'delta-up' : 'delta-down'}">${diff > 0 ? '↑' : '↓'} ${formatNumber(Math.abs(diff))}</span>`;
          }
        }
        return `<div class="snap-field"><div class="sf-label">${escapeHtml(field.name)}</div><div class="sf-value">${renderValue(field, value)}${delta}</div></div>`;
      })
      .join('');
    return `<div class="snapshot-card">
      <div class="snapshot-head">
        <span class="snap-time">${escapeHtml(formatDateTime(snapshot.capturedAt))}</span>
        <span class="snap-source">${escapeHtml(sourceLabel(snapshot.source))}</span>
        ${statusBadge(snapshot.status)}
        <span style="color:var(--faint);font-size:11.5px">${escapeHtml(relativeTime(snapshot.capturedAt))}</span>
        <span class="snap-duration">${snapshot.durationMs ? formatDuration(snapshot.durationMs) : ''}</span>
      </div>
      ${snapshot.error ? `<div class="snap-error">${escapeHtml(snapshot.error)}</div>` : ''}
      <div class="snapshot-body">${items || '<span class="cell-muted" style="font-size:12px">这一条没有抓到任何值</span>'}</div>
    </div>`;
  }

  function render() {
    const shown = snapshots;
    body.innerHTML = `${entrySummary()}
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
        <strong style="font-size:13px">${total} 条快照</strong>
        <span style="color:var(--faint);font-size:12px">最新的在最上面</span>
        <span style="flex:1"></span>
        <button class="btn sm" id="hist-reload">${icons.refresh} 重新加载</button>
      </div>
      <div class="history-list" id="hist-list">
        ${shown.map((snapshot, index) => snapshotCard(snapshot, shown[index + 1])).join('') || '<div class="empty-state" style="padding:30px"><div class="empty-art">🕐</div><h3>还没有快照</h3><p>点下面的「刷新这一行」开始抓取。</p></div>'}
      </div>
      ${shown.length < total ? `<div style="text-align:center;margin-top:12px"><button class="btn" id="hist-more">加载更多（${shown.length}/${total}）</button></div>` : ''}`;
    body.querySelector('#hist-reload')?.addEventListener('click', () => load(true));
    body.querySelector('#hist-more')?.addEventListener('click', () => load(false, true));
  }

  async function load(reset = false, append = false) {
    if (reset) {
      offset = 0;
      snapshots = [];
      body.innerHTML = loadingBlock(4);
    }
    try {
      const data = await apiGet(`/api/entries/${entry.id}/history?limit=${limit}&offset=${offset}`);
      total = data.total || 0;
      const fresh = data.snapshots || [];
      snapshots = append ? [...snapshots, ...fresh] : fresh;
      offset = snapshots.length;
      render();
      if (reset && typeof onChanged === 'function') onChanged();
    } catch (err) {
      body.innerHTML = `<div class="error-text">加载历史失败：${escapeHtml(err.message)}</div>`;
    }
  }

  await load(true);
  return modal;
}

function renderUrl(table, entry) {
  const template = table.urlTemplate || '';
  const vars = entry.vars || {};
  return template.replace(/\{\{\s*!?\s*([\p{L}\p{N}_-]+)\s*\}\}/gu, (match, key) => {
    return vars[key] ?? '';
  });
}
