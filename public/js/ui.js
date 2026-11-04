/* 通用 UI 工具：图标、提示、弹窗、格式化 */

export const icons = {
  plus: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M8 3v10M3 8h10"/></svg>',
  refresh: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13.3 6.7A5.5 5.5 0 1 0 13.5 9"/><path d="M13.5 2.8v3.9H9.6"/></svg>',
  history: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 8a5.5 5.5 0 1 0 1.7-4"/><path d="M2.4 2.6v3.6h3.6"/><path d="M8 5.2V8l2 1.3"/></svg>',
  trash: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M2.8 4.2h10.4M6 4.2V2.8h4v1.4M4 4.2l.6 8.4h6.8l.6-8.4"/></svg>',
  columns: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="2.2" y="3" width="11.6" height="10" rx="1.6"/><path d="M6 3v10M10 3v10"/></svg>',
  settings: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="8" cy="8" r="2.1"/><path d="M8 1.9v1.4M8 12.7v1.4M1.9 8h1.4M12.7 8h1.4M3.7 3.7l1 1M11.3 11.3l1 1M12.3 3.7l-1 1M4.7 11.3l-1 1" stroke-linecap="round"/></svg>',
  close: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
  download: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2.5v7.2M5 7l3 3 3-3M2.8 12.6h10.4"/></svg>',
  search: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="7" cy="7" r="4.2"/><path d="M10.2 10.2l3 3"/></svg>',
  external: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9.2 2.8h4v4M13.2 2.8L7.4 8.6M6.2 3.4H3.4v9.2h9.2V9.8"/></svg>',
  play: '<svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><path d="M4.5 3.2l7.6 4.8-7.6 4.8z"/></svg>',
  check: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5l3.2 3.2L13 4.8"/></svg>',
  alert: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M8 2.2l6 10.6H2z"/><path d="M8 6.2v3M8 11.4v.1"/></svg>',
  drag: '<svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><circle cx="6" cy="4" r="1"/><circle cx="10" cy="4" r="1"/><circle cx="6" cy="8" r="1"/><circle cx="10" cy="8" r="1"/><circle cx="6" cy="12" r="1"/><circle cx="10" cy="12" r="1"/></svg>',
  arrowUp: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 12.5V3.5M4.5 7L8 3.5 11.5 7"/></svg>',
  arrowDown: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3.5v9M4.5 9L8 12.5 11.5 9"/></svg>',
  copy: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><rect x="5.4" y="5.4" width="8" height="8" rx="1.4"/><path d="M10.6 5.4V3.8A1.4 1.4 0 0 0 9.2 2.4h-5.4A1.4 1.4 0 0 0 2.4 3.8v5.4a1.4 1.4 0 0 0 1.4 1.4h1.6"/></svg>',
};

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

export function formatNumber(value) {
  if (value === null || value === undefined || value === '') return '';
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  return num.toLocaleString('zh-CN', { maximumFractionDigits: 4 });
}

export function formatDateTime(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso);
  return date.toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
}

export function formatShortTime(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso);
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
}

export function relativeTime(iso) {
  if (!iso) return '从未';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return String(iso);
  const diff = Date.now() - then;
  if (diff < 0) return '刚刚';
  const sec = Math.floor(diff / 1000);
  if (sec < 45) return '刚刚';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} 分钟前`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} 小时前`;
  const day = Math.floor(hour / 24);
  if (day < 30) return `${day} 天前`;
  return formatShortTime(iso);
}

export function formatDuration(ms) {
  if (ms === null || ms === undefined) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export const STATUS_TEXT = { ok: '成功', partial: '部分成功', error: '失败', running: '抓取中', idle: '未抓取' };

export function statusBadge(status) {
  const key = status || 'idle';
  return `<span class="status-badge ${escapeAttr(key)}">${escapeHtml(STATUS_TEXT[key] || key)}</span>`;
}

export const SOURCE_TEXT = { manual: '手动', schedule: '定时', demo: '演示', import: '导入', entry: '新建行' };

export function sourceLabel(source) {
  return SOURCE_TEXT[source] || source || '刷新';
}

export function intervalLabel(seconds) {
  const sec = Number(seconds) || 0;
  if (!sec) return '未开启';
  if (sec % 3600 === 0) return `每 ${sec / 3600} 小时`;
  if (sec % 60 === 0) return `每 ${sec / 60} 分钟`;
  return `每 ${sec} 秒`;
}

export function safeImageUrl(url) {
  const text = String(url || '').trim();
  if (!text) return '';
  if (/^https?:\/\//i.test(text)) return text;
  if (/^data:image\//i.test(text)) return text;
  return '';
}


/* ---------- 单元格值渲染 ---------- */
export function renderValue(field, value) {
  const type = field.dataType;
  if (type === 'image') {
    const url = safeImageUrl(value);
    if (url) {
      return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener" title="打开图片" onclick="event.stopPropagation()"><img class="thumb" src="${escapeHtml(url)}" alt="" loading="lazy"></a>`;
    }
    return `<span class="cell-muted">${escapeHtml(String(value))}</span>`;
  }
  if (type === 'url') {
    const text = String(value);
    return `<a href="${escapeHtml(text)}" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="${escapeHtml(text)}">${escapeHtml(text.length > 46 ? `${text.slice(0, 46)}…` : text)}</a>`;
  }
  if (Array.isArray(value)) {
    const shown = value.slice(0, 2);
    return `<div class="chips">${shown.map((item) => `<span class="chip" title="${escapeHtml(item)}">${escapeHtml(item)}</span>`).join('')}${value.length > 2 ? `<span class="chip" title="${escapeHtml(value.join('\n'))}">+${value.length - 2}</span>` : ''}</div>`;
  }
  if (typeof value === 'object') {
    return `<code class="json-val" title="${escapeHtml(JSON.stringify(value))}">${escapeHtml(JSON.stringify(value).slice(0, 60))}</code>`;
  }
  if (type === 'number') {
    return `<span class="val-number">${escapeHtml(formatNumber(value))}</span>`;
  }
  if (type === 'boolean') {
    const truthy = value === true || /^(true|是|有|1|yes)$/i.test(String(value));
    return `<span style="color:${truthy ? 'var(--green)' : 'var(--muted)'}">${truthy ? '是' : '否'}</span>`;
  }
  const text = String(value);
  return `<span class="val-text" title="${escapeHtml(text)}">${escapeHtml(text)}</span>`;
}

export function debounce(fn, wait = 250) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

export function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text);
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.append(ta);
  ta.select();
  try {
    document.execCommand('copy');
  } finally {
    ta.remove();
  }
  return Promise.resolve();
}

/* ---------- Toast ---------- */
export function toast(message, type = 'info', timeout = 3600) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const node = document.createElement('div');
  node.className = `toast ${type}`;
  const icon = type === 'ok' ? icons.check : type === 'error' ? icons.alert : icons.check;
  node.innerHTML = `<span class="toast-icon">${icon}</span><span>${escapeHtml(message)}</span>`;
  root.append(node);
  setTimeout(() => {
    node.classList.add('leaving');
    setTimeout(() => node.remove(), 200);
  }, timeout);
  return node;
}

/* ---------- Modal ---------- */
const modalStack = [];

export function openModal(options) {
  const { title = '', subtitle = '', body = '', size = '', actions = [], onClose, dismissible = true } = options;
  const root = document.getElementById('modal-root');

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  const modal = document.createElement('div');
  modal.className = `modal ${size}`.trim();
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');

  const head = document.createElement('div');
  head.className = 'modal-head';
  head.innerHTML = `
    <div class="head-text">
      <h2 class="modal-title">${escapeHtml(title)}</h2>
      ${subtitle ? `<p class="modal-sub">${escapeHtml(subtitle)}</p>` : ''}
    </div>
    ${dismissible ? `<button class="icon-btn sm" data-close aria-label="关闭">${icons.close}</button>` : ''}
  `;
  const bodyEl = document.createElement('div');
  bodyEl.className = 'modal-body';
  if (body instanceof Node) bodyEl.append(body);
  else bodyEl.innerHTML = body;

  const foot = document.createElement('div');
  foot.className = 'modal-foot';
  for (const action of actions) {
    if (action.node) {
      foot.append(action.node);
      continue;
    }
    if (action.spacer) {
      const spacer = document.createElement('div');
      spacer.className = 'spacer';
      foot.append(spacer);
      continue;
    }
    if (action.note) {
      const note = document.createElement('span');
      note.className = 'foot-note';
      note.textContent = action.note;
      foot.append(note);
      continue;
    }
    const btn = document.createElement('button');
    btn.className = `btn ${action.variant || ''}`.trim();
    btn.type = 'button';
    btn.textContent = action.label;
    if (action.disabled) btn.disabled = true;
    btn.addEventListener('click', async () => {
      if (!action.onClick) {
        close();
        return;
      }
      const keepOpen = await action.onClick(controller);
      if (!keepOpen && action.close !== false) close();
    });
    action.button = btn;
    foot.append(btn);
  }

  modal.append(head, bodyEl, foot);
  backdrop.append(modal);
  root.append(backdrop);
  if (actions.length === 0) foot.remove();

  function close() {
    const index = modalStack.indexOf(controller);
    if (index >= 0) modalStack.splice(index, 1);
    backdrop.remove();
    if (typeof onClose === 'function') onClose();
  }

  const controller = {
    backdrop,
    modal,
    body: bodyEl,
    foot,
    close,
    setBusy(busy) {
      for (const action of actions) {
        if (action.button) action.button.disabled = Boolean(busy) || Boolean(action.disabled);
      }
    },
    setError(message) {
      let box = bodyEl.querySelector('.modal-error');
      if (!box) {
        box = document.createElement('div');
        box.className = 'error-text modal-error';
        bodyEl.prepend(box);
      }
      box.textContent = message;
    },
    clearError() {
      const box = bodyEl.querySelector('.modal-error');
      if (box) box.remove();
    },
  };

  backdrop.addEventListener('mousedown', (event) => {
    if (event.target === backdrop && dismissible) close();
  });
  head.querySelector('[data-close]')?.addEventListener('click', close);
  const onKey = (event) => {
    if (event.key === 'Escape' && dismissible && modalStack[modalStack.length - 1] === controller) {
      event.preventDefault();
      close();
    }
  };
  document.addEventListener('keydown', onKey);
  const originalClose = controller.close;
  controller.close = () => {
    document.removeEventListener('keydown', onKey);
    originalClose();
  };

  modalStack.push(controller);
  setTimeout(() => {
    const focusable = modal.querySelector('input:not([type=hidden]), select, textarea, button.primary');
    focusable?.focus();
  }, 40);
  return controller;
}

export function confirmDialog({ title, message, confirmText = '确认', cancelText = '取消', danger = false }) {
  return new Promise((resolve) => {
    let settled = false;
    const modal = openModal({
      title,
      body: `<p style="margin:0;color:var(--ink-soft);font-size:13.5px;line-height:1.65">${escapeHtml(message)}</p>`,
      actions: [
        { label: cancelText, onClick: () => { settled = true; resolve(false); } },
        { label: confirmText, variant: danger ? 'danger' : 'primary', onClick: () => { settled = true; resolve(true); } },
      ],
      onClose: () => { if (!settled) resolve(false); },
    });
    return modal;
  });
}

export function emptyState({ art = '✦', title, text = '', action = null }) {
  const wrap = document.createElement('div');
  wrap.className = 'empty-state';
  wrap.innerHTML = `<div class="empty-art">${escapeHtml(art)}</div><h3>${escapeHtml(title)}</h3>${text ? `<p>${escapeHtml(text)}</p>` : ''}`;
  if (action) wrap.append(action);
  return wrap;
}

export function loadingBlock(rows = 5) {
  const wrap = document.createElement('div');
  wrap.style.padding = '18px';
  wrap.innerHTML = Array.from({ length: rows })
    .map((_, i) => `<div class="skeleton skel-row" style="width:${92 - (i % 3) * 14}%"></div>`)
    .join('');
  return wrap;
}
