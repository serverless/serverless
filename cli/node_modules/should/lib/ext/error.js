/*!
 * Should
 * Copyright(c) 2010-2014 TJ Holowaychuk <tj@vision-media.ca>
 * MIT Licensed
 */
var util = require('../util');

module.exports = function(should, Assertion) {
  var i = should.format;

  /**
   * Assert given function throws error with such message.
   *
   * @name throw
   * @memberOf Assertion
   * @category assertion errors
   * @alias Assertion#throwError
   * @param {string|RegExp|Function|Object|GeneratorFunction|GeneratorObject} [message] Message to match or properties
   * @param {Object} [properties] Optional properties that will be matched to thrown error
   * @example
   *
   * (function(){ throw new Error('fail') }).should.throw();
   * (function(){ throw new Error('fail') }).should.throw('fail');
   * (function(){ throw new Error('fail') }).should.throw(/fail/);
   *
   * (function(){ throw new Error('fail') }).should.throw(Error);
   * var error = new Error();
   * error.a = 10;
   * (function(){ throw error; }).should.throw(Error, { a: 10 });
   * (function(){ throw error; }).should.throw({ a: 10 });
   * (function*() {
   *   yield throwError();
   * }).should.throw();
   */
  Assertion.add('throw', function(message, properties) {
    var fn = this.obj
      , err = {}
      , errorInfo = ''
      , thrown = false;

    if(util.isGeneratorFunction(fn)) {
      return should(fn()).throw(message, properties);
    } else if(util.isGeneratorObject(fn)) {
      return should(fn.next.bind(fn)).throw(message, properties);
    }

    this.is.a.Function();

    var errorMatched = true;

    try {
      fn();
    } catch(e) {
      thrown = true;
      err = e;
    }

    if(thrown) {
      if(message) {
        if('string' == typeof message) {
          errorMatched = message == err.message;
        } else if(message instanceof RegExp) {
          errorMatched = message.test(err.message);
        } else if('function' == typeof message) {
          errorMatched = err instanceof message;
        } else if(null != message) {
          try {
            should(err).match(message);
          } catch(e) {
            if(e instanceof should.AssertionError) {
              errorInfo = ": " + e.message;
              errorMatched = false;
            } else {
              throw e;
            }
          }
        }

        if(!errorMatched) {
          if('string' == typeof message || message instanceof RegExp) {
            errorInfo = " with a message matching " + i(message) + ", but got '" + err.message + "'";
          } else if('function' == typeof message) {
            errorInfo = " of type " + util.functionName(message) + ", but got " + util.functionName(err.constructor);
          }
        } else if('function' == typeof message && properties) {
          try {
            should(err).match(properties);
          } catch(e) {
            if(e instanceof should.AssertionError) {
              errorInfo = ": " + e.message;
              errorMatched = false;
            } else {
              throw e;
            }
          }
        }
      } else {
        errorInfo = " (got " + i(err) + ")";
      }
    }

    this.params = { operator: 'to throw exception' + errorInfo };

    this.assert(thrown);
    this.assert(errorMatched);
  });

  Assertion.alias('throw', 'throwError');
};
