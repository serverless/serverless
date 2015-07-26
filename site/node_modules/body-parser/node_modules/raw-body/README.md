# raw-body

[![NPM Version][npm-image]][npm-url]
[![NPM Downloads][downloads-image]][downloads-url]
[![Node.js Version][node-version-image]][node-version-url]
[![Build status][travis-image]][travis-url]
[![Test coverage][coveralls-image]][coveralls-url]

Gets the entire buffer of a stream either as a `Buffer` or a string.
Validates the stream's length against an expected length and maximum limit.
Ideal for parsing request bodies.

## API

```js
var getRawBody = require('raw-body')
```

### getRawBody(stream, [options], [callback])

**Returns a promise if no callback specified and global `Promise` exists.**

Options:

- `length` - The length length of the stream.
  If the contents of the stream do not add up to this length,
  an `400` error code is returned.
- `limit` - The byte limit of the body.
  If the body ends up being larger than this limit,
  a `413` error code is returned.
- `encoding` - The requested encoding.
  By default, a `Buffer` instance will be returned.
  Most likely, you want `utf8`.
  You can use any type of encoding supported by [iconv-lite](https://www.npmjs.org/package/iconv-lite#readme).

You can also pass a string in place of options to just specify the encoding.

`callback(err, res)`:

- `err` - the following attributes will be defined if applicable:

    - `limit` - the limit in bytes
    - `length` and `expected` - the expected length of the stream
    - `received` - the received bytes
    - `encoding` - the invalid encoding
    - `status` and `statusCode` - the corresponding status code for the error
    - `type` - either `entity.too.large`, `request.aborted`, `request.size.invalid`, `stream.encoding.set`, or `encoding.unsupported`

- `res` - the result, either as a `String` if an encoding was set or a `Buffer` otherwise.

If an error occurs, the stream will be paused, everything unpiped,
and you are responsible for correctly disposing the stream.
For HTTP requests, no handling is required if you send a response.
For streams that use file descriptors, you should `stream.destroy()` or `stream.close()` to prevent leaks.

## Examples

### Simple Express example

```js
var getRawBody = require('raw-body')
var typer = require('media-typer')

app.use(function (req, res, next) {
  getRawBody(req, {
    length: req.headers['content-length'],
    limit: '1mb',
    encoding: typer.parse(req.headers['content-type']).parameters.charset
  }, function (err, string) {
    if (err) return next(err)
    req.text = string
    next()
  })
})
```

### Simple Koa example

```js
app.use(function* (next) {
  var string = yield getRawBody(this.req, {
    length: this.length,
    limit: '1mb',
    encoding: this.charset
  })
})
```

### Using as a promise

To use this library as a promise, simply omit the `callback` and a promise is
returned, provided that a global `Promise` is defined.

```js
var getRawBody = require('raw-body')
var http = require('http')

var server = http.createServer(function (req, res) {
  getRawBody(req)
  .then(function (buf) {
    res.statusCode = 200
    res.end(buf.length + ' bytes submitted')
  })
  .catch(function (err) {
    res.statusCode = 500
    res.end(err.message)
  })
})

server.listen(3000)
```

## License

[MIT](LICENSE)

[npm-image]: https://img.shields.io/npm/v/raw-body.svg
[npm-url]: https://npmjs.org/package/raw-body
[node-version-image]: https://img.shields.io/node/v/raw-body.svg
[node-version-url]: http://nodejs.org/download/
[travis-image]: https://img.shields.io/travis/stream-utils/raw-body/master.svg
[travis-url]: https://travis-ci.org/stream-utils/raw-body
[coveralls-image]: https://img.shields.io/coveralls/stream-utils/raw-body/master.svg
[coveralls-url]: https://coveralls.io/r/stream-utils/raw-body?branch=master
[downloads-image]: https://img.shields.io/npm/dm/raw-body.svg
[downloads-url]: https://npmjs.org/package/raw-body
