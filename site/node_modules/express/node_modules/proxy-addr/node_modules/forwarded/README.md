# forwarded

[![NPM Version][npm-image]][npm-url]
[![NPM Downloads][downloads-image]][downloads-url]
[![Node.js Version][node-version-image]][node-version-url]
[![Build Status][travis-image]][travis-url]
[![Test Coverage][coveralls-image]][coveralls-url]

Parse HTTP X-Forwarded-For header

## Installation

```sh
$ npm install forwarded
```

## API

```js
var forwarded = require('forwarded')
```

### forwarded(req)

```js
var addresses = forwarded(req)
```

Parse the `X-Forwarded-For` header from the request. Returns an array
of the addresses, including the socket address for the `req`. In reverse
order (i.e. index `0` is the socket address and the last index is the
furthest address, typically the end-user).

## Testing

```sh
$ npm test
```

## License

[MIT](LICENSE)

[npm-image]: https://img.shields.io/npm/v/forwarded.svg?style=flat
[npm-url]: https://npmjs.org/package/forwarded
[node-version-image]: https://img.shields.io/node/v/forwarded.svg?style=flat
[node-version-url]: http://nodejs.org/download/
[travis-image]: https://img.shields.io/travis/jshttp/forwarded.svg?style=flat
[travis-url]: https://travis-ci.org/jshttp/forwarded
[coveralls-image]: https://img.shields.io/coveralls/jshttp/forwarded.svg?style=flat
[coveralls-url]: https://coveralls.io/r/jshttp/forwarded?branch=master
[downloads-image]: https://img.shields.io/npm/dm/forwarded.svg?style=flat
[downloads-url]: https://npmjs.org/package/forwarded
