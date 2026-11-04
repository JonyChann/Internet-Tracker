const EXTRACT_MODES = [
  'text',
  'html',
  'outerHTML',
  'attribute',
  'property',
  'href',
  'src',
  'value',
  'count',
  'exists',
  'js',
];

const DATA_TYPES = ['text', 'number', 'date', 'url', 'image', 'json', 'boolean'];

export function interpolationMissing(template, vars = {}) {
  const missing = [];
  const text = String(template || '');
  const regex = /\{\{\s*!?([\w.-]+)\s*\}\}/g;
  let match;
  while ((match = regex.exec(text))) {
    const key = match[1];
    const value = vars[key];
    if (value === undefined || value === null || value === '') missing.push(key);
  }
  return [...new Set(missing)];
}

/**
 * Replace {{var}} placeholders. Values are URI encoded by default so they can
 * be dropped straight into a query string; use {{!var}} for raw insertion.
 */
export function interpolate(template, vars = {}, { encode = true } = {}) {
  return String(template ?? '').replace(/\{\{\s*(!?)([\w.-]+)\s*\}\}/g, (_, raw, key) => {
    const value = vars[key];
    if (value === undefined || value === null) return '';
    const text = String(value);
    return raw || !encode ? text : encodeURIComponent(text);
  });
}

export function normalizeTemplate(input = {}) {
  const extract = EXTRACT_MODES.includes(input.extract) ? input.extract : 'text';
  const flags = String(input.regexFlags || '').replace(/[^gimsuy]/g, '');
  const template = {
    selector: String(input.selector || '').slice(0, 4000),
    extract,
    attribute: String(input.attribute || '').slice(0, 500),
    regex: String(input.regex || '').slice(0, 2000),
    regexFlags: flags,
    regexGroup: Number.isInteger(Number(input.regexGroup)) ? Number(input.regexGroup) : 1,
    multiple: Boolean(input.multiple),
    trim: input.trim !== false,
    collapse: Boolean(input.collapse),
    code: String(input.code || '').slice(0, 40000),
  };
  if (template.regex) {
    // Validate early so a broken template cannot be saved.
    new RegExp(template.regex, template.regexFlags);
  }
  return template;
}

export function normalizeDataType(value) {
  return DATA_TYPES.includes(value) ? value : 'text';
}

export async function extractField(page, field, ctx = {}) {
  const tpl = field.template || {};
  const mode = tpl.extract || 'text';
  const vars = ctx.vars || {};

  if (mode === 'js') {
    if (!tpl.code) throw new Error('JS 提取模式缺少代码');
    const code = interpolate(tpl.code, vars, { encode: false });
    const result = await page.evaluate(
      (source, variables) => {
        try {
          const fn = new Function('vars', `"use strict";\n${source}`);
          const norm = (value) => {
            if (value === null || value === undefined) return null;
            if (typeof value === 'object' && value.nodeType === 1) return value.innerText ?? value.textContent ?? '';
            if (Array.isArray(value)) return value.map(norm);
            if (typeof value === 'object') {
              try {
                return JSON.parse(JSON.stringify(value));
              } catch {
                return String(value);
              }
            }
            return value;
          };
          return { ok: true, value: norm(fn(variables)) };
        } catch (err) {
          return { ok: false, error: String(err?.message || err) };
        }
      },
      code,
      vars,
    );
    if (!result?.ok) throw new Error(`JS 提取失败：${result?.error || '未知错误'}`);
    return coerceValue(postProcess(result.value, tpl, Array.isArray(result.value)), field, ctx);
  }

  const selector = interpolate(tpl.selector, vars, { encode: false }).trim();
  if (!selector) throw new Error('缺少 CSS 选择器');
  const isXPath = selector.startsWith('xpath=') || selector.startsWith('//') || selector.startsWith('(//');
  const query = isXPath ? selector.replace(/^xpath=/, '') : selector;
  const raw = await page.evaluate(
    (query, tpl) => {
      let elements;
      try {
        if (tpl.xpath) {
          const snapshot = document.evaluate(query, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
          elements = [];
          for (let i = 0; i < snapshot.snapshotLength; i += 1) {
            const node = snapshot.snapshotItem(i);
            elements.push(node.nodeType === 1 ? node : node.parentElement);
          }
          elements = elements.filter(Boolean);
        } else {
          elements = Array.from(document.querySelectorAll(query));
        }
      } catch {
        return { ok: false, error: `选择器无效：${query}` };
      }

      const read = (el) => {
        switch (tpl.extract) {
          case 'html':
            return el.innerHTML;
          case 'outerHTML':
            return el.outerHTML;
          case 'attribute':
            return tpl.attribute ? el.getAttribute(tpl.attribute) : null;
          case 'property':
            return tpl.attribute ? el[tpl.attribute] : null;
          case 'href':
            return el.href ?? el.getAttribute('href');
          case 'src':
            return el.src ?? el.getAttribute('src');
          case 'value':
            return el.value ?? el.getAttribute('value') ?? '';
          case 'text':
          default:
            return el.innerText ?? el.textContent ?? '';
        }
      };

      if (tpl.extract === 'count') return { ok: true, value: elements.length };
      if (tpl.extract === 'exists') return { ok: true, value: elements.length > 0 };
      const values = elements.map(read);
      return { ok: true, value: tpl.multiple ? values : values[0] ?? null };
    },
    query,
    { xpath: isXPath, extract: mode, attribute: tpl.attribute, multiple: Boolean(tpl.multiple) },
  );

  if (!raw?.ok) throw new Error(raw?.error || '提取失败');
  const processed = postProcess(raw.value, tpl, Boolean(tpl.multiple));
  return coerceValue(processed, field, ctx);
}

function postProcess(value, tpl, multiple) {
  if (value === null || value === undefined) return null;
  const clean = (item) => {
    if (item === null || item === undefined) return null;
    let out = item;
    if (typeof out === 'string') {
      if (tpl.trim !== false) out = out.trim();
      if (tpl.collapse) out = out.replace(/\s+/g, ' ');
    }
    if (tpl.regex) {
      const regex = new RegExp(tpl.regex, tpl.regexFlags || '');
      const match = regex.exec(String(item));
      if (!match) return null;
      const group = Number.isInteger(tpl.regexGroup) ? tpl.regexGroup : 1;
      out = match[group] ?? match[0] ?? null;
      if (typeof out === 'string' && tpl.trim !== false) out = out.trim();
    }
    return out;
  };

  if (multiple || Array.isArray(value)) {
    const list = Array.isArray(value) ? value : [value];
    return list.map(clean).filter((item) => item !== null && item !== '');
  }
  return clean(value);
}

export function parseNumber(input) {
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;
  if (input === null || input === undefined) return null;
  let text = String(input).trim();
  if (!text) return null;
  let sign = 1;
  if (/^\(.*\)$/.test(text)) {
    sign = -1;
    text = text.slice(1, -1);
  }
  const match = text.replace(/[,\s\u00a0]/g, '').match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  let value = Number(match[0]);
  if (!Number.isFinite(value)) return null;
  if (/亿/.test(text)) value *= 1e8;
  else if (/万/.test(text)) value *= 1e4;
  return sign * value;
}

function coerceValue(value, field, ctx) {
  if (value === null || value === undefined) return null;
  const type = field.dataType || 'text';

  const coerceOne = (item) => {
    if (item === null || item === undefined) return null;
    switch (type) {
      case 'number':
        return parseNumber(item);
      case 'date': {
        const text = String(item).trim();
        const time = Date.parse(text);
        return Number.isNaN(time) ? text : new Date(time).toISOString();
      }
      case 'url':
      case 'image': {
        const text = String(item).trim();
        try {
          return new URL(text, ctx.url || undefined).href;
        } catch {
          return text;
        }
      }
      case 'json': {
        if (typeof item === 'object') return item;
        try {
          return JSON.parse(String(item));
        } catch {
          return String(item);
        }
      }
      case 'boolean': {
        const text = String(item).trim().toLowerCase();
        return ['true', '1', 'yes', 'y', '是', '有', '有货', 'in stock'].includes(text);
      }
      case 'text':
      default:
        if (typeof item === 'object') return JSON.stringify(item);
        return String(item);
    }
  };

  if (Array.isArray(value)) return value.map(coerceOne).filter((item) => item !== null);
  return coerceOne(value);
}

/** Human readable label for a value, used by exports. */
export function stringifyValue(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map(stringifyValue).join(' | ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
