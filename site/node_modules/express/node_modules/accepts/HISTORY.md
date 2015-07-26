1.2.11 / 2015-07-16
===================

  * deps: mime-types@~2.1.3
    - deps: mime-db@~1.15.0

1.2.10 / 2015-07-01
===================

  * deps: mime-types@~2.1.2
    - deps: mime-db@~1.14.0

1.2.9 / 2015-06-08
==================

  * deps: mime-types@~2.1.1
    - perf: fix deopt during mapping

1.2.8 / 2015-06-07
==================

  * deps: mime-types@~2.1.0
    - deps: mime-db@~1.13.0
  * perf: avoid argument reassignment & argument slice
  * perf: avoid negotiator recursive construction
  * perf: enable strict mode
  * perf: remove unnecessary bitwise operator

1.2.7 / 2015-05-10
==================

  * deps: negotiator@0.5.3
    - Fix media type parameter matching to be case-insensitive

1.2.6 / 2015-05-07
==================

  * deps: mime-types@~2.0.11
    - deps: mime-db@~1.9.1
  * deps: negotiator@0.5.2
    - Fix comparing media types with quoted values
    - Fix splitting media types with quoted commas

1.2.5 / 2015-03-13
==================

  * deps: mime-types@~2.0.10
    - deps: mime-db@~1.8.0

1.2.4 / 2015-02-14
==================

  * Support Node.js 0.6
  * deps: mime-types@~2.0.9
    - deps: mime-db@~1.7.0
  * deps: negotiator@0.5.1
    - Fix preference sorting to be stable for long acceptable lists

1.2.3 / 2015-01-31
==================

  * deps: mime-types@~2.0.8
    - deps: mime-db@~1.6.0

1.2.2 / 2014-12-30
==================

  * deps: mime-types@~2.0.7
    - deps: mime-db@~1.5.0

1.2.1 / 2014-12-30
==================

  * deps: mime-types@~2.0.5
    - deps: mime-db@~1.3.1

1.2.0 / 2014-12-19
==================

  * deps: negotiator@0.5.0
    - Fix list return order when large accepted list
    - Fix missing identity encoding when q=0 exists
    - Remove dynamic building of Negotiator class

1.1.4 / 2014-12-10
==================

  * deps: mime-types@~2.0.4
    - deps: mime-db@~1.3.0

1.1.3 / 2014-11-09
==================

  * deps: mime-types@~2.0.3
    - deps: mime-db@~1.2.0

1.1.2 / 2014-10-14
==================

  * deps: negotiator@0.4.9
    - Fix error when media type has invalid parameter

1.1.1 / 2014-09-28
==================

  * deps: mime-types@~2.0.2
    - deps: mime-db@~1.1.0
  * deps: negotiator@0.4.8
    - Fix all negotiations to be case-insensitive
    - Stable sort preferences of same quality according to client order

1.1.0 / 2014-09-02
==================

  * update `mime-types`

1.0.7 / 2014-07-04
==================

  * Fix wrong type returned from `type` when match after unknown extension

1.0.6 / 2014-06-24
==================

  * deps: negotiator@0.4.7

1.0.5 / 2014-06-20
==================

 * fix crash when unknown extension given

1.0.4 / 2014-06-19
==================

  * use `mime-types`

1.0.3 / 2014-06-11
==================

  * deps: negotiator@0.4.6
    - Order by specificity when quality is the same

1.0.2 / 2014-05-29
==================

  * Fix interpretation when header not in request
  * deps: pin negotiator@0.4.5

1.0.1 / 2014-01-18
==================

  * Identity encoding isn't always acceptable
  * deps: negotiator@~0.4.0

1.0.0 / 2013-12-27
==================

  * Genesis
