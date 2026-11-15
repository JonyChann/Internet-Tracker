const { assert, defineSuite } = require('./harness');
const {
  interpolate,
  interpolationMissing,
  normalizeDataType,
  normalizeTemplate,
  parseNumber,
  stringifyValue,
} = require('../src/scraper/extract');

module.exports = defineSuite('extract', {
  tests: [
    [
      'interpolate URI-encodes values and supports raw insertion',
      () => {
        assert.equal(interpolate('https://x.test/?q={{ q }}', { q: 'A B&中' }), 'https://x.test/?q=A%20B%26%E4%B8%AD');
        assert.equal(interpolate('{{!body}}', { body: 'a&b' }), 'a&b');
        assert.equal(interpolate('{{missing}}', {}), '');
        assert.equal(interpolate('{{a}}-{{a}}', { a: 1 }), '1-1');
      },
    ],
    [
      'interpolationMissing reports empty and undefined variables once',
      () => {
        assert.deepStrictEqual(
          interpolationMissing('{{asin}} / {{!page}} / {{asin}} / {{ok}}', { asin: '', page: '2', ok: 'yes' }),
          ['asin'],
        );
        assert.deepStrictEqual(interpolationMissing('{{a}}', { a: 0 }), []);
      },
    ],
    [
      'parseNumber handles separators, parentheses and Chinese units',
      () => {
        assert.equal(parseNumber(1234.5), 1234.5);
        assert.equal(parseNumber('¥1,234.50'), 1234.5);
        assert.equal(parseNumber(' 1 299 '), 1299);
        assert.equal(parseNumber('(42)'), -42);
        assert.equal(parseNumber('12.5万'), 125000);
        assert.equal(parseNumber('3亿'), 300000000);
        assert.equal(parseNumber('暂无'), null);
        assert.equal(parseNumber(''), null);
        assert.equal(parseNumber(Infinity), null);
      },
    ],
    [
      'normalizeTemplate keeps known options and clamps values',
      () => {
        const template = normalizeTemplate({
          selector: '.price .amount',
          extract: 'attribute',
          attribute: 'data-price',
          regex: '[\\d.]+',
          regexFlags: 'gi',
          regexGroup: '2',
          multiple: 1,
          trim: false,
          collapse: true,
        });
        assert.equal(template.selector, '.price .amount');
        assert.equal(template.extract, 'attribute');
        assert.equal(template.attribute, 'data-price');
        assert.equal(template.regexGroup, 2);
        assert.equal(template.multiple, true);
        assert.equal(template.trim, false);
        assert.equal(template.collapse, true);
        assert.equal(normalizeTemplate({ extract: 'nonsense' }).extract, 'text');
        assert.throws(() => normalizeTemplate({ regex: '(' }), SyntaxError);
      },
    ],
    [
      'normalizeDataType falls back to text',
      () => {
        assert.equal(normalizeDataType('number'), 'number');
        assert.equal(normalizeDataType('image'), 'image');
        assert.equal(normalizeDataType('blob'), 'text');
      },
    ],
    [
      'stringifyValue flattens values for display and export',
      () => {
        assert.equal(stringifyValue(null), '');
        assert.equal(stringifyValue(['a', 'b']), 'a | b');
        assert.equal(stringifyValue({ a: 1 }), '{"a":1}');
        assert.equal(stringifyValue(12.5), '12.5');
      },
    ],
  ],
});
