# etag

[![NPM Version][npm-image]][npm-url]
[![NPM Downloads][downloads-image]][downloads-url]
[![Node.js Version][node-version-image]][node-version-url]
[![Build Status][travis-image]][travis-url]
[![Test Coverage][coveralls-image]][coveralls-url]

Create simple ETags

## Installation

```sh
$ npm install etag
```

## API

```js
var etag = require('etag')
```

### etag(entity, [options])

Generate a strong ETag for the given entity. This should be the complete
body of the entity. Strings, `Buffer`s, and `fs.Stats` are accepted. By
default, a strong ETag is generated except for `fs.Stats`, which will
generate a weak ETag (this can be overwritten by `options.weak`).

```js
res.setHeader('ETag', etag(body))
```

#### Options

`etag` accepts these properties in the options object.

##### weak

Specifies if the generated ETag will include the weak validator mark (that
is, the leading `W/`). The actual entity tag is the same. The default value
is `false`, unless the `entity` is `fs.Stats`, in which case it is `true`.

## Testing

```sh
$ npm test
```

## Benchmark

```bash
$ npm run-script bench

> etag@1.6.0 bench nodejs-etag
> node benchmark/index.js

  http_parser@1.0
  node@0.10.33
  v8@3.14.5.9
  ares@1.9.0-DEV
  uv@0.10.29
  zlib@1.2.3
  modules@11
  openssl@1.0.1j

> node benchmark/body0-100b.js

  100B body

  1 test completed.
  2 tests completed.
  3 tests completed.
  4 tests completed.

* buffer - strong x 289,198 ops/sec ±1.09% (190 runs sampled)
* buffer - weak   x 287,838 ops/sec ±0.91% (189 runs sampled)
* string - strong x 284,586 ops/sec ±1.05% (192 runs sampled)
* string - weak   x 287,439 ops/sec ±0.82% (192 runs sampled)

> node benchmark/body1-1kb.js

  1KB body

  1 test completed.
  2 tests completed.
  3 tests completed.
  4 tests completed.

* buffer - strong x 212,423 ops/sec ±0.75% (193 runs sampled)
* buffer - weak   x 211,871 ops/sec ±0.74% (194 runs sampled)
  string - strong x 205,291 ops/sec ±0.86% (194 runs sampled)
  string - weak   x 208,463 ops/sec ±0.79% (192 runs sampled)

> node benchmark/body2-5kb.js

  5KB body

  1 test completed.
  2 tests completed.
  3 tests completed.
  4 tests completed.

* buffer - strong x 92,901 ops/sec ±0.58% (195 runs sampled)
* buffer - weak   x 93,045 ops/sec ±0.65% (192 runs sampled)
  string - strong x 89,621 ops/sec ±0.68% (194 runs sampled)
  string - weak   x 90,070 ops/sec ±0.70% (196 runs sampled)

> node benchmark/body3-10kb.js

  10KB body

  1 test completed.
  2 tests completed.
  3 tests completed.
  4 tests completed.

* buffer - strong x 54,220 ops/sec ±0.85% (192 runs sampled)
* buffer - weak   x 54,069 ops/sec ±0.83% (191 runs sampled)
  string - strong x 53,078 ops/sec ±0.53% (194 runs sampled)
  string - weak   x 53,849 ops/sec ±0.47% (197 runs sampled)

> node benchmark/body4-100kb.js

  100KB body

  1 test completed.
  2 tests completed.
  3 tests completed.
  4 tests completed.

* buffer - strong x 6,673 ops/sec ±0.15% (197 runs sampled)
* buffer - weak   x 6,716 ops/sec ±0.12% (198 runs sampled)
  string - strong x 6,357 ops/sec ±0.14% (197 runs sampled)
  string - weak   x 6,344 ops/sec ±0.21% (197 runs sampled)

> node benchmark/stats.js

  stats

  1 test completed.
  2 tests completed.
  3 tests completed.
  4 tests completed.

* real - strong x 1,671,989 ops/sec ±0.13% (197 runs sampled)
* real - weak   x 1,681,297 ops/sec ±0.12% (198 runs sampled)
  fake - strong x   927,063 ops/sec ±0.14% (198 runs sampled)
  fake - weak   x   914,461 ops/sec ±0.41% (191 runs sampled)
```

## License

[MIT](LICENSE)

[npm-image]: https://img.shields.io/npm/v/etag.svg
[npm-url]: https://npmjs.org/package/etag
[node-version-image]: https://img.shields.io/node/v/etag.svg
[node-version-url]: http://nodejs.org/download/
[travis-image]: https://img.shields.io/travis/jshttp/etag/master.svg
[travis-url]: https://travis-ci.org/jshttp/etag
[coveralls-image]: https://img.shields.io/coveralls/jshttp/etag/master.svg
[coveralls-url]: https://coveralls.io/r/jshttp/etag?branch=master
[downloads-image]: https://img.shields.io/npm/dm/etag.svg
[downloads-url]: https://npmjs.org/package/etag
