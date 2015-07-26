/*!
 * Should
 * Copyright(c) 2010-2014 TJ Holowaychuk <tj@vision-media.ca>
 * MIT Licensed
 */

module.exports = function(should, Assertion) {
  /**
   * Assert given string starts with prefix
   * @name startWith
   * @memberOf Assertion
   * @category assertion strings
   * @param {string} str Prefix
   * @param {string} [description] Optional message
   * @example
   *
   * 'abc'.should.startWith('a');
   */
  Assertion.add('startWith', function(str, description) {
    this.params = { operator: 'to start with ' + should.format(str), message: description };

    this.assert(0 === this.obj.indexOf(str));
  });

  /**
   * Assert given string starts with prefix
   * @name endWith
   * @memberOf Assertion
   * @category assertion strings
   * @param {string} str Prefix
   * @param {string} [description] Optional message
   * @example
   *
   * 'abca'.should.endWith('a');
   */
  Assertion.add('endWith', function(str, description) {
    this.params = { operator: 'to end with ' + should.format(str), message: description };

    this.assert(this.obj.indexOf(str, this.obj.length - str.length) >= 0);
  });
};
