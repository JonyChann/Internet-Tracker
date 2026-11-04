import * as store from '../db/store.js';
import { HttpError } from '../http.js';
import { buildSheets, exportFileName } from '../export/index.js';
import { toCsv } from '../export/csv.js';
import { buildXlsx } from '../export/xlsx.js';

function contentDisposition(filename) {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, "'");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export function registerExportRoutes(router) {
  router.get('/api/export', async ({ res, query }) => {
    const tableId = String(query.tableId || '');
    if (!tableId) throw new HttpError(400, '缺少 tableId');
    const table = await store.getDataset(tableId);
    if (!table) throw new HttpError(404, '数据表不存在');

    const format = query.format === 'csv' ? 'csv' : 'xlsx';
    const mode = ['latest', 'history', 'both'].includes(query.mode) ? query.mode : 'latest';
    if (format === 'csv' && mode === 'both') {
      throw new HttpError(400, 'CSV 不支持合并工作表，请选择“最新数据”或“历史记录”');
    }

    const fields = await store.listFields(tableId);
    let entries = await store.listEntries(tableId);
    if (query.entryIds) {
      const ids = String(query.entryIds)
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean);
      if (ids.length) entries = entries.filter((entry) => ids.includes(entry.id));
    }

    let columns;
    if (query.columns) {
      columns = String(query.columns)
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean);
      const known = new Set(fields.map((field) => field.id));
      columns = columns.filter((id) => known.has(id));
      if (!columns.length) throw new HttpError(400, '没有可导出的列');
    }

    const since = query.since ? String(query.since) : undefined;
    const until = query.until ? String(query.until) : undefined;
    const snapshots =
      mode === 'history' || mode === 'both'
        ? (await store.listSnapshotsForDataset(tableId, { since, until })).filter((snapshot) =>
            entries.some((entry) => entry.id === snapshot.entryId),
          )
        : [];

    const sheets = buildSheets({ dataset: table, fields, entries, snapshots, mode, columns });
    const filename = exportFileName(table, mode, format);

    res.setHeader('Content-Disposition', contentDisposition(filename));
    res.setHeader('Cache-Control', 'no-store');

    if (format === 'csv') {
      const csv = toCsv(sheets[0].headers, sheets[0].rows);
      const buffer = Buffer.from(csv, 'utf8');
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Length': buffer.length,
      });
      res.end(buffer);
      return;
    }

    const xlsx = buildXlsx(sheets);
    res.writeHead(200, {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Length': xlsx.length,
    });
    res.end(xlsx);
  });
}
