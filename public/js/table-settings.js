import { apiPatch, apiPost, api, apiDelete } from './api.js';
import { escapeHtml, icons, openModal, toast, confirmDialog } from './ui.js';

const WAIT_UNTIL = [
  ['domcontentloaded', 'DOM 加载完成（推荐）'],
  ['load', '页面完全加载'],
  ['networkidle2', '网络基本空闲'],
  ['networkidle0', '网络完全空闲'],
];

const ACTION_TYPES = [
  ['click', '点击元素'],
  ['type', '输入文字'],
  ['fill', '填充输入框'],
  ['press', '按键'],
  ['wait', '等待毫秒'],
  ['waitSelector', '等待元素出现'],
  ['scroll', '滚动页面'],
  ['scrollTo', '滚动到元素'],
  ['select', '选择下拉项'],
  ['eval', '执行 JS'],
];

function unitFor(seconds) {
  if (seconds && seconds % 3600 === 0) return { unit: 'hour', value: seconds / 3600 };
  if (seconds && seconds % 60 === 0) return { unit: 'minute', value: seconds / 60 };
  return { unit: 'second', value: seconds || 0 };
}

function toSeconds(value, unit) {
  const num = Number(value) || 0;
  if (unit === 'hour') return num * 3600;
  if (unit === 'minute') return num * 60;
  return num;
}

function varsEditorHtml(vars) {
  return vars
    .map(
      (variable, index) => `<div class="var-card" data-var="${index}">
        <div class="var-card-head"><span class="var-title">变量 ${index + 1}</span>
          <button type="button" class="icon-btn sm" data-remove-var="${index}" title="删除变量">${icons.close}</button></div>
        <div class="form-grid three">
          <div class="field"><label>变量名 <span class="optional">用于 {{名字}}</span></label>
            <input type="text" data-var-field="key" value="${escapeHtml(variable.key || '')}" placeholder="asin"></div>
          <div class="field"><label>显示名称</label>
            <input type="text" data-var-field="label" value="${escapeHtml(variable.label || '')}" placeholder="商品 ASIN"></div>
          <div class="field"><label>默认值 <span class="optional">可选</span></label>
            <input type="text" data-var-field="default" value="${escapeHtml(variable.default || '')}" placeholder="B0DEMO001"></div>
          <div class="field"><label>占位提示 <span class="optional">可选</span></label>
            <input type="text" data-var-field="placeholder" value="${escapeHtml(variable.placeholder || '')}" placeholder="输入 ASIN"></div>
          <label class="checkbox" style="align-self:end"><input type="checkbox" data-var-field="required" ${variable.required !== false ? 'checked' : ''}>
            <span class="cb-text">必填<span class="cb-hint">添加行时必须提供</span></span></label>
        </div>
      </div>`,
    )
    .join('');
}

function actionsEditorHtml(actions) {
  if (!actions.length) {
    return '<div class="empty-hint" style="padding:4px 0">还没有页面操作。如果目标页面需要登录、点击“展开”或滚动加载，可以在这里补充。</div>';
  }
  return actions
    .map(
      (action, index) => `<div class="action-card" data-action="${index}">
        <div class="var-card-head"><span class="var-title">步骤 ${index + 1}</span>
          <button type="button" class="icon-btn sm" data-remove-action="${index}" title="删除">${icons.close}</button></div>
        <div class="form-grid three">
          <div class="field"><label>类型</label>
            <select data-action-field="type">${ACTION_TYPES.map(([value, label]) => `<option value="${value}" ${action.type === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div>
          <div class="field"><label>选择器 / 按键</label>
            <input type="text" data-action-field="selector" value="${escapeHtml(action.selector || '')}" placeholder=".load-more 或 Enter"></div>
          <div class="field"><label>文本 / 数值</label>
            <input type="text" data-action-field="value" value="${escapeHtml(action.value ?? '')}" placeholder="可选"></div>
          <div class="field"><label>之后等待（毫秒）</label>
            <input type="number" data-action-field="delayMs" value="${Number(action.delayMs) || 0}" min="0" max="30000" step="100"></div>
        </div>
      </div>`,
    )
    .join('');
}

export function openTableEditor({ table = null, onSaved, onDeleted }) {
  const editing = Boolean(table);
  const settings = table?.settings || {};
  const vars = JSON.parse(JSON.stringify(table?.variables || []));
  const actions = JSON.parse(JSON.stringify(settings.actions || []));
  const interval = unitFor(settings.intervalSec || 0);

  const body = document.createElement('div');
  body.innerHTML = `
    <div class="form-grid">
      <div class="form-grid three">
        <div class="field"><label>图标</label><input type="text" id="te-icon" value="${escapeHtml(table?.icon || '📊')}" maxlength="8" style="font-size:18px"></div>
        <div class="field" style="grid-column:span 2"><label>数据表名称</label><input type="text" id="te-name" value="${escapeHtml(table?.name || '')}" placeholder="例如：竞品价格追踪" maxlength="120"></div>
      </div>
      <div class="field"><label>描述 <span class="optional">可选</span></label>
        <input type="text" id="te-desc" value="${escapeHtml(table?.description || '')}" placeholder="这张表用来追踪什么？" maxlength="2000"></div>
      <div class="field"><label>网址模板</label>
        <input type="text" id="te-url" value="${escapeHtml(table?.urlTemplate || '')}" placeholder="https://example.com/product?asin={{asin}}">
        <div class="hint">用 <code>{{变量}}</code> 表示会被替换的部分；URL 中会自动做编码。例如 <code>https://example.com/search?q={{关键词}}</code></div></div>
    </div>

    <div class="section-divider"></div>
    <div class="section-title" style="margin-top:0">变量（添加行时只需要填这些）</div>
    <div class="vars-editor" id="te-vars">${varsEditorHtml(vars)}</div>
    <div style="margin-top:8px"><button type="button" class="btn sm" id="te-add-var">${icons.plus} 添加变量</button></div>

    <div class="section-divider"></div>
    <div class="section-title" style="margin-top:0">抓取设置</div>
    <div class="form-grid three">
      <div class="field"><label>页面等待策略</label>
        <select id="te-wait-until">${WAIT_UNTIL.map(([value, label]) => `<option value="${value}" ${(settings.waitUntil || 'domcontentloaded') === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div>
      <div class="field"><label>额外等待（毫秒）</label>
        <input type="number" id="te-wait-ms" value="${Number(settings.waitMs) || 0}" min="0" max="60000" step="100"></div>
      <div class="field"><label>超时（毫秒）</label>
        <input type="number" id="te-timeout" value="${Number(settings.timeoutMs) || 30000}" min="3000" max="120000" step="1000"></div>
      <div class="field" style="grid-column:span 2"><label>先等待这个元素出现 <span class="optional">可选，多个用逗号分隔</span></label>
        <input type="text" id="te-wait-selector" value="${escapeHtml(settings.waitForSelector || '')}" placeholder=".product-title, #price"></div>
      <label class="checkbox" style="align-self:end"><input type="checkbox" id="te-scroll" ${settings.scroll ? 'checked' : ''}>
        <span class="cb-text">自动滚动到底部<span class="cb-hint">适合懒加载页面</span></span></label>
    </div>

    <div class="section-divider"></div>
    <div class="section-title" style="margin-top:0">自动刷新</div>
    <div class="form-grid two">
      <label class="checkbox"><input type="checkbox" id="te-auto-refresh" ${settings.autoRefresh !== false ? 'checked' : ''}>
        <span class="cb-text">启用定时刷新<span class="cb-hint">关闭后只能手动刷新</span></span></label>
      <div class="field"><label>刷新间隔</label>
        <div class="form-row">
          <input type="number" id="te-interval" value="${interval.value}" min="0" step="1" style="max-width:120px">
          <select id="te-interval-unit" style="max-width:110px">
            <option value="second" ${interval.unit === 'second' ? 'selected' : ''}>秒</option>
            <option value="minute" ${interval.unit === 'minute' ? 'selected' : ''}>分钟</option>
            <option value="hour" ${interval.unit === 'hour' ? 'selected' : ''}>小时</option>
          </select>
          <span class="hint" style="align-self:center">0 表示不自动刷新</span>
        </div></div>
    </div>

    <div class="section-divider"></div>
    <div class="section-title" style="margin-top:0">页面操作 <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--faint)">（可选，按顺序执行）</span></div>
    <div class="vars-editor" id="te-actions">${actionsEditorHtml(actions)}</div>
    <div style="margin-top:8px"><button type="button" class="btn sm" id="te-add-action">${icons.plus} 添加步骤</button></div>

    ${editing ? `<div class="section-divider"></div>
    <div class="form-row" style="justify-content:space-between;align-items:center">
      <div style="font-size:12px;color:var(--muted)">模板可以把这张表的网址、变量和列一起分享给别人。</div>
      <div style="display:flex;gap:6px"><button type="button" class="btn sm" id="te-export-template">${icons.download} 导出模板</button>
      <button type="button" class="btn sm" id="te-import-template">导入模板</button></div>
    </div>
    <div class="section-divider"></div>
    <div class="danger-zone" style="border:1px solid #f0d6da;border-radius:10px;padding:12px;display:flex;align-items:center;gap:10px">
      <div style="flex:1;font-size:12.5px;color:var(--muted)"><strong style="color:var(--red)">删除数据表</strong><br>所有行、快照和历史记录都会被删除，且无法恢复。</div>
      <button type="button" class="btn danger sm" id="te-delete">${icons.trash} 删除</button>
    </div>` : ''}
  `;

  const modal = openModal({
    title: editing ? '数据表设置' : '新建数据表',
    subtitle: editing ? '修改网址模板、变量与刷新策略' : '先定义网址模板和变量，保存后即可添加列',
    size: 'wide',
    body,
    actions: [
      { label: '取消', variant: 'ghost' },
      {
        label: editing ? '保存设置' : '创建数据表',
        variant: 'primary',
        onClick: async (controller) => {
          const payload = collect();
          if (payload.error) {
            controller.setError(payload.error);
            return true;
          }
          controller.setBusy(true);
          controller.clearError();
          try {
            const result = editing
              ? await apiPatch(`/api/tables/${table.id}`, payload.data)
              : await apiPost('/api/tables', payload.data);
            toast(editing ? '设置已保存' : '数据表已创建', 'ok');
            if (typeof onSaved === 'function') await onSaved(result.table);
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

  const varsRoot = body.querySelector('#te-vars');
  const actionsRoot = body.querySelector('#te-actions');

  function collectVars() {
    varsRoot.querySelectorAll('[data-var]').forEach((card) => {
      const index = Number(card.dataset.var);
      const variable = vars[index] || {};
      card.querySelectorAll('[data-var-field]').forEach((input) => {
        const key = input.dataset.varField;
        variable[key] = input.type === 'checkbox' ? input.checked : input.value.trim();
      });
      vars[index] = variable;
    });
  }

  function collectActions() {
    actionsRoot.querySelectorAll('[data-action]').forEach((card) => {
      const index = Number(card.dataset.action);
      const action = actions[index] || {};
      card.querySelectorAll('[data-action-field]').forEach((input) => {
        const key = input.dataset.actionField;
        action[key] = key === 'delayMs' ? Number(input.value) || 0 : input.value;
      });
      actions[index] = action;
    });
  }

  function refreshVars() {
    varsRoot.innerHTML = varsEditorHtml(vars);
  }
  function refreshActions() {
    actionsRoot.innerHTML = actionsEditorHtml(actions);
  }

  varsRoot.addEventListener('input', (event) => {
    const card = event.target.closest('[data-var]');
    if (!card) return;
    const index = Number(card.dataset.var);
    const field = event.target.dataset.varField;
    if (!field) return;
    if (!vars[index]) vars[index] = {};
    vars[index][field] = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
  });
  varsRoot.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-remove-var]');
    if (!btn) return;
    collectVars();
    vars.splice(Number(btn.dataset.removeVar), 1);
    refreshVars();
  });
  body.querySelector('#te-add-var').addEventListener('click', () => {
    collectVars();
    vars.push({ key: '', label: '', placeholder: '', default: '', required: true });
    refreshVars();
  });

  actionsRoot.addEventListener('input', (event) => {
    const card = event.target.closest('[data-action]');
    if (!card) return;
    const index = Number(card.dataset.action);
    const field = event.target.dataset.actionField;
    if (!field) return;
    if (!actions[index]) actions[index] = {};
    actions[index][field] = event.target.value;
  });
  actionsRoot.addEventListener('change', (event) => {
    if (event.target.dataset.actionField === 'type') {
      collectActions();
      refreshActions();
    }
  });
  actionsRoot.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-remove-action]');
    if (!btn) return;
    collectActions();
    actions.splice(Number(btn.dataset.removeAction), 1);
    refreshActions();
  });
  body.querySelector('#te-add-action').addEventListener('click', () => {
    collectActions();
    actions.push({ type: 'click', selector: '', value: '', delayMs: 300 });
    refreshActions();
  });

  function collect() {
    collectVars();
    collectActions();
    const name = body.querySelector('#te-name').value.trim();
    const urlTemplate = body.querySelector('#te-url').value.trim();
    if (!name) return { error: '请填写数据表名称' };
    if (!urlTemplate) return { error: '请填写网址模板' };
    if (!/^https?:\/\//i.test(urlTemplate)) return { error: '网址模板必须以 http:// 或 https:// 开头' };
    const cleanedVars = vars
      .filter((variable) => variable.key && String(variable.key).trim())
      .map((variable) => ({
        key: String(variable.key).trim(),
        label: String(variable.label || '').trim() || String(variable.key).trim(),
        placeholder: String(variable.placeholder || '').trim(),
        default: String(variable.default || '').trim(),
        required: variable.required !== false,
      }));
    const keys = new Set();
    for (const variable of cleanedVars) {
      if (!/^[\p{L}\p{N}_-]{1,64}$/u.test(variable.key)) {
        return { error: `变量名「${variable.key}」不合法，只能包含字母、数字、下划线或短横线` };
      }
      if (keys.has(variable.key)) return { error: `变量名「${variable.key}」重复` };
      keys.add(variable.key);
    }
    const intervalSec = toSeconds(body.querySelector('#te-interval').value, body.querySelector('#te-interval-unit').value);
    const data = {
      name,
      icon: body.querySelector('#te-icon').value.trim() || '📊',
      description: body.querySelector('#te-desc').value.trim(),
      urlTemplate,
      variables: cleanedVars,
      settings: {
        intervalSec,
        waitUntil: body.querySelector('#te-wait-until').value,
        waitMs: Number(body.querySelector('#te-wait-ms').value) || 0,
        timeoutMs: Number(body.querySelector('#te-timeout').value) || 30000,
        waitForSelector: body.querySelector('#te-wait-selector').value.trim(),
        scroll: body.querySelector('#te-scroll').checked,
        autoRefresh: body.querySelector('#te-auto-refresh').checked,
        actions: actions
          .filter((action) => action.type)
          .map((action) => ({
            type: action.type,
            selector: String(action.selector || '').trim(),
            value: String(action.value ?? ''),
            delayMs: Number(action.delayMs) || 0,
          })),
      },
    };
    return { data };
  }

  if (editing) {
    body.querySelector('#te-export-template').addEventListener('click', async () => {
      try {
        const data = await api(`/api/tables/${table.id}/template`);
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${table.name.replace(/[\\/:*?"<>|]/g, '_')}_template.json`;
        a.click();
        URL.revokeObjectURL(a.href);
        toast('模板已导出', 'ok');
      } catch (err) {
        toast(err.message, 'error');
      }
    });
    body.querySelector('#te-import-template').addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json,.json';
      input.addEventListener('change', async () => {
        const file = input.files?.[0];
        if (!file) return;
        try {
          const parsed = JSON.parse(await file.text());
          const payload = parsed.table ? parsed : { table: parsed, fields: parsed.fields || [] };
          await apiPost('/api/tables/import', payload);
          toast('模板已导入为新的数据表', 'ok');
          modal.close();
          location.hash = '#/';
          setTimeout(() => location.reload(), 50);
        } catch (err) {
          toast(`导入失败：${err.message}`, 'error');
        }
      });
      input.click();
    });
    body.querySelector('#te-delete').addEventListener('click', async () => {
      const yes = await confirmDialog({
        title: `删除「${table.name}」？`,
        message: '这张表的所有行、抓取快照与历史都会永久删除。',
        confirmText: '永久删除',
        danger: true,
      });
      if (!yes) return;
      try {
        await apiDelete(`/api/tables/${table.id}`);
        modal.close();
        toast('数据表已删除', 'ok');
        if (typeof onDeleted === 'function') onDeleted(table);
        else {
          location.hash = '#/';
          setTimeout(() => location.reload(), 50);
        }
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }

  return modal;
}
