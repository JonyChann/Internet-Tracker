import { apiPatch, apiPost } from './api.js';
import { escapeHtml, icons, openModal, toast, statusBadge, formatDuration } from './ui.js';

const DATA_TYPES = [
  ['text', '文本'],
  ['number', '数字'],
  ['date', '日期'],
  ['url', '链接'],
  ['image', '图片'],
  ['json', 'JSON'],
  ['boolean', '是/否'],
];

const EXTRACT_MODES = [
  ['text', '文本内容 (innerText)'],
  ['html', '内部 HTML'],
  ['outerHTML', '外部 HTML'],
  ['attribute', '元素属性 (attribute)'],
  ['property', 'DOM 属性 (property)'],
  ['href', '链接地址 (href)'],
  ['src', '资源地址 (src)'],
  ['value', '输入框的值 (value)'],
  ['count', '匹配元素数量'],
  ['exists', '是否存在'],
  ['js', '自定义 JS 代码'],
];

function defaultTemplate() {
  return { selector: '', extract: 'text', attribute: '', property: '', regex: '', regexGroup: 1, multiple: false, trim: true, collapse: true, code: '' };
}

export function openFieldEditor({ table, field = null, onSaved }) {
  const editing = Boolean(field);
  const template = { ...defaultTemplate(), ...(field?.template || {}) };
  const hasEntries = Array.isArray(table._entries) && table._entries.length > 0;

  const previewVars = {};
  for (const variable of table.variables || []) {
    const first = hasEntries ? table._entries[0].vars?.[variable.key] : undefined;
    previewVars[variable.key] = first ?? variable.default ?? '';
  }

  const body = document.createElement('div');
  body.innerHTML = `
    <div class="form-grid">
      <div class="form-grid two">
        <div class="field"><label>列名称</label><input type="text" id="fe-name" value="${escapeHtml(field?.name || '')}" placeholder="例如：价格" maxlength="120"></div>
        <div class="field"><label>数据类型</label>
          <select id="fe-type">${DATA_TYPES.map(([value, label]) => `<option value="${value}" ${(field?.dataType || 'text') === value ? 'selected' : ''}>${label}</option>`).join('')}</select>
          <div class="hint">数字会去掉千分位；链接/图片会补全为绝对地址。</div></div>
      </div>
      <div class="form-grid two">
        <div class="field"><label>提取方式</label>
          <select id="fe-extract">${EXTRACT_MODES.map(([value, label]) => `<option value="${value}" ${template.extract === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div>
        <div class="field" id="fe-attribute-field"><label>属性名 <span class="optional">attribute / property 时必填</span></label>
          <input type="text" id="fe-attribute" value="${escapeHtml(template.attribute || template.property || '')}" placeholder="data-price / href / src"></div>
      </div>
      <div class="field" id="fe-selector-field"><label>选择器</label>
        <input type="text" id="fe-selector" value="${escapeHtml(template.selector || '')}" placeholder=".price .amount  或  xpath=//h1[@class='title']">
        <div class="hint">支持标准 CSS 选择器，也支持 <code>xpath=//div[@id="main"]</code> 或直接写 <code>//div</code>。默认取第一个匹配元素。</div></div>
      <div class="field" id="fe-code-field"><label>JS 代码</label>
        <textarea id="fe-code" rows="4" placeholder="return document.querySelector('.price')?.innerText;"><\/textarea>
        <div class="hint">在页面上下文中执行，可使用 <code>vars</code>（变量对象），用 <code>return</code> 返回结果。</div></div>
      <div class="form-grid two">
        <div class="field"><label>正则清洗 <span class="optional">可选</span></label>
          <input type="text" id="fe-regex" value="${escapeHtml(template.regex || '')}" placeholder="[\\d,.]+">
          <div class="hint">只保留匹配到的部分，可只写捕获组。</div></div>
        <div class="field"><label>捕获组序号 <span class="optional">默认 1</span></label>
          <input type="number" id="fe-regex-group" value="${Number(template.regexGroup) || 1}" min="0" max="9"></div>
      </div>
      <div class="inline-list" style="gap:16px">
        <label class="checkbox"><input type="checkbox" id="fe-multiple" ${template.multiple ? 'checked' : ''}>
          <span class="cb-text">提取所有匹配<span class="cb-hint">保存为多值</span></span></label>
        <label class="checkbox"><input type="checkbox" id="fe-trim" ${template.trim !== false ? 'checked' : ''}>
          <span class="cb-text">去除首尾空白</span></label>
        <label class="checkbox"><input type="checkbox" id="fe-collapse" ${template.collapse !== false ? 'checked' : ''}>
          <span class="cb-text">合并连续空白</span></label>
      </div>

      <div class="section-divider"></div>
      <div class="section-title" style="margin-top:0">预览</div>
      <div class="form-grid two" id="fe-preview-vars">
        ${(table.variables || [])
          .map(
            (variable) => `<div class="field"><label>${escapeHtml(variable.label || variable.key)} <span class="optional">{{${escapeHtml(variable.key)}}}</span></label>
              <input type="text" data-preview-var="${escapeHtml(variable.key)}" value="${escapeHtml(previewVars[variable.key] ?? '')}" placeholder="${escapeHtml(variable.placeholder || '')}"></div>`,
          )
          .join('')}
      </div>
      <div class="form-row">
        <button type="button" class="btn" id="fe-preview">${icons.play} 抓取预览</button>
        <span class="hint" id="fe-preview-hint">会真实打开目标页面，可能需要几秒。</span>
      </div>
      <div id="fe-preview-result"></div>
    </div>
  `;

  const modal = openModal({
    title: editing ? `编辑列「${field.name}」` : '添加列模板',
    subtitle: '每一列 = 一个选择器 + 一种提取方式',
    size: 'wide',
    body,
    actions: [
      { label: '取消', variant: 'ghost' },
      {
        label: editing ? '保存列' : '添加列',
        variant: 'primary',
        onClick: async (controller) => {
          controller.clearError();
          const payload = collect();
          if (payload.error) {
            controller.setError(payload.error);
            return true;
          }
          controller.setBusy(true);
          try {
            const result = editing
              ? await apiPatch(`/api/fields/${field.id}`, payload.data)
              : await apiPost(`/api/tables/${table.id}/fields`, payload.data);
            toast(editing ? '列已更新' : '列已添加', 'ok');
            if (typeof onSaved === 'function') onSaved(result.field);
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

  const extractSelect = body.querySelector('#fe-extract');
  const attributeField = body.querySelector('#fe-attribute-field');
  const selectorField = body.querySelector('#fe-selector-field');
  const codeField = body.querySelector('#fe-code-field');
  function syncMode() {
    const mode = extractSelect.value;
    attributeField.style.display = mode === 'attribute' || mode === 'property' ? '' : 'none';
    codeField.style.display = mode === 'js' ? '' : 'none';
    selectorField.style.display = mode === 'js' ? 'none' : '';
  }
  extractSelect.addEventListener('change', syncMode);
  syncMode();

  function collect() {
    const name = body.querySelector('#fe-name').value.trim();
    if (!name) return { error: '请填写列名称' };
    const extract = extractSelect.value;
    const attribute = body.querySelector('#fe-attribute').value.trim();
    const selector = body.querySelector('#fe-selector').value.trim();
    const code = body.querySelector('#fe-code').value;
    if (extract === 'js') {
      if (!code.trim()) return { error: '请填写 JS 代码' };
    } else if (!selector) {
      return { error: '请填写选择器' };
    }
    if ((extract === 'attribute' || extract === 'property') && !attribute) {
      return { error: '请填写属性名，例如 data-price' };
    }
    const regex = body.querySelector('#fe-regex').value;
    if (regex) {
      try {
        new RegExp(regex);
      } catch (err) {
        return { error: `正则表达式无效：${err.message}` };
      }
    }
    const data = {
      name,
      dataType: body.querySelector('#fe-type').value,
      template: {
        selector: extract === 'js' ? '' : selector,
        extract,
        attribute: extract === 'attribute' || extract === 'property' ? attribute : '',
        property: extract === 'property' ? attribute : '',
        regex,
        regexGroup: Number(body.querySelector('#fe-regex-group').value) || 1,
        multiple: body.querySelector('#fe-multiple').checked,
        trim: body.querySelector('#fe-trim').checked,
        collapse: body.querySelector('#fe-collapse').checked,
        code: extract === 'js' ? code : '',
      },
    };
    return { data };
  }

  body.querySelector('#fe-preview').addEventListener('click', async (event) => {
    const resultBox = body.querySelector('#fe-preview-result');
    const btn = event.currentTarget;
    const payload = collect();
    if (payload.error) {
      resultBox.innerHTML = `<div class="error-text">${escapeHtml(payload.error)}</div>`;
      return;
    }
    const vars = {};
    body.querySelectorAll('[data-preview-var]').forEach((input) => {
      vars[input.dataset.previewVar] = input.value;
    });
    btn.disabled = true;
    btn.innerHTML = `${icons.refresh} 抓取中…`;
    resultBox.innerHTML = '<div class="preview-box"><div class="skeleton skel-row" style="width:70%"></div><div class="skeleton skel-row" style="width:45%"></div></div>';
    try {
      const result = await apiPost(`/api/tables/${table.id}/preview`, {
        vars,
        field: { name: payload.data.name, dataType: payload.data.dataType, template: payload.data.template },
      });
      const value = result.values?.draft;
      const error = result.errors?.draft;
      resultBox.innerHTML = `<div class="preview-box">
        <div class="pv-row"><span class="pv-label">状态</span><span>${statusBadge(result.status)} <span style="color:var(--muted);font-size:11.5px">${formatDuration(result.durationMs)}</span></span></div>
        <div class="pv-row"><span class="pv-label">页面</span><span class="pv-value mono">${escapeHtml(result.title || result.url || '')}</span></div>
        <div class="pv-row"><span class="pv-label">结果</span><span class="pv-value">${error ? `<span style="color:var(--red)">${escapeHtml(error)}</span>` : formatPreviewValue(value)}</span></div>
      </div>`;
    } catch (err) {
      resultBox.innerHTML = `<div class="error-text">${escapeHtml(err.message)}</div>`;
    } finally {
      btn.disabled = false;
      btn.innerHTML = `${icons.play} 抓取预览`;
    }
  });

  return modal;
}

function formatPreviewValue(value) {
  if (value === undefined || value === null || value === '') return '<span class="cell-muted">（空）</span>';
  if (Array.isArray(value)) {
    return `<div class="chips">${value.map((item) => `<span class="chip" title="${escapeHtml(item)}">${escapeHtml(item)}</span>`).join('')}</div>`;
  }
  if (typeof value === 'object') return `<code class="json-val">${escapeHtml(JSON.stringify(value))}</code>`;
  return escapeHtml(String(value));
}
