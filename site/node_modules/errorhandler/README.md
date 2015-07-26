# errorhandler

[![NPM Version][npm-image]][npm-url]
[![NPM Downloads][downloads-image]][downloads-url]
[![Build Status][travis-image]][travis-url]
[![Test Coverage][coveralls-image]][coveralls-url]
[![Gratipay][gratipay-image]][gratipay-url]

Development-only error handler middleware

## Install

```sh
$ npm install errorhandler
```

## API

```js
var errorhandler = require('errorhandler')
```

### errorhandler(options)

Create new middleware to handle errors and respond with content negotiation.
This middleware is only intended to be used in a development environment, as
the full error stack traces will be sent back to the client when an error
occurs.

#### Options

Error handler accepts these properties in the options object.

##### log

Provide a function to be called with the error and a string representation of
the error. Can be used to write the error to any desired location, or set to
`false` to only send the error back in the response. Called as
`log(err, str, req, res)` where `err` is the `Error` object, `str` is a string
representation of the error, `req` is the request object and `res` is the
response object (note, this function is invoked _after_ the response has been
written).

The default value for this option is `true` unless `process.env.NODE_ENV === 'test'`.

Possible values:

  * `true`: Log errors using `console.error(str)`.
  * `false`: Only send the error back in the response.
  * A function: pass the error to a function for handling.

## Examples

### Simple example

Basic example of adding this middleware as the error handler only in development
with `connect` (`express` also can be used in this example).

```js
var connect = require('connect')
var errorhandler = require('errorhandler')

var app = connect()

if (process.env.NODE_ENV === 'development') {
  // only use in development
  app.use(errorhandler())
}
```

### Custom output location

Sometimes you may want to output the errors to a different location than STDERR
during development, like a system notification, for example.

```js
var connect = require('connect')
var errorhandler = require('errorhandler')
var notifier = require('node-notifier')

var app = connect()

if (process.env.NODE_ENV === 'development') {
  // only use in development
  app.use(errorhandler({log: errorNotification}))
}

function errorNotification(err, str, req) {
  var title = 'Error in ' + req.method + ' ' + req.url

  notifier.notify({
    title: title,
    message: str
  })
}
```

## License

[MIT](LICENSE)

[npm-image]: https://img.shields.io/npm/v/errorhandler.svg
[npm-url]: https://npmjs.org/package/errorhandler
[travis-image]: https://img.shields.io/travis/expressjs/errorhandler/master.svg
[travis-url]: https://travis-ci.org/expressjs/errorhandler
[coveralls-image]: https://img.shields.io/coveralls/expressjs/errorhandler/master.svg
[coveralls-url]: https://coveralls.io/r/expressjs/errorhandler?branch=master
[downloads-image]: https://img.shields.io/npm/dm/errorhandler.svg
[downloads-url]: https://npmjs.org/package/errorhandler
[gratipay-image]: https://img.shields.io/gratipay/dougwilson.svg
[gratipay-url]: https://www.gratipay.com/dougwilson/
