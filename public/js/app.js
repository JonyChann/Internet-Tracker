import { api, apiGet, connectEvents } from './api.js';
import { escapeHtml, icons, openModal, toast } from './ui.js';
import { renderTableView } from './table-view.js';
import { renderSettingsView } from './settings-view.js';
import { openTableEditor } from './table-settings.js';

export const bus = new EventTarget();
export const state = {
  tables: [],
  info: null,
  sseConnected: false,
  route: { name: 'home' },
};

const viewEl = () => document.getElementById('view');

/* ---------- 侧边栏 ---------- */
function renderSidebar() {
  const nav = document.getElementById('table-nav');
  if (!state.tables.length) {
    nav.innerHTML = '<div class="nav-label" style="padding:8px;color:var(--faint);font-weight:400;text-transform:none;letter-spacing:0">还没有数据表</div>';
  } else {
    nav.innerHTML = state.tables
      .map((table) => {
        const active = state.route.name === 'table' && state.route.id === table.id;
        return `<a class="nav-item ${active ? 'active' : ''}" href="#/table/${encodeURIComponent(table.id)}" title="${escapeHtml(table.name)}">
          <span class="nav-icon">${escapeHtml(table.icon || '📊')}</span>
          <span class="nav-name">${escapeHtml(table.name)}</span>
          <span class="nav-count">${table.entryCount ?? 0}</span>
        </a>`;
      })
      .join('');
  }
  const settingsActive = state.route.name === 'settings';
  document.getElementById('nav-settings').classList.toggle('active', settingsActive);

  const foot = document.getElementById('sidebar-foot');
  const info = state.info;
  if (!info) {
    foot.innerHTML = '<div class="foot-row"><span class="status-dot"></span><span class="foot-text">正在连接…</span></div>';
    return;
  }
  const chromeOn = info.chrome && info.chrome.running;
  foot.innerHTML = `
    <div class="foot-row" title="${escapeHtml(info.chrome?.path || 'Chrome 未找到')}">
      <span class="status-dot ${chromeOn ? 'on' : 'off'}"></span>
      <span class="foot-text">Chrome ${chromeOn ? '运行中' : info.chrome?.path ? '待启动' : '未找到'}</span>
    </div>
    <div class="foot-row" title="${escapeHtml(info.db?.label || '')}">
      <span class="status-dot ${state.sseConnected ? 'on' : 'off'}"></span>
      <span class="foot-text">${escapeHtml(info.db?.label || '数据库')} · ${info.stats?.entries ?? 0} 行</span>
    </div>`;
}

async function loadTables({ silent = false } = {}) {
  try {
    const data = await apiGet('/api/tables');
    state.tables = data.tables || [];
    renderSidebar();
    if (!silent) bus.dispatchEvent(new CustomEvent('tables:loaded', { detail: state.tables }));
    return state.tables;
  } catch (err) {
    if (!silent) toast(err.message, 'error');
    return state.tables;
  }
}

async function loadInfo({ silent = true } = {}) {
  try {
    state.info = await apiGet('/api/settings');
    renderSidebar();
  } catch (err) {
    if (!silent) toast(err.message, 'error');
  }
}

function openNewTable() {
  openTableEditor({
    table: null,
    onSaved: async (table) => {
      await loadTables({ silent: true });
      navigate(`#/table/${table.id}`);
      toast('数据表已创建，接着添加列模板吧', 'ok');
    },
  });
}

/* ---------- 首页 ---------- */
function renderHome() {
  const el = viewEl();
  const tables = state.tables;
  el.innerHTML = `
    <div class="page">
      <div class="page-head">
        <div class="page-title-row"><span class="page-icon">◈</span><h1 class="page-title">Internet Tracker</h1></div>
        <p class="page-desc">用 Chrome 抓取任意网页，把变量与选择器变成一张会自动刷新的表格。每一列是一个模板，每一行只需要填变量。</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" id="home-new">${icons.plus} 新建数据表</button>
        <a class="btn" href="/export">${icons.download} 导出中心</a>
        <a class="btn ghost" href="/demo" target="_blank" rel="noopener">查看演示商店 ${icons.external}</a>
      </div>
      <div class="section-title" style="margin-top:28px">全部数据表</div>
      <div id="home-tables" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px"></div>
      <div class="settings-section" style="margin-top:26px">
        <div class="section-head"><h3>怎么开始</h3></div>
        <div class="section-body" style="font-size:13px;color:var(--muted);line-height:1.8">
          <div><strong style="color:var(--ink)">1. 定义数据表</strong> — 填一个带 <code>{{变量}}</code> 的网址模板，例如 <code>https://example.com/item?id={{id}}</code>。</div>
          <div><strong style="color:var(--ink)">2. 添加列模板</strong> — 每列用 CSS 选择器或 XPath 定位元素，选择提取文本、属性或执行 JS，还能加正则清洗。</div>
          <div><strong style="color:var(--ink)">3. 只填变量添加行</strong> — 在「添加数据行」里只输入变量值，后台用 Chrome 打开页面、抓取并保存快照。</div>
          <div><strong style="color:var(--ink)">4. 自动或手动刷新</strong> — 数据表可以设置刷新间隔，也可以随时点刷新；每次刷新都会写入历史记录，导出中心可导出 CSV / XLSX。</div>
        </div>
      </div>
    </div>`;
  const grid = el.querySelector('#home-tables');
  if (!tables.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;border:1px dashed var(--line-strong);border-radius:14px;background:#fff">
      <div class="empty-art">📊</div><h3>还没有数据表</h3>
      <p>创建第一张表，或者点开演示商店看看模板长什么样。</p>
      <button class="btn primary" id="home-empty-new">${icons.plus} 新建数据表</button></div>`;
  } else {
    grid.innerHTML = tables
      .map(
        (table) => `<a href="#/table/${encodeURIComponent(table.id)}" class="settings-section" style="text-decoration:none;display:block;padding:16px 18px;margin:0;box-shadow:var(--shadow-sm)">
          <div style="display:flex;gap:10px;align-items:center;margin-bottom:8px">
            <span style="font-size:22px">${escapeHtml(table.icon || '📊')}</span>
            <strong style="font-size:14.5px;color:var(--ink)">${escapeHtml(table.name)}</strong>
          </div>
          <div style="font-size:12.5px;color:var(--muted);min-height:38px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${escapeHtml(table.description || '暂无描述')}</div>
          <div style="display:flex;gap:12px;font-size:11.5px;color:var(--faint);margin-top:10px">
            <span>${table.entryCount ?? 0} 行</span><span>${table.errorCount ? `<span style="color:var(--red)">${table.errorCount} 个失败</span>` : '无失败'}</span>
            <span style="margin-left:auto">${table.lastRunAt ? '有更新' : '未刷新'}</span>
          </div>
        </a>`,
      )
      .join('');
  }
  el.querySelector('#home-new')?.addEventListener('click', openNewTable);
  el.querySelector('#home-empty-new')?.addEventListener('click', openNewTable);
}

/* ---------- 路由 ---------- */
export function navigate(hash) {
  if (location.hash === hash) {
    route();
  } else {
    location.hash = hash;
  }
}

async function route() {
  const hash = location.hash || '#/';
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const el = viewEl();
  if (parts[0] === 'settings') {
    state.route = { name: 'settings' };
    renderSidebar();
    await renderSettingsView(el, { state, reloadInfo: () => loadInfo() });
    return;
  }
  if (parts[0] === 'table' && parts[1]) {
    const id = decodeURIComponent(parts[1]);
    const table = state.tables.find((item) => item.id === id) || { id, name: '加载中…', icon: '📊' };
    state.route = { name: 'table', id };
    renderSidebar();
    await renderTableView(el, id, { state, table });
    return;
  }
  state.route = { name: 'home' };
  renderSidebar();
  renderHome();
}

/* ---------- 启动 ---------- */
async function boot() {
  document.getElementById('new-table').addEventListener('click', openNewTable);
  document.getElementById('mobile-menu').addEventListener('click', () => document.getElementById('sidebar').classList.add('open'));
  document.getElementById('mobile-close').addEventListener('click', () => document.getElementById('sidebar').classList.remove('open'));

  window.addEventListener('hashchange', () => {
    document.getElementById('sidebar').classList.remove('open');
    route();
  });

  bus.addEventListener('tables:changed', () => loadTables({ silent: true }));
  bus.addEventListener('info:changed', () => loadInfo());

  await loadTables();
  loadInfo();
  route();

  connectEvents(
    {
      'entry:update': (payload) => bus.dispatchEvent(new CustomEvent('entry:update', { detail: payload })),
      'run:update': (payload) => bus.dispatchEvent(new CustomEvent('run:update', { detail: payload })),
      'entry:deleted': (payload) => bus.dispatchEvent(new CustomEvent('entry:deleted', { detail: payload })),
      'datasets:changed': () => {
        loadTables({ silent: true });
        bus.dispatchEvent(new CustomEvent('datasets:changed'));
      },
    },
    (connected) => {
      state.sseConnected = connected;
      renderSidebar();
    },
  );

  // 轮询兜底：SSE 断开时仍能更新
  setInterval(() => {
    if (!state.sseConnected && state.route.name === 'table') {
      bus.dispatchEvent(new CustomEvent('tick'));
    }
  }, 5000);
}

boot();

export { api, toast, loadTables, loadInfo };
