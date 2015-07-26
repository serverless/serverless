# range-parser

[![NPM Version][npm-image]][npm-url]
[![NPM Downloads][downloads-image]][downloads-url]
[![Node.js Version][node-version-image]][node-version-url]
[![Build Status][travis-image]][travis-url]
[![Test Coverage][coveralls-image]][coveralls-url]

Range header field parser.

## Installation

```
$ npm install range-parser
```

## Examples

```js
assert(-1 == parse(200, 'bytes=500-20'));
assert(-2 == parse(200, 'bytes=malformed'));
parse(200, 'bytes=0-499').should.eql(arr('bytes', [{ start: 0, end: 199 }]));
parse(1000, 'bytes=0-499').should.eql(arr('bytes', [{ start: 0, end: 499 }]));
parse(1000, 'bytes=40-80').should.eql(arr('bytes', [{ start: 40, end: 80 }]));
parse(1000, 'bytes=-500').should.eql(arr('bytes', [{ start: 500, end: 999 }]));
parse(1000, 'bytes=-400').should.eql(arr('bytes', [{ start: 600, end: 999 }]));
parse(1000, 'bytes=500-').should.eql(arr('bytes', [{ start: 500, end: 999 }]));
parse(1000, 'bytes=400-').should.eql(arr('bytes', [{ start: 400, end: 999 }]));
parse(1000, 'bytes=0-0').should.eql(arr('bytes', [{ start: 0, end: 0 }]));
parse(1000, 'bytes=-1').should.eql(arr('bytes', [{ start: 999, end: 999 }]));
parse(1000, 'items=0-5').should.eql(arr('items', [{ start: 0, end: 5 }]));
parse(1000, 'bytes=40-80,-1').should.eql(arr('bytes', [{ start: 40, end: 80 }, { start: 999, end: 999 }]));
```

## License

[MIT](LICENSE)

[npm-image]: https://img.shields.io/npm/v/range-parser.svg?style=flat
[npm-url]: https://npmjs.org/package/range-parser
[node-version-image]: https://img.shields.io/badge/node.js-%3E%3D_0.6-brightgreen.svg?style=flat
[node-version-url]: http://nodejs.org/download/
[travis-image]: https://img.shields.io/travis/jshttp/range-parser.svg?style=flat
[travis-url]: https://travis-ci.org/jshttp/range-parser
[coveralls-image]: https://img.shields.io/coveralls/jshttp/range-parser.svg?style=flat
[coveralls-url]: https://coveralls.io/r/jshttp/range-parser
[downloads-image]: https://img.shields.io/npm/dm/range-parser.svg?style=flat
[downloads-url]: https://npmjs.org/package/range-parser
