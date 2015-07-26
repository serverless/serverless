var AssertionError = require('./assertion-error');
var util = require('./util');

/**
 * should Assertion
 * @param {*} obj Given object for assertion
 * @constructor
 * @memberOf should
 * @static
 */
function Assertion(obj) {
  this.obj = obj;

  this.anyOne = false;
  this.negate = false;

  this.params = {actual: obj};
}

/**
 * Way to extend Assertion function. It uses some logic
 * to define only positive assertions and itself rule with negative assertion.
 *
 * All actions happen in subcontext and this method take care about negation.
 * Potentially we can add some more modifiers that does not depends from state of assertion.
 * @memberOf Assertion
 * @category assertion
 * @static
 * @param {String} name Name of assertion. It will be used for defining method or getter on Assertion.prototype
 * @param {Function} func Function that will be called on executing assertion
 * @example
 *
 * Assertion.add('asset', function() {
 *      this.params = { operator: 'to be asset' };
 *
 *      this.obj.should.have.property('id').which.is.a.Number();
 *      this.obj.should.have.property('path');
 * });
 */
Assertion.add = function(name, func) {
  var prop = {enumerable: true, configurable: true};

  prop.value = function() {
    var context = new Assertion(this.obj, this, name);
    context.anyOne = this.anyOne;

    try {
      func.apply(context, arguments);
    } catch(e) {
      //check for fail
      if(e instanceof AssertionError) {
        //negative fail
        if(this.negate) {
          this.obj = context.obj;
          this.negate = false;
          return this;
        }

        if(context !== e.assertion) {
          context.params.previous = e;
        }

        //positive fail
        context.negate = false;
        context.fail();
      }
      // throw if it is another exception
      throw e;
    }

    //negative pass
    if(this.negate) {
      context.negate = true;//because .fail will set negate
      context.params.details = 'false negative fail';
      context.fail();
    }

    //positive pass
    if(!this.params.operator) this.params = context.params;//shortcut
    this.obj = context.obj;
    this.negate = false;
    return this;
  };

  Object.defineProperty(Assertion.prototype, name, prop);
};

Assertion.addChain = function(name, onCall) {
  onCall = onCall || function() {
  };
  Object.defineProperty(Assertion.prototype, name, {
    get: function() {
      onCall();
      return this;
    },
    enumerable: true
  });
};

/**
 * Create alias for some `Assertion` property
 *
 * @memberOf Assertion
 * @category assertion
 * @static
 * @param {String} from Name of to map
 * @param {String} to Name of alias
 * @example
 *
 * Assertion.alias('true', 'True');
 */
Assertion.alias = function(from, to) {
  var desc = Object.getOwnPropertyDescriptor(Assertion.prototype, from);
  if(!desc) throw new Error('Alias ' + from + ' -> ' + to + ' could not be created as ' + from + ' not defined');
  Object.defineProperty(Assertion.prototype, to, desc);
};

Assertion.prototype = {
  constructor: Assertion,

  /**
   * Base method for assertions. Before calling this method need to fill Assertion#params object. This method usually called from other assertion methods.
   * `Assertion#params` can contain such properties:
   * * `operator` - required string containing description of this assertion
   * * `obj` - optional replacement for this.obj, it usefull if you prepare more clear object then given
   * * `message` - if this property filled with string any others will be ignored and this one used as assertion message
   * * `expected` - any object used when you need to assert relation between given object and expected. Like given == expected (== is a relation)
   * * `details` - additional string with details to generated message
   *
   * @memberOf Assertion
   * @category assertion
   * @param {*} expr Any expression that will be used as a condition for asserting.
   * @example
   *
   * var a = new should.Assertion(42);
   *
   * a.params = {
   *  operator: 'to be magic number',
   * }
   *
   * a.assert(false);
   * //throws AssertionError: expected 42 to be magic number
   */
  assert: function(expr) {
    if(expr) return this;

    var params = this.params;

    if('obj' in params && !('actual' in params)) {
      params.actual = params.obj;
    } else if(!('obj' in params) && !('actual' in params)) {
      params.actual = this.obj;
    }

    params.stackStartFunction = params.stackStartFunction || this.assert;
    params.negate = this.negate;

    params.assertion = this;

    throw new AssertionError(params);
  },

  /**
   * Shortcut for `Assertion#assert(false)`.
   *
   * @memberOf Assertion
   * @category assertion
   * @example
   *
   * var a = new should.Assertion(42);
   *
   * a.params = {
   *  operator: 'to be magic number',
   * }
   *
   * a.fail();
   * //throws AssertionError: expected 42 to be magic number
   */
  fail: function() {
    return this.assert(false);
  },

  /**
   * Negation modifier. Current assertion chain become negated. Each call invert negation on current assertion.
   *
   * @memberOf Assertion
   * @category assertion
   */
  get not() {
    this.negate = !this.negate;
    return this;
  },

  /**
   * Any modifier - it affect on execution of sequenced assertion to do not `check all`, but `check any of`.
   *
   * @memberOf Assertion
   * @category assertion
   */
  get any() {
    this.anyOne = true;
    return this;
  }
};

module.exports = Assertion;
