# method-override

[![NPM Version][npm-image]][npm-url]
[![NPM Downloads][downloads-image]][downloads-url]
[![Build Status][travis-image]][travis-url]
[![Test Coverage][coveralls-image]][coveralls-url]
[![Gratipay][gratipay-image]][gratipay-url]

Lets you use HTTP verbs such as PUT or DELETE in places where the client doesn't support it.

## Install

```sh
$ npm install method-override
```

## API

**NOTE** It is very important that this module is used **before** any module that
needs to know the method of the request (for example, it _must_ be used prior to
the `csurf` module).

### methodOverride(getter, options)

Create a new middleware function to override the `req.method` property with a new
value. This value will be pulled from the provided `getter`.

- `getter` - The getter to use to look up the overridden request method for the request. (default: `X-HTTP-Method-Override`)
- `options.methods` - The allowed methods the original request must be in to check for a method override value. (default: `['POST']`)

If the found method is supported by node.js core, then `req.method` will be set to
this value, as if it has originally been that value. The previous `req.method`
value will be stored in `req.originalMethod`.

#### getter

This is the method of getting the override value from the request. If a function is provided,
the `req` is passed as the first argument, the `res` as the second argument and the method is
expected to be returned. If a string is provided, the string is used to look up the method
with the following rules:

- If the string starts with `X-`, then it is treated as the name of a header and that header
  is used for the method override. If the request contains the same header multiple times, the
  first occurrence is used.
- All other strings are treated as a key in the URL query string.

#### options.methods

This allows the specification of what methods(s) the request *MUST* be in in order to check for
the method override value. This defaults to only `POST` methods, which is the only method the
override should arrive in. More methods may be specified here, but it may introduce security
issues and cause weird behavior when requests travel through caches. This value is an array
of methods in upper-case. `null` can be specified to allow all methods.

## Examples

### override using a header

To use a header to override the method, specify the header name
as a string argument to the `methodOverride` function. To then make
the call, send  a `POST` request to a URL with the overridden method
as the value of that header. This method of using a header would
typically be used in conjunction with `XMLHttpRequest` on implementations
that do not support the method you are trying to use.

```js
var connect        = require('connect')
var methodOverride = require('method-override')

// override with the X-HTTP-Method-Override header in the request
app.use(methodOverride('X-HTTP-Method-Override'))
```

Example call with header override using `XMLHttpRequest`:

```js
var xhr = new XMLHttpRequest()
xhr.onload = onload
xhr.open('post', '/resource', true)
xhr.setRequestHeader('X-HTTP-Method-Override', 'DELETE')
xhr.send()

function onload() {
  alert('got response: ' + this.responseText)
}
```

### override using a query value

To use a query string value to override the method, specify the query
string key as a string argument to the `methodOverride` function. To
then make the call, send  a `POST` request to a URL with the overridden
method as the value of that query string key. This method of using a
query value would typically be used in conjunction with plain HTML
`<form>` elements when trying to support legacy browsers but still use
newer methods.

```js
var connect        = require('connect')
var methodOverride = require('method-override')

// override with POST having ?_method=DELETE
app.use(methodOverride('_method'))
```

Example call with query override using HTML `<form>`:

```html
<form method="POST" action="/resource?_method=DELETE">
  <button type="submit">Delete resource</button>
</form>
```

### multiple format support

```js
var connect        = require('connect')
var methodOverride = require('method-override')

// override with different headers; last one takes precedence
app.use(methodOverride('X-HTTP-Method'))          // Microsoft
app.use(methodOverride('X-HTTP-Method-Override')) // Google/GData
app.use(methodOverride('X-Method-Override'))      // IBM
```

### custom logic

You can implement any kind of custom logic with a function for the `getter`. The following
implements the logic for looking in `req.body` that was in `method-override@1`:

```js
var bodyParser     = require('body-parser')
var connect        = require('connect')
var methodOverride = require('method-override')

// NOTE: when using req.body, you must fully parse the request body
//       before you call methodOverride() in your middleware stack,
//       otherwise req.body will not be populated.
app.use(bodyParser.urlencoded())
app.use(methodOverride(function(req, res){
  if (req.body && typeof req.body === 'object' && '_method' in req.body) {
    // look in urlencoded POST bodies and delete it
    var method = req.body._method
    delete req.body._method
    return method
  }
}))
```

Example call with query override using HTML `<form>`:

```html
<!-- enctype must be set to the type you will parse before methodOverride() -->
<form method="POST" action="/resource" enctype="application/x-www-form-urlencoded">
  <input type="hidden" name="_method" value="DELETE">
  <button type="submit">Delete resource</button>
</form>
```

## License

[MIT](LICENSE)

[npm-image]: https://img.shields.io/npm/v/method-override.svg
[npm-url]: https://npmjs.org/package/method-override
[travis-image]: https://img.shields.io/travis/expressjs/method-override/master.svg
[travis-url]: https://travis-ci.org/expressjs/method-override
[coveralls-image]: https://img.shields.io/coveralls/expressjs/method-override/master.svg
[coveralls-url]: https://coveralls.io/r/expressjs/method-override?branch=master
[downloads-image]: https://img.shields.io/npm/dm/method-override.svg
[downloads-url]: https://npmjs.org/package/method-override
[gratipay-image]: https://img.shields.io/gratipay/dougwilson.svg
[gratipay-url]: https://www.gratipay.com/dougwilson/
