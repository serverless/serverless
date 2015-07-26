2.1.0 / 2015-05-21
==================

  * add `.format` export
  * add `.parse` export

2.0.2 / 2015-05-20
==================

  * remove map recreation
  * remove unnecessary object construction

2.0.1 / 2015-05-07
==================

  * fix browserify require
  * remove node.extend dependency

2.0.0 / 2015-04-12
==================

  * add option "case"
  * add option "thousandsSeparator"
  * return "null" on invalid parse input
  * support proper round-trip: bytes(bytes(num)) === num
  * units no longer case sensitive when parsing

1.0.0 / 2014-05-05
==================

 * add negative support. fixes #6

0.3.0 / 2014-03-19
==================

 * added terabyte support

0.2.1 / 2013-04-01
==================

  * add .component

0.2.0 / 2012-10-28
==================

  * bytes(200).should.eql('200b')

0.1.0 / 2012-07-04
==================

  * add bytes to string conversion [yields]
