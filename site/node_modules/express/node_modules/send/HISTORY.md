0.13.0 / 2015-06-16
===================

  * Allow Node.js HTTP server to set `Date` response header
  * Fix incorrectly removing `Content-Location` on 304 response
  * Improve the default redirect response headers
  * Send appropriate headers on default error response
  * Use `http-errors` for standard emitted errors
  * Use `statuses` instead of `http` module for status messages
  * deps: escape-html@1.0.2
  * deps: etag@~1.7.0
    - Improve stat performance by removing hashing
  * deps: fresh@0.3.0
    - Add weak `ETag` matching support
  * deps: on-finished@~2.3.0
    - Add defined behavior for HTTP `CONNECT` requests
    - Add defined behavior for HTTP `Upgrade` requests
    - deps: ee-first@1.1.1
  * perf: enable strict mode
  * perf: remove unnecessary array allocations

0.12.3 / 2015-05-13
===================

  * deps: debug@~2.2.0
    - deps: ms@0.7.1
  * deps: depd@~1.0.1
  * deps: etag@~1.6.0
   - Improve support for JXcore
   - Support "fake" stats objects in environments without `fs`
  * deps: ms@0.7.1
    - Prevent extraordinarily long inputs
  * deps: on-finished@~2.2.1

0.12.2 / 2015-03-13
===================

  * Throw errors early for invalid `extensions` or `index` options
  * deps: debug@~2.1.3
    - Fix high intensity foreground color for bold
    - deps: ms@0.7.0

0.12.1 / 2015-02-17
===================

  * Fix regression sending zero-length files

0.12.0 / 2015-02-16
===================

  * Always read the stat size from the file
  * Fix mutating passed-in `options`
  * deps: mime@1.3.4

0.11.1 / 2015-01-20
===================

  * Fix `root` path disclosure

0.11.0 / 2015-01-05
===================

  * deps: debug@~2.1.1
  * deps: etag@~1.5.1
    - deps: crc@3.2.1
  * deps: ms@0.7.0
    - Add `milliseconds`
    - Add `msecs`
    - Add `secs`
    - Add `mins`
    - Add `hrs`
    - Add `yrs`
  * deps: on-finished@~2.2.0

0.10.1 / 2014-10-22
===================

  * deps: on-finished@~2.1.1
    - Fix handling of pipelined requests

0.10.0 / 2014-10-15
===================

  * deps: debug@~2.1.0
    - Implement `DEBUG_FD` env variable support
  * deps: depd@~1.0.0
  * deps: etag@~1.5.0
    - Improve string performance
    - Slightly improve speed for weak ETags over 1KB

0.9.3 / 2014-09-24
==================

  * deps: etag@~1.4.0
    - Support "fake" stats objects

0.9.2 / 2014-09-15
==================

  * deps: depd@0.4.5
  * deps: etag@~1.3.1
  * deps: range-parser@~1.0.2

0.9.1 / 2014-09-07
==================

  * deps: fresh@0.2.4

0.9.0 / 2014-09-07
==================

  * Add `lastModified` option
  * Use `etag` to generate `ETag` header
  * deps: debug@~2.0.0

0.8.5 / 2014-09-04
==================

  * Fix malicious path detection for empty string path

0.8.4 / 2014-09-04
==================

  * Fix a path traversal issue when using `root`

0.8.3 / 2014-08-16
==================

  * deps: destroy@1.0.3
    - renamed from dethroy
  * deps: on-finished@2.1.0

0.8.2 / 2014-08-14
==================

  * Work around `fd` leak in Node.js 0.10 for `fs.ReadStream`
  * deps: dethroy@1.0.2

0.8.1 / 2014-08-05
==================

  * Fix `extensions` behavior when file already has extension

0.8.0 / 2014-08-05
==================

  * Add `extensions` option

0.7.4 / 2014-08-04
==================

  * Fix serving index files without root dir

0.7.3 / 2014-07-29
==================

  * Fix incorrect 403 on Windows and Node.js 0.11

0.7.2 / 2014-07-27
==================

  * deps: depd@0.4.4
    - Work-around v8 generating empty stack traces

0.7.1 / 2014-07-26
==================

 * deps: depd@0.4.3
   - Fix exception when global `Error.stackTraceLimit` is too low

0.7.0 / 2014-07-20
==================

 * Deprecate `hidden` option; use `dotfiles` option
 * Add `dotfiles` option
 * deps: debug@1.0.4
 * deps: depd@0.4.2
   - Add `TRACE_DEPRECATION` environment variable
   - Remove non-standard grey color from color output
   - Support `--no-deprecation` argument
   - Support `--trace-deprecation` argument

0.6.0 / 2014-07-11
==================

 * Deprecate `from` option; use `root` option
 * Deprecate `send.etag()` -- use `etag` in `options`
 * Deprecate `send.hidden()` -- use `hidden` in `options`
 * Deprecate `send.index()` -- use `index` in `options`
 * Deprecate `send.maxage()` -- use `maxAge` in `options`
 * Deprecate `send.root()` -- use `root` in `options`
 * Cap `maxAge` value to 1 year
 * deps: debug@1.0.3
   - Add support for multiple wildcards in namespaces

0.5.0 / 2014-06-28
==================

 * Accept string for `maxAge` (converted by `ms`)
 * Add `headers` event
 * Include link in default redirect response
 * Use `EventEmitter.listenerCount` to count listeners

0.4.3 / 2014-06-11
==================

 * Do not throw un-catchable error on file open race condition
 * Use `escape-html` for HTML escaping
 * deps: debug@1.0.2
   - fix some debugging output colors on node.js 0.8
 * deps: finished@1.2.2
 * deps: fresh@0.2.2

0.4.2 / 2014-06-09
==================

 * fix "event emitter leak" warnings
 * deps: debug@1.0.1
 * deps: finished@1.2.1

0.4.1 / 2014-06-02
==================

 * Send `max-age` in `Cache-Control` in correct format

0.4.0 / 2014-05-27
==================

 * Calculate ETag with md5 for reduced collisions
 * Fix wrong behavior when index file matches directory
 * Ignore stream errors after request ends
   - Goodbye `EBADF, read`
 * Skip directories in index file search
 * deps: debug@0.8.1

0.3.0 / 2014-04-24
==================

 * Fix sending files with dots without root set
 * Coerce option types
 * Accept API options in options object
 * Set etags to "weak"
 * Include file path in etag
 * Make "Can't set headers after they are sent." catchable
 * Send full entity-body for multi range requests
 * Default directory access to 403 when index disabled
 * Support multiple index paths
 * Support "If-Range" header
 * Control whether to generate etags
 * deps: mime@1.2.11

0.2.0 / 2014-01-29
==================

 * update range-parser and fresh

0.1.4 / 2013-08-11 
==================

 * update fresh

0.1.3 / 2013-07-08 
==================

 * Revert "Fix fd leak"

0.1.2 / 2013-07-03 
==================

 * Fix fd leak

0.1.0 / 2012-08-25 
==================

  * add options parameter to send() that is passed to fs.createReadStream() [kanongil]

0.0.4 / 2012-08-16 
==================

  * allow custom "Accept-Ranges" definition

0.0.3 / 2012-07-16 
==================

  * fix normalization of the root directory. Closes #3

0.0.2 / 2012-07-09 
==================

  * add passing of req explicitly for now (YUCK)

0.0.1 / 2010-01-03
==================

  * Initial release
