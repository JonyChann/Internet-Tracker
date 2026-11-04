import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { toCsv } from '../src/export/csv.js';
import { buildXlsx } from '../src/export/xlsx.js';
import { buildSheet, buildSheets, exportFileName, valueFor } from '../src/export/index.js';

const dataset = {
  id: 'd1',
  name: '示例 · 商品价格追踪',
  variables: [{ key: 'asin', label: '商品 ASIN' }],
};

const fields = [
  { id: 'f1', name: '价格', dataType: 'number' },
  { id: 'f2', name: '规格', dataType: 'text' },
];

const entries = [
  {
    id: 'e1',
    vars: { asin: 'B0DEMO001' },
    latestValues: { f1: 1234.5, f2: ['单元 A', '单元 B'] },
    latestStatus: 'ok',
    lastRunAt: '2026-01-02T03:04:05.000Z',
    note: '竞品 A',
  },
  {
    id: 'e2',
    vars: { asin: 'B0DEMO002' },
    latestValues: {},
    latestStatus: 'error',
    lastRunAt: null,
    note: '',
  },
];

const snapshots = [
  { entryId: 'e1', values: { f1: 1200, f2: ['单元 A'] }, status: 'ok', capturedAt: '2026-01-01T00:00:00.000Z' },
  { entryId: 'e1', values: { f1: 1234.5, f2: ['单元 A', '单元 B'] }, status: 'ok', capturedAt: '2026-01-02T00:00:00.000Z' },
];

test('CSV quotes separators, quotes and newlines with a BOM', () => {
  const csv = toCsv(['名称', '备注'], [['A,B', '他说 "你好"'], ['多行\n文本', '']]);
  assert.ok(csv.startsWith('\ufeff'));
  assert.equal(csv, '\ufeff名称,备注\r\n"A,B","他说 ""你好"""\r\n"多行\n文本",\r\n');
});

test('latest sheet includes variable labels, fields, status and note', () => {
  const sheet = buildSheet({ dataset, fields, entries, mode: 'latest' });
  assert.deepEqual(sheet.headers, ['商品 ASIN', '价格', '规格', '状态', '最后更新', '备注']);
  assert.equal(sheet.rows.length, 2);
  assert.deepEqual(sheet.rows[0], ['B0DEMO001', 1234.5, '单元 A | 单元 B', '成功', '2026-01-02T03:04:05.000Z', '竞品 A']);
  assert.deepEqual(sheet.rows[1], ['B0DEMO002', '', '', '失败', '', '']);
});

test('column selection keeps the requested order and history uses snapshots', () => {
  const sheet = buildSheet({ dataset, fields, entries, snapshots, mode: 'history', columns: ['f2'] });
  assert.deepEqual(sheet.headers, ['商品 ASIN', '规格', '状态', '抓取时间', '备注']);
  assert.equal(sheet.rows.length, 2);
  assert.equal(sheet.rows[0][0], 'B0DEMO001');
  assert.equal(sheet.rows[1][1], '单元 A | 单元 B');
  assert.equal(sheet.name, '历史记录');
});

test('buildSheets returns two sheets for both mode', () => {
  const sheets = buildSheets({ dataset, fields, entries, snapshots, mode: 'both' });
  assert.equal(sheets.length, 2);
  assert.equal(sheets[0].name, '最新数据');
  assert.equal(sheets[1].name, '历史记录');
});

test('valueFor flattens arrays and objects', () => {
  assert.equal(valueFor(null), '');
  assert.equal(valueFor(['a', 'b']), 'a | b');
  assert.equal(valueFor({ a: 1 }), '{"a":1}');
  assert.equal(valueFor(0), 0);
});

test('export file name keeps the table name and local timestamp', () => {
  const name = exportFileName(dataset, 'history', 'xlsx');
  assert.match(name, /^示例_·_商品价格追踪_历史_\d{12}\.xlsx$/);
  const stamp = name.match(/_(\d{12})\./)[1];
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  assert.equal(stamp.slice(0, 8), `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`);
});

/* -------------------------------- XLSX ---------------------------------- */

function readZip(buffer) {
  const eocd = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(eocd > 0, 'zip end of central directory not found');
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const files = new Map();
  for (let i = 0; i < count; i += 1) {
    assert.equal(buffer.readUInt32LE(offset), 0x02014b50);
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.slice(offset + 46, offset + 46 + nameLength).toString('utf8');
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const raw = buffer.slice(dataStart, dataStart + compressedSize);
    files.set(name, method === 8 ? zlib.inflateRawSync(raw) : raw);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

test('XLSX archive contains workbook, styles and sheet XML', () => {
  const buffer = buildXlsx([
    { name: '最新数据', headers: ['商品 ASIN', '价格'], rows: [['B0DEMO001', 1234.5], ['B0DEMO002', null]] },
    { name: '历史记录', headers: ['商品 ASIN', '价格', '抓取时间'], rows: [['B0DEMO001', 1200, '2026-01-01']] },
  ]);
  assert.equal(buffer.readUInt32LE(0), 0x04034b50);
  const files = readZip(buffer);
  for (const name of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/styles.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml']) {
    assert.ok(files.has(name), `missing ${name}`);
  }
  const sheet1 = files.get('xl/worksheets/sheet1.xml').toString('utf8');
  assert.match(sheet1, /商品 ASIN/);
  assert.match(sheet1, /<v>1234\.5<\/v>/);
  assert.match(sheet1, /<pane[^>]*state="frozen"/);
  const workbook = files.get('xl/workbook.xml').toString('utf8');
  assert.match(workbook, /最新数据/);
  assert.match(workbook, /历史记录/);
});

test('XLSX escapes XML control characters and illegal sheet names', () => {
  const buffer = buildXlsx([{ name: 'bad/name:*?', headers: ['值'], rows: [['<a&b>'], ['\u0001ok']] }]);
  const files = readZip(buffer);
  const sheet = files.get('xl/worksheets/sheet1.xml').toString('utf8');
  assert.match(sheet, /&lt;a&amp;b&gt;/);
  assert.doesNotMatch(sheet, /\u0001/);
  assert.match(files.get('xl/workbook.xml').toString('utf8'), /bad name/);
});
