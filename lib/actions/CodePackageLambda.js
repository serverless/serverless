'use strict';

/**
 * Action: Code Package: Lambda
 * - Accepts one function
 * - Collects the function's Lambda code in a distribution folder
 * - Don't attach "options" to context, it will be overwritten in concurrent operations
 * - WARNING: This Action runs concurrently
 */

module.exports = function(S) {

  const path   = require('path'),
    SError     = require(S.getServerlessPath('Error')),
    SUtils     = S.utils,
    BbPromise  = require('bluebird');

  class CodePackageLambda extends S.classes.Plugin {

    static getName() {
      return 'serverless.core.' + this.name;
    }

    registerActions() {

      S.addAction(this.codePackageLambda.bind(this), {
        handler:       'codePackageLambda',
        description:   'Package a function to be deployed with Lambda'
      });

      return BbPromise.resolve();
    }

    /**
     * Code Package Lambda
     */

    codePackageLambda(evt) {
      let packager = new Packager();
      return packager.package(evt);
    }
  }

  /**
   * Packager
   * - Necessary for this action to run concurrently
   */

  class Packager {

    package(evt) {

      let _this     = this;
      _this.evt     = evt;

      // Flow
      return _this._validateAndPrepare()
        .bind(_this)
        .then(_this._package)
        .then(function() {

          /**
           * Return EVT
           */

          return _this.evt;

        });
    }

    /**
     * Validate And Prepare
     */

    _validateAndPrepare() {

      let _this = this;

      // Instantiate classes
      _this.function = S.getProject().getFunction( _this.evt.options.name );

      if (!_this.function) BbPromise.reject(new SError(`Function could not be found: ${_this.evt.options.name}`));

      //TODO: Use Function.validate()?

      // Validate
      if (!_this.function.name) {
        throw new SError('Function does not have a name property');
      }
      if (!_this.function.handler) {
        throw new SError('Function does not have a handler property');
      }
      if (!_this.function.timeout) {
        throw new SError('Function does not have a timeout property');
      }
      if (!_this.function.memorySize) {
        throw new SError('Function does not have a memorySize property');
      }
      if (!_this.function.getRuntime().getName()) {
        throw new SError('Function does not have a runtime property');
      }
      return BbPromise.resolve();
    }

    /**
     * Package
     * - Build lambda package
     */

    _package() {
      return this.function.getRuntime().build(this.function, this.evt.options.stage, this.evt.options.region)
        .then(pathDist => this.evt.data.pathDist = pathDist);
    }
  }

  return( CodePackageLambda );
};