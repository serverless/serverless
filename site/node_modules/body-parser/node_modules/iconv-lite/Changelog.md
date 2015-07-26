
# 0.4.11 / 2015-07-03

 * Added CESU-8 encoding.


# 0.4.10 / 2015-05-26

 * Changed UTF-16 endianness heuristic to take into account any ASCII chars, not
   just spaces. This should minimize the importance of "default" endianness.


# 0.4.9 / 2015-05-24

 * Streamlined BOM handling: strip BOM by default, add BOM when encoding if 
   addBOM: true. Added docs to Readme.
 * UTF16 now uses UTF16-LE by default.
 * Fixed minor issue with big5 encoding.
 * Added io.js testing on Travis; updated node-iconv version to test against.
   Now we just skip testing SBCS encodings that node-iconv doesn't support.
 * (internal refactoring) Updated codec interface to use classes.
 * Use strict mode in all files.


# 0.4.8 / 2015-04-14
 
 * added alias UNICODE-1-1-UTF-7 for UTF-7 encoding (#94)


# 0.4.7 / 2015-02-05

 * stop official support of Node.js v0.8. Should still work, but no guarantees.
   reason: Packages needed for testing are hard to get on Travis CI.
 * work in environment where Object.prototype is monkey patched with enumerable 
   props (#89).


# 0.4.6 / 2015-01-12
 
 * fix rare aliases of single-byte encodings (thanks @mscdex)
 * double the timeout for dbcs tests to make them less flaky on travis


# 0.4.5 / 2014-11-20

 * fix windows-31j and x-sjis encoding support (@nleush)
 * minor fix: undefined variable reference when internal error happens


# 0.4.4 / 2014-07-16

 * added encodings UTF-7 (RFC2152) and UTF-7-IMAP (RFC3501 Section 5.1.3)
 * fixed streaming base64 encoding


# 0.4.3 / 2014-06-14

 * added encodings UTF-16BE and UTF-16 with BOM


# 0.4.2 / 2014-06-12

 * don't throw exception if `extendNodeEncodings()` is called more than once


# 0.4.1 / 2014-06-11

 * codepage 808 added


# 0.4.0 / 2014-06-10

 * code is rewritten from scratch
 * all widespread encodings are supported
 * streaming interface added
 * browserify compatibility added
 * (optional) extend core primitive encodings to make usage even simpler
 * moved from vows to mocha as the testing framework


