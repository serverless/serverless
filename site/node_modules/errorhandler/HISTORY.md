1.4.1 / 2015-07-05
==================

  * deps: accepts@~1.2.10
    - deps: mime-types@~2.1.2

1.4.0 / 2015-06-10
==================

  * Add charset to the `Content-Type` header
  * Support `statusCode` property on `Error` objects
  * deps: accepts@~1.2.9
    - deps: mime-types@~2.1.1
    - deps: negotiator@0.5.3
    - perf: avoid argument reassignment & argument slice
    - perf: avoid negotiator recursive construction
    - perf: enable strict mode
    - perf: remove unnecessary bitwise operator
  * deps: escape-html@1.0.2

1.3.6 / 2015-05-14
==================

  * deps: accepts@~1.2.7
    - deps: mime-types@~2.0.11
    - deps: negotiator@0.5.3

1.3.5 / 2015-03-14
==================

  * deps: accepts@~1.2.5
    - deps: mime-types@~2.0.10

1.3.4 / 2015-02-15
==================

  * deps: accepts@~1.2.4
    - deps: mime-types@~2.0.9
    - deps: negotiator@0.5.1

1.3.3 / 2015-01-31
==================

  * deps: accepts@~1.2.3
    - deps: mime-types@~2.0.8

1.3.2 / 2015-01-01
==================

  * Fix heading content to not include stack

1.3.1 / 2014-12-31
==================

  * deps: accepts@~1.2.2
    - deps: mime-types@~2.0.7
    - deps: negotiator@0.5.0

1.3.0 / 2014-11-22
==================

  * Add `log` option

1.2.4 / 2015-01-01
==================

  * Fix heading content to not include stack

1.2.3 / 2014-11-21
==================

  * deps: accepts@~1.1.3
    - deps: mime-types@~2.0.3

1.2.2 / 2014-10-15
==================

  * deps: accepts@~1.1.2
    - Fix error when media type has invalid parameter
    - deps: negotiator@0.4.9

1.2.1 / 2014-10-12
==================

  * deps: accepts@~1.1.1
    - deps: mime-types@~2.0.2
    - deps: negotiator@0.4.8

1.2.0 / 2014-09-02
==================

  * Display error using `util.inspect` if no other representation
  * deps: accepts@~1.1.0

1.1.1 / 2014-06-20
==================

  * deps: accepts@~1.0.4
    - use `mime-types`

1.1.0 / 2014-06-16
==================

  * Display error on console formatted like `throw`
  * Escape HTML with `escape-html` module
  * Escape HTML in stack trace
  * Escape HTML in title
  * Fix up edge cases with error sent in response
  * Set `X-Content-Type-Options: nosniff` header
  * Use accepts for negotiation

1.0.2 / 2014-06-05
==================

  * Pass on errors from reading error files

1.0.1 / 2014-04-29
==================

  * Clean up error CSS
  * Do not respond after headers sent

1.0.0 / 2014-03-03
==================

  * Genesis from `connect`
