# http-errors

[![NPM Version][npm-image]][npm-url]
[![NPM Downloads][downloads-image]][downloads-url]
[![Node.js Version][node-version-image]][node-version-url]
[![Build Status][travis-image]][travis-url]
[![Test Coverage][coveralls-image]][coveralls-url]

Create HTTP errors for Express, Koa, Connect, etc. with ease.

## Example

```js
var createError = require('http-errors');

app.use(function (req, res, next) {
  if (!req.user) return next(createError(401, 'Please login to view this page.'));
  next();
})
```

## API

This is the current API, currently extracted from Koa and subject to change.

### Error Properties

- `message`
- `status` and `statusCode` - the status code of the error, defaulting to `500`

### createError([status], [message], [properties])

```js
var err = createError(404, 'This video does not exist!');
```

- `status: 500` - the status code as a number
- `message` - the message of the error, defaulting to node's text for that status code.
- `properties` - custom properties to attach to the object

### new createError\[code || name\](\[msg]\))

```js
var err = new createError.NotFound();
```

- `code` - the status code as a number
- `name` - the name of the error as a "bumpy case", i.e. `NotFound` or `InternalServerError`.

## License

[MIT](LICENSE)

[npm-image]: https://img.shields.io/npm/v/http-errors.svg?style=flat
[npm-url]: https://npmjs.org/package/http-errors
[node-version-image]: https://img.shields.io/node/v/http-errors.svg?style=flat
[node-version-url]: http://nodejs.org/download/
[travis-image]: https://img.shields.io/travis/jshttp/http-errors.svg?style=flat
[travis-url]: https://travis-ci.org/jshttp/http-errors
[coveralls-image]: https://img.shields.io/coveralls/jshttp/http-errors.svg?style=flat
[coveralls-url]: https://coveralls.io/r/jshttp/http-errors
[downloads-image]: https://img.shields.io/npm/dm/http-errors.svg?style=flat
[downloads-url]: https://npmjs.org/package/http-errors
