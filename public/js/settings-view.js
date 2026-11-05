import { api, apiGet, apiPost, apiPut } from './api.js';
import { escapeHtml, icons, loadingBlock, toast, confirmDialog, copyText } from './ui.js';

const DRIVERS = [
  ['sqlite', 'SQLite（内置，无需安装）'],
  ['postgres', 'PostgreSQL'],
  ['mysql', 'MySQL / MariaDB'],
];

export async function renderSettingsView(container, { state, reloadInfo }) {
  container.innerHTML = `<div class="settings-page">${loadingBlock(7).outerHTML}</div>`;

  let settings;
  try {
    settings = await apiGet('/api/settings');
  } catch (err) {
    container.innerHTML = `<div class="settings-page"><div class="error-text">${escapeHtml(err.message)}</div></div>`;
    return;
  }
  state.info = settings;

  const config = settings.config;
  const scraper = config.scraper;
  const db = settings.db;
  const isSqlite = db.driver === 'sqlite';
  const network = settings.network || { host: config.host, port: config.port, lanVisible: false, localUrl: `http://127.0.0.1:${config.port}`, lanUrls: [] };

  container.innerHTML = `
  <div class="settings-page">
    <div class="breadcrumb"><a href="#/">← 返回数据表</a></div>
    <h2>设置</h2>
    <p class="lead">数据库、Chrome 抓取器、网络访问与自动刷新策略。修改会写入 <code style="font-size:11.5px">data/config.json</code>。</p>

    <section class="settings-section">
      <div class="section-head">
        <h3>数据库</h3>
        <span class="sh-sub"><span class="badge on">${escapeHtml(db.label)}</span></span>
      </div>
      <div class="section-body">
        <div class="form-grid two">
          <div class="field"><label>数据库类型</label>
            <select id="db-driver">${DRIVERS.map(([value, label]) => `<option value="${value}" ${db.driver === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div>
          <div class="field" id="db-share-field"><label>说明</label>
            <div class="hint" style="padding-top:6px">默认使用 Node 内置的 SQLite，数据保存在本地文件里。也可以切换到已有的 PostgreSQL / MySQL。</div></div>
        </div>
        <div class="field" id="db-file-field"><label>SQLite 文件</label>
          <input type="text" id="db-file" value="${escapeHtml(isSqlite ? settings.paths.database : 'data/tracker.db')}" placeholder="data/tracker.db">
          <div class="hint">相对路径以项目根目录为准。切换到一个新文件会得到一张全新的空数据库。</div></div>
        <div class="field" id="db-url-field" style="display:none"><label>连接串</label>
          <input type="text" id="db-url" value="${escapeHtml(db.url || '')}" placeholder="postgres://user:pass@localhost:5432/tracker">
          <div class="hint">PostgreSQL 需要 <code>npm install pg</code>，MySQL 需要 <code>npm install mysql2</code>；未安装时连接会提示。</div></div>
        <div class="preview-box">
          <div class="pv-row"><span class="pv-label">当前连接</span><span class="pv-value mono">${escapeHtml(db.label)}</span></div>
          <div class="pv-row"><span class="pv-label">数据量</span><span class="pv-value">${settings.stats.datasets} 张表 · ${settings.stats.entries} 行 · ${settings.stats.snapshots} 条快照 · ${settings.stats.runs} 次刷新</span></div>
        </div>
        <div class="form-row">
          <button class="btn" id="db-test">测试连接</button>
          <button class="btn primary" id="db-save">保存并切换</button>
          <span class="spacer" style="flex:1"></span>
          ${isSqlite ? `<button class="btn ghost" id="db-backup">${icons.download} 下载数据库备份</button>` : ''}
        </div>
      </div>
    </section>

    <section class="settings-section">
      <div class="section-head">
        <h3>Chrome 抓取器</h3>
        <span class="sh-sub"><span class="badge ${settings.chrome.running ? 'on' : 'off'}">${settings.chrome.running ? '运行中' : '未启动'}</span></span>
      </div>
      <div class="section-body">
        <div class="field"><label>Chrome 可执行文件</label>
          <input type="text" id="sc-chrome-path" value="${escapeHtml(scraper.chromePath || '')}" placeholder="留空自动查找（推荐）">
          <div class="hint">当前检测到：<code>${escapeHtml(settings.chrome.path || '未找到 Chrome，请安装或手动填写路径')}</code></div></div>
        <div class="form-grid three">
          <div class="field"><label>并发窗口数</label>
            <input type="number" id="sc-concurrency" value="${Number(scraper.concurrency) || 3}" min="1" max="10">
            <div class="hint">同时抓取的行数，1–10。</div></div>
          <div class="field"><label>单页超时（毫秒）</label>
            <input type="number" id="sc-timeout" value="${Number(scraper.timeoutMs) || 30000}" min="3000" max="120000" step="1000"></div>
          <div class="field"><label>浏览器语言</label>
            <input type="text" id="sc-locale" value="${escapeHtml(scraper.locale || 'zh-CN')}" placeholder="zh-CN"></div>
        </div>
        <div class="inline-list" style="gap:20px">
          <label class="checkbox"><input type="checkbox" id="sc-headless" ${scraper.headless ? 'checked' : ''}>
            <span class="cb-text">无头模式<span class="cb-hint">不显示浏览器窗口</span></span></label>
          <label class="checkbox"><input type="checkbox" id="sc-nosandbox" ${scraper.noSandbox ? 'checked' : ''}>
            <span class="cb-text">禁用 Chrome 沙箱<span class="cb-hint">在部分容器/受限环境中必须开启</span></span></label>
        </div>
        <div class="preview-box">
          <div class="pv-row"><span class="pv-label">用户数据目录</span><span class="pv-value mono">${escapeHtml(settings.chrome.profileDir || config.scraper.profileDir || 'data/chrome-profile')}</span></div>
          <div class="pv-row"><span class="pv-label">持久化登录</span><span class="pv-value">浏览器会话会保存在该目录，重启后仍在（可在其中手动登录需要登录的站点）。</span></div>
          <div class="pv-row"><span class="pv-label">Chrome 版本</span><span class="pv-value mono">${escapeHtml(settings.chrome.version || '—')}</span></div>
        </div>
        <div class="form-row">
          <button class="btn" id="sc-test">${icons.play} 测试启动 Chrome</button>
          <button class="btn primary" id="sc-save">保存浏览器设置</button>
          <span class="spacer" style="flex:1"></span>
          <button class="btn ghost" id="sc-close" ${settings.chrome.running ? '' : 'disabled'}>关闭浏览器</button>
        </div>
      </div>
    </section>

    <section class="settings-section">
      <div class="section-head">
        <h3>网络访问</h3>
        <span class="sh-sub"><span class="badge ${network.lanVisible ? 'on' : 'off'}">${network.lanVisible ? '局域网可访问' : '仅本机'}</span></span>
      </div>
      <div class="section-body">
        <div class="form-grid two">
          <div class="field"><label>监听地址</label>
            <select id="net-host">
              <option value="0.0.0.0" ${network.host === '0.0.0.0' ? 'selected' : ''}>0.0.0.0 — 局域网内可访问</option>
              <option value="127.0.0.1" ${network.host === '127.0.0.1' ? 'selected' : ''}>127.0.0.1 — 仅本机</option>
            </select>
            <div class="hint">修改后需要重启程序（Ctrl+C 后重新 npm start）。</div>
          </div>
          <div class="field"><label>端口</label>
            <input type="text" value="${escapeHtml(String(network.port))}" disabled>
            <div class="hint">要改端口，请编辑 data/config.json 的 port，或启动时设置 PORT。</div>
          </div>
        </div>
        <div class="preview-box">
          <div class="pv-row"><span class="pv-label">本机地址</span><span class="pv-value mono"><a href="${escapeHtml(network.localUrl)}" target="_blank" rel="noopener">${escapeHtml(network.localUrl)}</a></span></div>
          ${
            network.lanUrls && network.lanUrls.length
              ? network.lanUrls
                  .map(
                    (url) =>
                      `<div class="pv-row"><span class="pv-label">局域网地址</span><span class="pv-value mono"><a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(url)}</a> <button class="link-btn" data-copy="${escapeHtml(url)}">复制</button></span></div>`,
                  )
                  .join('')
              : `<div class="pv-row"><span class="pv-label">局域网地址</span><span class="pv-value">${network.lanVisible ? '未检测到局域网 IPv4 地址，请检查 Wi-Fi / 网线' : '切换到 0.0.0.0 并重启后，这里会显示可访问地址'}</span></div>`
          }
        </div>
        <div class="form-row">
          <button class="btn primary" id="net-save">保存监听设置</button>
          <span class="hint" style="align-self:center">其他设备需要与本机处于同一局域网。</span>
        </div>
        <div class="hint" style="margin-top:10px">⚠️ 本工具没有登录鉴权，同网段任何设备都能打开并操作它。请只在可信网络中使用，不要把端口转发到公网。</div>
      </div>
    </section>

    <section class="settings-section">
      <div class="section-head"><h3>自动刷新</h3></div>
      <div class="section-body">
        <label class="checkbox"><input type="checkbox" id="sch-enabled" ${config.scheduler.enabled ? 'checked' : ''}>
          <span class="cb-text">启用后台调度器<span class="cb-hint">关闭后所有数据表都不会自动刷新，但手动刷新仍然可用。每张表自己的刷新间隔在「表设置」里配置。</span></span></label>
        <div class="form-row"><button class="btn primary" id="sch-save">保存</button>
          <span class="hint" style="align-self:center">调度器每 ${Math.round((config.scheduler.tickMs || 5000) / 1000)} 秒检查一次。</span></div>
      </div>
    </section>

    <section class="settings-section">
      <div class="section-head"><h3>关于</h3><span class="sh-sub">v${escapeHtml(settings.version)}</span></div>
      <div class="section-body">
        <dl class="kv-list">
          <dt>本机地址</dt><dd>${escapeHtml(network.localUrl)}</dd>
          ${network.lanUrls && network.lanUrls.length ? `<dt>局域网地址</dt><dd>${network.lanUrls.map((url) => escapeHtml(url)).join('<br>')}</dd>` : '<dt>局域网地址</dt><dd>仅本机（未开放）</dd>'}
          <dt>Node 版本</dt><dd>${escapeHtml(settings.node)}</dd>
          <dt>数据目录</dt><dd>${escapeHtml(settings.paths.dataDir)}</dd>
          <dt>配置文件</dt><dd>${escapeHtml(settings.paths.config)}</dd>
          <dt>工具版本</dt><dd>${escapeHtml(settings.version)}</dd>
        </dl>
        <div class="hint">演示站点：<a href="/demo" target="_blank" rel="noopener">/demo</a> · 导出中心：<a href="/export">/export</a></div>
      </div>
    </section>
  </div>`;

  /* ---------- 数据库 ---------- */
  const driverSelect = container.querySelector('#db-driver');
  const fileField = container.querySelector('#db-file-field');
  const urlField = container.querySelector('#db-url-field');
  const shareField = container.querySelector('#db-share-field');
  function syncDbFields() {
    const driver = driverSelect.value;
    fileField.style.display = driver === 'sqlite' ? '' : 'none';
    urlField.style.display = driver === 'sqlite' ? 'none' : '';
    shareField.style.display = driver === 'sqlite' ? '' : 'none';
  }
  driverSelect.addEventListener('change', syncDbFields);
  syncDbFields();

  function dbPayload() {
    const driver = driverSelect.value;
    return driver === 'sqlite'
      ? { driver, file: container.querySelector('#db-file').value.trim() }
      : { driver, url: container.querySelector('#db-url').value.trim() };
  }

  container.querySelector('#db-test').addEventListener('click', async (event) => {
    const btn = event.currentTarget;
    btn.disabled = true;
    btn.textContent = '测试中…';
    try {
      const result = await apiPost('/api/settings/db/test', dbPayload());
      toast(`连接成功：${result.db?.label || '数据库可用'}`, 'ok');
    } catch (err) {
      toast(err.message, 'error', 6000);
    } finally {
      btn.disabled = false;
      btn.textContent = '测试连接';
    }
  });

  container.querySelector('#db-save').addEventListener('click', async () => {
    const payload = dbPayload();
    if (payload.driver === 'sqlite' && !payload.file) return toast('请填写 SQLite 文件路径', 'error');
    if (payload.driver !== 'sqlite' && !payload.url) return toast('请填写连接串', 'error');
    const yes = await confirmDialog({
      title: '切换数据库？',
      message: '当前连接会立即切换。新数据库会自动建表，但不会自动复制旧数据；需要迁移请先用备份/导出功能。',
      confirmText: '切换',
    });
    if (!yes) return;
    try {
      await apiPut('/api/settings/db', payload);
      toast('数据库已切换', 'ok');
      if (typeof reloadInfo === 'function') reloadInfo();
      await renderSettingsView(container, { state, reloadInfo });
    } catch (err) {
      toast(err.message, 'error', 7000);
    }
  });

  container.querySelector('#db-backup')?.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/settings/backup');
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `下载失败（${res.status}）`);
      }
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `internet-tracker-backup-${new Date().toISOString().slice(0, 10)}.db`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast('备份已开始下载', 'ok');
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  /* ---------- Chrome ---------- */
  container.querySelector('#sc-test').addEventListener('click', async (event) => {
    const btn = event.currentTarget;
    btn.disabled = true;
    btn.innerHTML = `${icons.refresh} 正在启动…`;
    try {
      const result = await apiPost('/api/settings/chrome/test');
      toast(`Chrome 正常：${result.version || '已启动'}（${result.durationMs}ms）`, 'ok');
      await renderSettingsView(container, { state, reloadInfo });
    } catch (err) {
      toast(err.message, 'error', 8000);
      btn.disabled = false;
      btn.innerHTML = `${icons.play} 测试启动 Chrome`;
    }
  });

  container.querySelector('#sc-save').addEventListener('click', async () => {
    try {
      await apiPut('/api/settings', {
        scraper: {
          chromePath: container.querySelector('#sc-chrome-path').value.trim(),
          concurrency: Number(container.querySelector('#sc-concurrency').value) || 3,
          timeoutMs: Number(container.querySelector('#sc-timeout').value) || 30000,
          locale: container.querySelector('#sc-locale').value.trim() || 'zh-CN',
          headless: container.querySelector('#sc-headless').checked,
          noSandbox: container.querySelector('#sc-nosandbox').checked,
        },
      });
      toast('浏览器设置已保存', 'ok');
      if (typeof reloadInfo === 'function') reloadInfo();
      await renderSettingsView(container, { state, reloadInfo });
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  container.querySelector('#sc-close').addEventListener('click', async () => {
    try {
      await apiPost('/api/settings/chrome/close');
      toast('Chrome 已关闭，下次抓取会重新启动', 'ok');
      await renderSettingsView(container, { state, reloadInfo });
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  /* ---------- 网络 ---------- */
  container.querySelector('#net-save').addEventListener('click', async () => {
    const host = container.querySelector('#net-host').value;
    try {
      const result = await apiPut('/api/settings', { host });
      toast(result.restartRequired ? '已保存，重启程序后生效' : '监听设置未变化', 'ok', 5000);
      await renderSettingsView(container, { state, reloadInfo });
    } catch (err) {
      toast(err.message, 'error', 6000);
    }
  });

  container.querySelectorAll('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await copyText(btn.dataset.copy);
        toast('已复制地址', 'ok', 1800);
      } catch {
        toast('复制失败，请手动选择地址', 'error');
      }
    });
  });

  /* ---------- 调度器 ---------- */
  container.querySelector('#sch-save').addEventListener('click', async () => {
    try {
      await apiPut('/api/settings', { scheduler: { enabled: container.querySelector('#sch-enabled').checked } });
      toast('自动刷新设置已保存', 'ok');
      if (typeof reloadInfo === 'function') reloadInfo();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}
