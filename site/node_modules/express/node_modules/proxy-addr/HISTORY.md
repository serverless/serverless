1.0.8 / 2015-05-10
==================

  * deps: ipaddr.js@1.0.1

1.0.7 / 2015-03-16
==================

  * deps: ipaddr.js@0.1.9
    - Fix OOM on certain inputs to `isValid`

1.0.6 / 2015-02-01
==================

  * deps: ipaddr.js@0.1.8

1.0.5 / 2015-01-08
==================

  * deps: ipaddr.js@0.1.6

1.0.4 / 2014-11-23
==================

  * deps: ipaddr.js@0.1.5
    - Fix edge cases with `isValid`

1.0.3 / 2014-09-21
==================

  * Use `forwarded` npm module

1.0.2 / 2014-09-18
==================

  * Fix a global leak when multiple subnets are trusted
  * Support Node.js 0.6
  * deps: ipaddr.js@0.1.3

1.0.1 / 2014-06-03
==================

  * Fix links in npm package

1.0.0 / 2014-05-08
==================

  * Add `trust` argument to determine proxy trust on
    * Accepts custom function
    * Accepts IPv4/IPv6 address(es)
    * Accepts subnets
    * Accepts pre-defined names
  * Add optional `trust` argument to `proxyaddr.all` to
    stop at first untrusted
  * Add `proxyaddr.compile` to pre-compile `trust` function
    to make subsequent calls faster

0.0.1 / 2014-05-04
==================

  * Fix bad npm publish

0.0.0 / 2014-05-04
==================

  * Initial release
