2015-02-02 / 1.3.1
==================

  * Fix regression where status can be overwritten in `createError` `props`

2015-02-01 / 1.3.0
==================

  * Construct errors using defined constructors from `createError`
  * Fix error names that are not identifiers
    - `createError["I'mateapot"]` is now `createError.ImATeapot`
  * Set a meaningful `name` property on constructed errors

2014-12-09 / 1.2.8
==================

  * Fix stack trace from exported function
  * Remove `arguments.callee` usage

2014-10-14 / 1.2.7
==================

  * Remove duplicate line

2014-10-02 / 1.2.6
==================

  * Fix `expose` to be `true` for `ClientError` constructor

2014-09-28 / 1.2.5
==================

  * deps: statuses@1

2014-09-21 / 1.2.4
==================

  * Fix dependency version to work with old `npm`s

2014-09-21 / 1.2.3
==================

  * deps: statuses@~1.1.0

2014-09-21 / 1.2.2
==================

  * Fix publish error

2014-09-21 / 1.2.1
==================

  * Support Node.js 0.6
  * Use `inherits` instead of `util`

2014-09-09 / 1.2.0
==================

  * Fix the way inheriting functions
  * Support `expose` being provided in properties argument

2014-09-08 / 1.1.0
==================

  * Default status to 500
  * Support provided `error` to extend

2014-09-08 / 1.0.1
==================

  * Fix accepting string message

2014-09-08 / 1.0.0
==================

  * Initial release
