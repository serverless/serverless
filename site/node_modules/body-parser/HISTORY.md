1.13.2 / 2015-07-05
===================

  * deps: iconv-lite@0.4.11
  * deps: qs@4.0.0
    - Fix dropping parameters like `hasOwnProperty`
    - Fix user-visible incompatibilities from 3.1.0
    - Fix various parsing edge cases
  * deps: raw-body@~2.1.2
    - Fix error stack traces to skip `makeError`
    - deps: iconv-lite@0.4.11
  * deps: type-is@~1.6.4
    - deps: mime-types@~2.1.2
    - perf: enable strict mode
    - perf: remove argument reassignment

1.13.1 / 2015-06-16
===================

  * deps: qs@2.4.2
    - Downgraded from 3.1.0 because of user-visible incompatibilities

1.13.0 / 2015-06-14
===================

  * Add `statusCode` property on `Error`s, in addition to `status`
  * Change `type` default to `application/json` for JSON parser
  * Change `type` default to `application/x-www-form-urlencoded` for urlencoded parser
  * Provide static `require` analysis
  * Use the `http-errors` module to generate errors
  * deps: bytes@2.1.0
    - Slight optimizations
  * deps: iconv-lite@0.4.10
    - The encoding UTF-16 without BOM now defaults to UTF-16LE when detection fails
    - Leading BOM is now removed when decoding
  * deps: on-finished@~2.3.0
    - Add defined behavior for HTTP `CONNECT` requests
    - Add defined behavior for HTTP `Upgrade` requests
    - deps: ee-first@1.1.1
  * deps: qs@3.1.0
    - Fix dropping parameters like `hasOwnProperty`
    - Fix various parsing edge cases
    - Parsed object now has `null` prototype
  * deps: raw-body@~2.1.1
    - Use `unpipe` module for unpiping requests
    - deps: iconv-lite@0.4.10
  * deps: type-is@~1.6.3
    - deps: mime-types@~2.1.1
    - perf: reduce try block size
    - perf: remove bitwise operations
  * perf: enable strict mode
  * perf: remove argument reassignment
  * perf: remove delete call

1.12.4 / 2015-05-10
===================

  * deps: debug@~2.2.0
  * deps: qs@2.4.2
    - Fix allowing parameters like `constructor`
  * deps: on-finished@~2.2.1
  * deps: raw-body@~2.0.1
    - Fix a false-positive when unpiping in Node.js 0.8
    - deps: bytes@2.0.1
  * deps: type-is@~1.6.2
    - deps: mime-types@~2.0.11

1.12.3 / 2015-04-15
===================

  * Slight efficiency improvement when not debugging
  * deps: depd@~1.0.1
  * deps: iconv-lite@0.4.8
    - Add encoding alias UNICODE-1-1-UTF-7
  * deps: raw-body@1.3.4
    - Fix hanging callback if request aborts during read
    - deps: iconv-lite@0.4.8

1.12.2 / 2015-03-16
===================

  * deps: qs@2.4.1
    - Fix error when parameter `hasOwnProperty` is present

1.12.1 / 2015-03-15
===================

  * deps: debug@~2.1.3
    - Fix high intensity foreground color for bold
    - deps: ms@0.7.0
  * deps: type-is@~1.6.1
    - deps: mime-types@~2.0.10

1.12.0 / 2015-02-13
===================

  * add `debug` messages
  * accept a function for the `type` option
  * use `content-type` to parse `Content-Type` headers
  * deps: iconv-lite@0.4.7
    - Gracefully support enumerables on `Object.prototype`
  * deps: raw-body@1.3.3
    - deps: iconv-lite@0.4.7
  * deps: type-is@~1.6.0
    - fix argument reassignment
    - fix false-positives in `hasBody` `Transfer-Encoding` check
    - support wildcard for both type and subtype (`*/*`)
    - deps: mime-types@~2.0.9

1.11.0 / 2015-01-30
===================

  * make internal `extended: true` depth limit infinity
  * deps: type-is@~1.5.6
    - deps: mime-types@~2.0.8

1.10.2 / 2015-01-20
===================

  * deps: iconv-lite@0.4.6
    - Fix rare aliases of single-byte encodings
  * deps: raw-body@1.3.2
    - deps: iconv-lite@0.4.6

1.10.1 / 2015-01-01
===================

  * deps: on-finished@~2.2.0
  * deps: type-is@~1.5.5
    - deps: mime-types@~2.0.7

1.10.0 / 2014-12-02
===================

  * make internal `extended: true` array limit dynamic

1.9.3 / 2014-11-21
==================

  * deps: iconv-lite@0.4.5
    - Fix Windows-31J and X-SJIS encoding support
  * deps: qs@2.3.3
    - Fix `arrayLimit` behavior
  * deps: raw-body@1.3.1
    - deps: iconv-lite@0.4.5
  * deps: type-is@~1.5.3
    - deps: mime-types@~2.0.3

1.9.2 / 2014-10-27
==================

  * deps: qs@2.3.2
    - Fix parsing of mixed objects and values

1.9.1 / 2014-10-22
==================

  * deps: on-finished@~2.1.1
    - Fix handling of pipelined requests
  * deps: qs@2.3.0
    - Fix parsing of mixed implicit and explicit arrays
  * deps: type-is@~1.5.2
    - deps: mime-types@~2.0.2

1.9.0 / 2014-09-24
==================

  * include the charset in "unsupported charset" error message
  * include the encoding in "unsupported content encoding" error message
  * deps: depd@~1.0.0

1.8.4 / 2014-09-23
==================

  * fix content encoding to be case-insensitive

1.8.3 / 2014-09-19
==================

  * deps: qs@2.2.4
    - Fix issue with object keys starting with numbers truncated

1.8.2 / 2014-09-15
==================

  * deps: depd@0.4.5

1.8.1 / 2014-09-07
==================

  * deps: media-typer@0.3.0
  * deps: type-is@~1.5.1

1.8.0 / 2014-09-05
==================

  * make empty-body-handling consistent between chunked requests
    - empty `json` produces `{}`
    - empty `raw` produces `new Buffer(0)`
    - empty `text` produces `''`
    - empty `urlencoded` produces `{}`
  * deps: qs@2.2.3
    - Fix issue where first empty value in array is discarded
  * deps: type-is@~1.5.0
    - fix `hasbody` to be true for `content-length: 0`

1.7.0 / 2014-09-01
==================

  * add `parameterLimit` option to `urlencoded` parser
  * change `urlencoded` extended array limit to 100
  * respond with 413 when over `parameterLimit` in `urlencoded`

1.6.7 / 2014-08-29
==================

  * deps: qs@2.2.2
    - Remove unnecessary cloning

1.6.6 / 2014-08-27
==================

  * deps: qs@2.2.0
    - Array parsing fix
    - Performance improvements

1.6.5 / 2014-08-16
==================

  * deps: on-finished@2.1.0

1.6.4 / 2014-08-14
==================

  * deps: qs@1.2.2

1.6.3 / 2014-08-10
==================

  * deps: qs@1.2.1

1.6.2 / 2014-08-07
==================

  * deps: qs@1.2.0
    - Fix parsing array of objects

1.6.1 / 2014-08-06
==================

  * deps: qs@1.1.0
    - Accept urlencoded square brackets
    - Accept empty values in implicit array notation

1.6.0 / 2014-08-05
==================

  * deps: qs@1.0.2
    - Complete rewrite
    - Limits array length to 20
    - Limits object depth to 5
    - Limits parameters to 1,000

1.5.2 / 2014-07-27
==================

  * deps: depd@0.4.4
    - Work-around v8 generating empty stack traces

1.5.1 / 2014-07-26
==================

  * deps: depd@0.4.3
    - Fix exception when global `Error.stackTraceLimit` is too low

1.5.0 / 2014-07-20
==================

  * deps: depd@0.4.2
    - Add `TRACE_DEPRECATION` environment variable
    - Remove non-standard grey color from color output
    - Support `--no-deprecation` argument
    - Support `--trace-deprecation` argument
  * deps: iconv-lite@0.4.4
    - Added encoding UTF-7
  * deps: raw-body@1.3.0
    - deps: iconv-lite@0.4.4
    - Added encoding UTF-7
    - Fix `Cannot switch to old mode now` error on Node.js 0.10+
  * deps: type-is@~1.3.2

1.4.3 / 2014-06-19
==================

  * deps: type-is@1.3.1
    - fix global variable leak

1.4.2 / 2014-06-19
==================

  * deps: type-is@1.3.0
    - improve type parsing

1.4.1 / 2014-06-19
==================

  * fix urlencoded extended deprecation message

1.4.0 / 2014-06-19
==================

  * add `text` parser
  * add `raw` parser
  * check accepted charset in content-type (accepts utf-8)
  * check accepted encoding in content-encoding (accepts identity)
  * deprecate `bodyParser()` middleware; use `.json()` and `.urlencoded()` as needed
  * deprecate `urlencoded()` without provided `extended` option
  * lazy-load urlencoded parsers
  * parsers split into files for reduced mem usage
  * support gzip and deflate bodies
    - set `inflate: false` to turn off
  * deps: raw-body@1.2.2
    - Support all encodings from `iconv-lite`

1.3.1 / 2014-06-11
==================

  * deps: type-is@1.2.1
    - Switch dependency from mime to mime-types@1.0.0

1.3.0 / 2014-05-31
==================

  * add `extended` option to urlencoded parser

1.2.2 / 2014-05-27
==================

  * deps: raw-body@1.1.6
    - assert stream encoding on node.js 0.8
    - assert stream encoding on node.js < 0.10.6
    - deps: bytes@1

1.2.1 / 2014-05-26
==================

  * invoke `next(err)` after request fully read
    - prevents hung responses and socket hang ups

1.2.0 / 2014-05-11
==================

  * add `verify` option
  * deps: type-is@1.2.0
    - support suffix matching

1.1.2 / 2014-05-11
==================

  * improve json parser speed

1.1.1 / 2014-05-11
==================

  * fix repeated limit parsing with every request

1.1.0 / 2014-05-10
==================

  * add `type` option
  * deps: pin for safety and consistency

1.0.2 / 2014-04-14
==================

  * use `type-is` module

1.0.1 / 2014-03-20
==================

  * lower default limits to 100kb
