import { HttpError } from '../http.js';

export function requireObject(value, label = '请求内容') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, `${label}格式不正确`);
  }
  return value;
}

export function requireString(value, label, { max = 500, min = 1 } = {}) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length < min) throw new HttpError(400, `${label}不能为空`);
  if (text.length > max) throw new HttpError(400, `${label}过长（最多 ${max} 个字符）`);
  return text;
}

export function optionalString(value, label, { max = 500 } = {}) {
  if (value === null || value === undefined) return '';
  const text = String(value).trim();
  if (text.length > max) throw new HttpError(400, `${label}过长（最多 ${max} 个字符）`);
  return text;
}

export function clampInt(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

export function normalizeVariables(input) {
  if (input === null || input === undefined) return [];
  if (!Array.isArray(input)) throw new HttpError(400, '变量定义必须是数组');
  if (input.length > 12) throw new HttpError(400, '最多支持 12 个变量');
  const seen = new Set();
  return input.map((variable, index) => {
    if (!variable || typeof variable !== 'object') throw new HttpError(400, `第 ${index + 1} 个变量格式不正确`);
    const key = String(variable.key || '').trim();
    if (!/^[\p{L}\p{N}_-]{1,64}$/u.test(key)) {
      throw new HttpError(400, `变量 key「${key}」无效：只能包含字母、数字、下划线或短横线`);
    }
    if (seen.has(key)) throw new HttpError(400, `变量 key「${key}」重复`);
    seen.add(key);
    return {
      key,
      label: String(variable.label || key).slice(0, 80),
      placeholder: String(variable.placeholder || '').slice(0, 160),
      default: variable.default === null || variable.default === undefined ? '' : String(variable.default).slice(0, 1000),
      required: variable.required !== false,
    };
  });
}

export const ACTION_TYPES = [
  'click',
  'type',
  'fill',
  'press',
  'wait',
  'waitSelector',
  'scrollTo',
  'scroll',
  'select',
  'eval',
];

export const WAIT_UNTIL = ['domcontentloaded', 'load', 'networkidle0', 'networkidle2'];

export function defaultSettings() {
  return {
    intervalSec: 0,
    waitUntil: 'domcontentloaded',
    waitMs: 0,
    waitForSelector: '',
    timeoutMs: 30000,
    scroll: false,
    autoRefresh: true,
    actions: [],
  };
}

function normalizeAction(action) {
  if (!action || typeof action !== 'object') return null;
  const type = String(action.type || '');
  if (!ACTION_TYPES.includes(type)) return null;
  return {
    type,
    selector: String(action.selector || '').slice(0, 2000),
    value: String(action.value ?? action.text ?? '').slice(0, 2000),
    key: String(action.key || 'Enter').slice(0, 40),
    ms: clampInt(action.ms, 0, 0, 120000),
    x: clampInt(action.x, 0, -5000, 5000),
    y: clampInt(action.y, 0, -5000, 10000),
    code: String(action.code || '').slice(0, 20000),
    delayMs: clampInt(action.delayMs, 80, 0, 5000),
  };
}

export function normalizeSettings(input) {
  const base = defaultSettings();
  if (input === null || input === undefined) return base;
  if (typeof input !== 'object' || Array.isArray(input)) throw new HttpError(400, 'settings 格式不正确');
  return {
    intervalSec: clampInt(input.intervalSec, 0, 0, 604800),
    waitUntil: WAIT_UNTIL.includes(input.waitUntil) ? input.waitUntil : base.waitUntil,
    waitMs: clampInt(input.waitMs, 0, 0, 60000),
    waitForSelector: String(input.waitForSelector || '').slice(0, 2000),
    timeoutMs: clampInt(input.timeoutMs, 30000, 3000, 120000),
    scroll: Boolean(input.scroll),
    autoRefresh: input.autoRefresh !== false,
    actions: (Array.isArray(input.actions) ? input.actions : []).slice(0, 20).map(normalizeAction).filter(Boolean),
  };
}

export function sanitizeIcon(value) {
  const text = String(value || '').trim();
  return text ? [...text].slice(0, 4).join('') : '📊';
}

export function validateUrlTemplate(template) {
  const text = String(template || '').trim();
  if (!text) return '';
  if (!/^https?:\/\//i.test(text)) throw new HttpError(400, 'URL 模板必须以 http:// 或 https:// 开头');
  if (text.length > 4000) throw new HttpError(400, 'URL 模板过长');
  return text;
}
