const JSON_HEADERS = { 'Content-Type': 'application/json' };

export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

export async function api(path, options = {}) {
  const { method = 'GET', body, headers = {}, raw = false } = options;
  const init = { method, headers: { ...headers }, credentials: 'same-origin' };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { ...JSON_HEADERS, ...init.headers };
  }
  let res;
  try {
    res = await fetch(path, init);
  } catch (err) {
    throw new ApiError('无法连接后端服务，请确认服务仍在运行', 0);
  }
  if (raw) {
    if (!res.ok) throw new ApiError(`请求失败（${res.status}）`, res.status);
    return res;
  }
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    const message = (data && data.error) || `请求失败（${res.status}）`;
    throw new ApiError(message, res.status, data && data.details);
  }
  return data;
}

export const apiGet = (path) => api(path);
export const apiPost = (path, body) => api(path, { method: 'POST', body: body ?? {} });
export const apiPatch = (path, body) => api(path, { method: 'PATCH', body: body ?? {} });
export const apiPut = (path, body) => api(path, { method: 'PUT', body: body ?? {} });
export const apiDelete = (path) => api(path, { method: 'DELETE' });

export function queryString(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

export function exportUrl(params) {
  return `/api/export${queryString(params)}`;
}

export function connectEvents(handlers = {}, onStatus) {
  const source = new EventSource('/api/events');
  const names = ['entry:update', 'run:update', 'entry:deleted', 'datasets:changed', 'snapshot'];
  for (const name of names) {
    source.addEventListener(name, (event) => {
      let payload = null;
      try {
        payload = JSON.parse(event.data);
      } catch {
        payload = event.data;
      }
      if (typeof handlers[name] === 'function') handlers[name](payload);
    });
  }
  source.onopen = () => onStatus && onStatus(true);
  source.onerror = () => onStatus && onStatus(false);
  return source;
}
