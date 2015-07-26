# fresh

[![NPM Version][npm-image]][npm-url]
[![NPM Downloads][downloads-image]][downloads-url]
[![Node.js Version][node-version-image]][node-version-url]
[![Build Status][travis-image]][travis-url]
[![Test Coverage][coveralls-image]][coveralls-url]

HTTP response freshness testing

## Installation

```
$ npm install fresh
```

## API

```js
var fresh = require('fresh')
```

### fresh(req, res)

 Check freshness of `req` and `res` headers.

 When the cache is "fresh" __true__ is returned,
 otherwise __false__ is returned to indicate that
 the cache is now stale.

## Example

```js
var req = { 'if-none-match': 'tobi' };
var res = { 'etag': 'luna' };
fresh(req, res);
// => false

var req = { 'if-none-match': 'tobi' };
var res = { 'etag': 'tobi' };
fresh(req, res);
// => true
```

## License

[MIT](LICENSE)

[npm-image]: https://img.shields.io/npm/v/fresh.svg
[npm-url]: https://npmjs.org/package/fresh
[node-version-image]: https://img.shields.io/node/v/fresh.svg
[node-version-url]: http://nodejs.org/download/
[travis-image]: https://img.shields.io/travis/jshttp/fresh/master.svg
[travis-url]: https://travis-ci.org/jshttp/fresh
[coveralls-image]: https://img.shields.io/coveralls/jshttp/fresh/master.svg
[coveralls-url]: https://coveralls.io/r/jshttp/fresh?branch=master
[downloads-image]: https://img.shields.io/npm/dm/fresh.svg
[downloads-url]: https://npmjs.org/package/fresh
