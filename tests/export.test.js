const zlib = require('zlib');
const { assert, defineSuite } = require('./harness');
const { toCsv } = require('../src/export/csv');
const { buildSheet, buildSheets, exportFileName, valueFor } = require('../src/export/index');
const { buildXlsx } = require('../src/export/xlsx');

function datasetFixture() {
  return {
    id: 't1',
    name: '示例 · 商品价格追踪',
    variables: [{ key: 'asin', label: '商品 ASIN' }],
  };
}

function fieldsFixture() {
  return [
    { id: 'f-price', name: '价格', dataType: 'number' },
    { id: 'f-specs', name: '规格', dataType: 'text' },
  ];
}

function entriesFixture() {
  return [
    {
      id: 'e1',
      vars: { asin: 'B0DEMO001' },
      note: '备注 A',
      latestValues: { 'f-price': 1234.5, 'f-specs': ['单元 A', '单元 B'] },
      latestStatus: 'ok',
      lastRunAt: '2026-11-04T10:00:00.000Z',
    },
  ];
}

function snapshotsFixture() {
  return [
    {
      id: 's1',
      entryId: 'e1',
      values: { 'f-price': 1200, 'f-specs': ['单元 A'] },
      status: 'partial',
      capturedAt: '2026-11-04T09:00:00.000Z',
    },
  ];
}

function readZip(buffer) {
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0; i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('zip end of central directory not found');
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const files = new Map();
  for (let i = 0; i < count; i += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('bad central directory');
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const raw = buffer.slice(dataStart, dataStart + compressedSize);
    files.set(name, method === 8 ? zlib.inflateRawSync(raw) : raw);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

module.exports = defineSuite('export', {
  tests: [
    [
      'CSV quotes special characters and prepends a BOM',
      () => {
        const text = toCsv(['名称', '备注'], [['a,b', 'he said "hi"'], ['line\nbreak', '']]);
        assert.equal(
          text,
          '\uFEFF名称,备注\r\n"a,b","he said ""hi"""\r\n"line\nbreak",\r\n',
        );
      },
    ],
    [
      'buildSheet builds the latest-data headers and rows',
      () => {
        const sheet = buildSheet({
          dataset: datasetFixture(),
          fields: fieldsFixture(),
          entries: entriesFixture(),
          mode: 'latest',
        });
        assert.deepStrictEqual(sheet.headers, ['商品 ASIN', '价格', '规格', '状态', '最后更新', '备注']);
        assert.deepStrictEqual(sheet.rows[0], ['B0DEMO001', 1234.5, '单元 A | 单元 B', '成功', '2026-11-04T10:00:00.000Z', '备注 A']);
        assert.equal(sheet.name, '最新数据');
      },
    ],
    [
      'buildSheet supports column selection and history rows',
      () => {
        const latest = buildSheet({
          dataset: datasetFixture(),
          fields: fieldsFixture(),
          entries: entriesFixture(),
          mode: 'latest',
          columns: ['f-price'],
        });
        assert.deepStrictEqual(latest.headers, ['商品 ASIN', '价格', '状态', '最后更新', '备注']);

        const history = buildSheet({
          dataset: datasetFixture(),
          fields: fieldsFixture(),
          entries: entriesFixture(),
          snapshots: snapshotsFixture(),
          mode: 'history',
        });
        assert.deepStrictEqual(history.headers, ['商品 ASIN', '价格', '规格', '状态', '抓取时间', '备注']);
        assert.deepStrictEqual(history.rows[0], ['B0DEMO001', 1200, '单元 A', '部分成功', '2026-11-04T09:00:00.000Z', '备注 A']);
      },
    ],
    [
      'buildSheets creates both sheets for mode=both',
      () => {
        const sheets = buildSheets({
          dataset: datasetFixture(),
          fields: fieldsFixture(),
          entries: entriesFixture(),
          snapshots: snapshotsFixture(),
          mode: 'both',
        });
        assert.equal(sheets.length, 2);
        assert.deepStrictEqual(sheets.map((sheet) => sheet.name), ['最新数据', '历史记录']);
      },
    ],
    [
      'valueFor flattens arrays, objects, null and numbers',
      () => {
        assert.equal(valueFor(null), '');
        assert.equal(valueFor(['a', 'b']), 'a | b');
        assert.equal(valueFor({ a: 1 }), '{"a":1}');
        assert.equal(valueFor(0), 0);
      },
    ],
    [
      'exportFileName uses a local timestamp and safe name',
      () => {
        const name = exportFileName(datasetFixture(), 'history', 'xlsx');
        assert.ok(/^示例_·_商品价格追踪_历史_\d{12}\.xlsx$/.test(name), name);
        const now = new Date();
        const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
        assert.ok(name.indexOf(stamp) > 0, name);
      },
    ],
    [
      'XLSX archive contains required parts, styles, numbers and frozen header',
      () => {
        const buffer = buildXlsx([
          {
            name: '最新数据',
            headers: ['商品 ASIN', '价格', '规格'],
            rows: [['B0DEMO001', 1234.5, '单元 A | 单元 B']],
          },
          {
            name: '历史记录',
            headers: ['商品 ASIN', '价格'],
            rows: [['B0DEMO001', 1200]],
          },
        ]);
        assert.equal(buffer.readUInt32LE(0), 0x04034b50);
        const files = readZip(buffer);
        for (const name of [
          '[Content_Types].xml',
          '_rels/.rels',
          'xl/workbook.xml',
          'xl/styles.xml',
          'xl/worksheets/sheet1.xml',
          'xl/worksheets/sheet2.xml',
        ]) {
          assert.ok(files.has(name), `missing ${name}`);
        }
        const sheet1 = files.get('xl/worksheets/sheet1.xml').toString('utf8');
        assert.ok(sheet1.indexOf('商品 ASIN') >= 0);
        assert.ok(sheet1.indexOf('<v>1234.5</v>') >= 0);
        assert.ok(/<pane[^>]*state="frozen"/.test(sheet1));
        const workbook = files.get('xl/workbook.xml').toString('utf8');
        assert.ok(workbook.indexOf('最新数据') >= 0);
        assert.ok(workbook.indexOf('历史记录') >= 0);
      },
    ],
    [
      'XLSX escapes XML and sanitizes illegal sheet names',
      () => {
        const buffer = buildXlsx([{ name: 'bad/name:*?', headers: ['值'], rows: [['<a&b>'], ['\u0001ok']] }]);
        const files = readZip(buffer);
        const sheet = files.get('xl/worksheets/sheet1.xml').toString('utf8');
        assert.ok(sheet.indexOf('&lt;a&amp;b&gt;') >= 0);
        assert.ok(sheet.indexOf('\u0001') < 0);
        const workbook = files.get('xl/workbook.xml').toString('utf8');
        assert.ok(workbook.indexOf('bad name') >= 0);
        assert.ok(workbook.indexOf('bad/name') < 0);
      },
    ],
  ],
});
