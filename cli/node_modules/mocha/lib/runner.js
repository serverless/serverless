/**
 * Module dependencies.
 */

var EventEmitter = require('events').EventEmitter
  , debug = require('debug')('mocha:runner')
  , Pending = require('./pending')
  , Test = require('./test')
  , utils = require('./utils')
  , filter = utils.filter
  , keys = utils.keys
  , type = utils.type
  , stringify = utils.stringify
  , stackFilter = utils.stackTraceFilter();

/**
 * Non-enumerable globals.
 */

var globals = [
  'setTimeout',
  'clearTimeout',
  'setInterval',
  'clearInterval',
  'XMLHttpRequest',
  'Date',
  'setImmediate',
  'clearImmediate'
];

/**
 * Expose `Runner`.
 */

module.exports = Runner;

/**
 * Initialize a `Runner` for the given `suite`.
 *
 * Events:
 *
 *   - `start`  execution started
 *   - `end`  execution complete
 *   - `suite`  (suite) test suite execution started
 *   - `suite end`  (suite) all tests (and sub-suites) have finished
 *   - `test`  (test) test execution started
 *   - `test end`  (test) test completed
 *   - `hook`  (hook) hook execution started
 *   - `hook end`  (hook) hook complete
 *   - `pass`  (test) test passed
 *   - `fail`  (test, err) test failed
 *   - `pending`  (test) test pending
 *
 * @param {Suite} suite Root suite
 * @param {boolean} [delay] Whether or not to delay execution of root suite
 *   until ready.
 * @api public
 */

function Runner(suite, delay) {
  var self = this;
  this._globals = [];
  this._abort = false;
  this._delay = delay;
  this.suite = suite;
  this.total = suite.total();
  this.failures = 0;
  this.on('test end', function(test){ self.checkGlobals(test); });
  this.on('hook end', function(hook){ self.checkGlobals(hook); });
  this.grep(/.*/);
  this.globals(this.globalProps().concat(extraGlobals()));
}

/**
 * Wrapper for setImmediate, process.nextTick, or browser polyfill.
 *
 * @param {Function} fn
 * @api private
 */

Runner.immediately = global.setImmediate || process.nextTick;

/**
 * Inherit from `EventEmitter.prototype`.
 */

Runner.prototype.__proto__ = EventEmitter.prototype;

/**
 * Run tests with full titles matching `re`. Updates runner.total
 * with number of tests matched.
 *
 * @param {RegExp} re
 * @param {Boolean} invert
 * @return {Runner} for chaining
 * @api public
 */

Runner.prototype.grep = function(re, invert){
  debug('grep %s', re);
  this._grep = re;
  this._invert = invert;
  this.total = this.grepTotal(this.suite);
  return this;
};

/**
 * Returns the number of tests matching the grep search for the
 * given suite.
 *
 * @param {Suite} suite
 * @return {Number}
 * @api public
 */

Runner.prototype.grepTotal = function(suite) {
  var self = this;
  var total = 0;

  suite.eachTest(function(test){
    var match = self._grep.test(test.fullTitle());
    if (self._invert) match = !match;
    if (match) total++;
  });

  return total;
};

/**
 * Return a list of global properties.
 *
 * @return {Array}
 * @api private
 */

Runner.prototype.globalProps = function() {
  var props = utils.keys(global);

  // non-enumerables
  for (var i = 0; i < globals.length; ++i) {
    if (~utils.indexOf(props, globals[i])) continue;
    props.push(globals[i]);
  }

  return props;
};

/**
 * Allow the given `arr` of globals.
 *
 * @param {Array} arr
 * @return {Runner} for chaining
 * @api public
 */

Runner.prototype.globals = function(arr){
  if (0 == arguments.length) return this._globals;
  debug('globals %j', arr);
  this._globals = this._globals.concat(arr);
  return this;
};

/**
 * Check for global variable leaks.
 *
 * @api private
 */

Runner.prototype.checkGlobals = function(test){
  if (this.ignoreLeaks) return;
  var ok = this._globals;

  var globals = this.globalProps();
  var leaks;

  if (test) {
    ok = ok.concat(test._allowedGlobals || []);
  }

  if(this.prevGlobalsLength == globals.length) return;
  this.prevGlobalsLength = globals.length;

  leaks = filterLeaks(ok, globals);
  this._globals = this._globals.concat(leaks);

  if (leaks.length > 1) {
    this.fail(test, new Error('global leaks detected: ' + leaks.join(', ') + ''));
  } else if (leaks.length) {
    this.fail(test, new Error('global leak detected: ' + leaks[0]));
  }
};

/**
 * Fail the given `test`.
 *
 * @param {Test} test
 * @param {Error} err
 * @api private
 */

Runner.prototype.fail = function(test, err) {
  ++this.failures;
  test.state = 'failed';

  if (!(err instanceof Error)) {
    err = new Error('the ' + type(err) + ' ' + stringify(err) + ' was thrown, throw an Error :)');
  }

  err.stack = (this.fullStackTrace || !err.stack)
    ? err.stack
    : stackFilter(err.stack);

  this.emit('fail', test, err);
};

/**
 * Fail the given `hook` with `err`.
 *
 * Hook failures work in the following pattern:
 * - If bail, then exit
 * - Failed `before` hook skips all tests in a suite and subsuites,
 *   but jumps to corresponding `after` hook
 * - Failed `before each` hook skips remaining tests in a
 *   suite and jumps to corresponding `after each` hook,
 *   which is run only once
 * - Failed `after` hook does not alter
 *   execution order
 * - Failed `after each` hook skips remaining tests in a
 *   suite and subsuites, but executes other `after each`
 *   hooks
 *
 * @param {Hook} hook
 * @param {Error} err
 * @api private
 */

Runner.prototype.failHook = function(hook, err){
  this.fail(hook, err);
  if (this.suite.bail()) {
    this.emit('end');
  }
};

/**
 * Run hook `name` callbacks and then invoke `fn()`.
 *
 * @param {String} name
 * @param {Function} function
 * @api private
 */

Runner.prototype.hook = function(name, fn){
  var suite = this.suite
    , hooks = suite['_' + name]
    , self = this
    , timer;

  function next(i) {
    var hook = hooks[i];
    if (!hook) return fn();
    self.currentRunnable = hook;

    hook.ctx.currentTest = self.test;

    self.emit('hook', hook);

    hook.on('error', function(err){
      self.failHook(hook, err);
    });

    hook.run(function(err){
      hook.removeAllListeners('error');
      var testError = hook.error();
      if (testError) self.fail(self.test, testError);
      if (err) {
        if (err instanceof Pending) {
          suite.pending = true;
        } else {
          self.failHook(hook, err);

          // stop executing hooks, notify callee of hook err
          return fn(err);
        }
      }
      self.emit('hook end', hook);
      delete hook.ctx.currentTest;
      next(++i);
    });
  }

  Runner.immediately(function(){
    next(0);
  });
};

/**
 * Run hook `name` for the given array of `suites`
 * in order, and callback `fn(err, errSuite)`.
 *
 * @param {String} name
 * @param {Array} suites
 * @param {Function} fn
 * @api private
 */

Runner.prototype.hooks = function(name, suites, fn){
  var self = this
    , orig = this.suite;

  function next(suite) {
    self.suite = suite;

    if (!suite) {
      self.suite = orig;
      return fn();
    }

    self.hook(name, function(err){
      if (err) {
        var errSuite = self.suite;
        self.suite = orig;
        return fn(err, errSuite);
      }

      next(suites.pop());
    });
  }

  next(suites.pop());
};

/**
 * Run hooks from the top level down.
 *
 * @param {String} name
 * @param {Function} fn
 * @api private
 */

Runner.prototype.hookUp = function(name, fn){
  var suites = [this.suite].concat(this.parents()).reverse();
  this.hooks(name, suites, fn);
};

/**
 * Run hooks from the bottom up.
 *
 * @param {String} name
 * @param {Function} fn
 * @api private
 */

Runner.prototype.hookDown = function(name, fn){
  var suites = [this.suite].concat(this.parents());
  this.hooks(name, suites, fn);
};

/**
 * Return an array of parent Suites from
 * closest to furthest.
 *
 * @return {Array}
 * @api private
 */

Runner.prototype.parents = function(){
  var suite = this.suite
    , suites = [];
  while (suite = suite.parent) suites.push(suite);
  return suites;
};

/**
 * Run the current test and callback `fn(err)`.
 *
 * @param {Function} fn
 * @api private
 */

Runner.prototype.runTest = function(fn){
  var test = this.test
    , self = this;

  if (this.asyncOnly) test.asyncOnly = true;

  try {
    test.on('error', function(err){
      self.fail(test, err);
    });
    test.run(fn);
  } catch (err) {
    fn(err);
  }
};

/**
 * Run tests in the given `suite` and invoke
 * the callback `fn()` when complete.
 *
 * @param {Suite} suite
 * @param {Function} fn
 * @api private
 */

Runner.prototype.runTests = function(suite, fn){
  var self = this
    , tests = suite.tests.slice()
    , test;


  function hookErr(err, errSuite, after) {
    // before/after Each hook for errSuite failed:
    var orig = self.suite;

    // for failed 'after each' hook start from errSuite parent,
    // otherwise start from errSuite itself
    self.suite = after ? errSuite.parent : errSuite;

    if (self.suite) {
      // call hookUp afterEach
      self.hookUp('afterEach', function(err2, errSuite2) {
        self.suite = orig;
        // some hooks may fail even now
        if (err2) return hookErr(err2, errSuite2, true);
        // report error suite
        fn(errSuite);
      });
    } else {
      // there is no need calling other 'after each' hooks
      self.suite = orig;
      fn(errSuite);
    }
  }

  function next(err, errSuite) {
    // if we bail after first err
    if (self.failures && suite._bail) return fn();

    if (self._abort) return fn();

    if (err) return hookErr(err, errSuite, true);

    // next test
    test = tests.shift();

    // all done
    if (!test) return fn();

    // grep
    var match = self._grep.test(test.fullTitle());
    if (self._invert) match = !match;
    if (!match) return next();

    // pending
    if (test.pending) {
      self.emit('pending', test);
      self.emit('test end', test);
      return next();
    }

    // execute test and hook(s)
    self.emit('test', self.test = test);
    self.hookDown('beforeEach', function(err, errSuite){

      if (suite.pending) {
        self.emit('pending', test);
        self.emit('test end', test);
        return next();
      }
      if (err) return hookErr(err, errSuite, false);

      self.currentRunnable = self.test;
      self.runTest(function(err){
        test = self.test;

        if (err) {
          if (err instanceof Pending) {
            self.emit('pending', test);
          } else {
            self.fail(test, err);
          }
          self.emit('test end', test);

          if (err instanceof Pending) {
            return next();
          }

          return self.hookUp('afterEach', next);
        }

        test.state = 'passed';
        self.emit('pass', test);
        self.emit('test end', test);
        self.hookUp('afterEach', next);
      });
    });
  }

  this.next = next;
  next();
};

/**
 * Run the given `suite` and invoke the
 * callback `fn()` when complete.
 *
 * @param {Suite} suite
 * @param {Function} fn
 * @api private
 */

Runner.prototype.runSuite = function(suite, fn){
  var total = this.grepTotal(suite)
    , self = this
    , i = 0;

  debug('run suite %s', suite.fullTitle());

  if (!total) return fn();

  this.emit('suite', this.suite = suite);

  function next(errSuite) {
    if (errSuite) {
      // current suite failed on a hook from errSuite
      if (errSuite == suite) {
        // if errSuite is current suite
        // continue to the next sibling suite
        return done();
      } else {
        // errSuite is among the parents of current suite
        // stop execution of errSuite and all sub-suites
        return done(errSuite);
      }
    }

    if (self._abort) return done();

    var curr = suite.suites[i++];
    if (!curr) return done();
    self.runSuite(curr, next);
  }

  function done(errSuite) {
    self.suite = suite;
    self.hook('afterAll', function(){
      self.emit('suite end', suite);
      fn(errSuite);
    });
  }

  this.hook('beforeAll', function(err){
    if (err) return done();
    self.runTests(suite, next);
  });
};

/**
 * Handle uncaught exceptions.
 *
 * @param {Error} err
 * @api private
 */

Runner.prototype.uncaught = function(err){
  if (err) {
    debug('uncaught exception %s', err !== function () {
      return this;
    }.call(err) ? err : ( err.message || err ));
  } else {
    debug('uncaught undefined exception');
    err = utils.undefinedError();
  }
  err.uncaught = true;

  var runnable = this.currentRunnable;
  if (!runnable) return;

  runnable.clearTimeout();

  // Ignore errors if complete
  if (runnable.state) return;
  this.fail(runnable, err);

  // recover from test
  if ('test' == runnable.type) {
    this.emit('test end', runnable);
    this.hookUp('afterEach', this.next);
    return;
  }

  // bail on hooks
  this.emit('end');
};

/**
 * Run the root suite and invoke `fn(failures)`
 * on completion.
 *
 * @param {Function} fn
 * @return {Runner} for chaining
 * @api public
 */

Runner.prototype.run = function(fn){
  var self = this,
    rootSuite = this.suite;

  fn = fn || function(){};

  function uncaught(err){
    self.uncaught(err);
  }

  function start() {
    self.emit('start');
    self.runSuite(rootSuite, function(){
      debug('finished running');
      self.emit('end');
    });
  }

  debug('start');

  // callback
  this.on('end', function(){
    debug('end');
    process.removeListener('uncaughtException', uncaught);
    fn(self.failures);
  });

  // uncaught exception
  process.on('uncaughtException', uncaught);

  if (this._delay) {
    // for reporters, I guess.
    // might be nice to debounce some dots while we wait.
    this.emit('waiting', rootSuite);
    rootSuite.once('run', start);
  }
  else {
    start();
  }

  return this;
};

/**
 * Cleanly abort execution
 *
 * @return {Runner} for chaining
 * @api public
 */
Runner.prototype.abort = function(){
  debug('aborting');
  this._abort = true;
};

/**
 * Filter leaks with the given globals flagged as `ok`.
 *
 * @param {Array} ok
 * @param {Array} globals
 * @return {Array}
 * @api private
 */

function filterLeaks(ok, globals) {
  return filter(globals, function(key){
    // Firefox and Chrome exposes iframes as index inside the window object
    if (/^d+/.test(key)) return false;

    // in firefox
    // if runner runs in an iframe, this iframe's window.getInterface method not init at first
    // it is assigned in some seconds
    if (global.navigator && /^getInterface/.test(key)) return false;

    // an iframe could be approached by window[iframeIndex]
    // in ie6,7,8 and opera, iframeIndex is enumerable, this could cause leak
    if (global.navigator && /^\d+/.test(key)) return false;

    // Opera and IE expose global variables for HTML element IDs (issue #243)
    if (/^mocha-/.test(key)) return false;

    var matched = filter(ok, function(ok){
      if (~ok.indexOf('*')) return 0 == key.indexOf(ok.split('*')[0]);
      return key == ok;
    });
    return matched.length == 0 && (!global.navigator || 'onerror' !== key);
  });
}

/**
 * Array of globals dependent on the environment.
 *
 * @return {Array}
 * @api private
 */

function extraGlobals() {
 if (typeof(process) === 'object' &&
     typeof(process.version) === 'string') {

   var nodeVersion = process.version.split('.').reduce(function(a, v) {
     return a << 8 | v;
   });

   // 'errno' was renamed to process._errno in v0.9.11.

   if (nodeVersion < 0x00090B) {
     return ['errno'];
   }
 }

 return [];
}
