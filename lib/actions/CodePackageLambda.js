'use strict';

/**
 * Action: Code Package: Lambda
 * - Accepts one function
 * - Collects the function's Lambda code in a distribution folder
 * - Don't attach "options" to context, it will be overwritten in concurrent operations
 * - WARNING: This Action runs concurrently
 */

module.exports = function(SPlugin, serverlessPath) {

  const path     = require('path'),
    SError       = require(path.join(serverlessPath, 'Error')),
    BbPromise    = require('bluebird');
  let SUtils;


  class CodePackageLambda extends SPlugin {

    constructor(S, config) {
      super(S, config);
      SUtils = S.utils;
    }

    static getName() {
      return 'serverless.core.' + CodePackageLambda.name;
    }

    registerActions() {

      this.S.addAction(this.codePackageLambda.bind(this), {
        handler:       'codePackageLambda',
        description:   'Package a function to be deployed with Lambda'
      });

      return BbPromise.resolve();
    }

    /**
     * Code Package Lambda
     */

    codePackageLambda(evt) {
      let packager = new Packager(this.S);
      return packager.package(evt);
    }
  }

  /**
   * Packager
   * - Necessary for this action to run concurrently
   */

  class Packager {

    constructor(S) {
      this.S = S;
    }

    package(evt) {

      let _this     = this;
      _this.evt     = evt;

      // Flow
      return _this._validateAndPrepare()
        .bind(_this)
        .then(_this._createDistFolder)
        .then(_this._package)
        .then(function() {

          /**
           * Return EVT
           */

          _this.evt.data.pathsPackaged = _this.pathsPackaged;
          _this.evt.data.pathDist      = _this.pathDist;
          return _this.evt;

        });
    }

    /**
     * Validate And Prepare
     */

    _validateAndPrepare() {

      let _this = this;

      // Instantiate classes
      _this.function = _this.S.getProject().getFunction( _this.evt.options.name );

      if (!_this.function) BbPromise.reject(new SError(`Function could not be found: ${_this.evt.options.name}`));

      //TODO: Use Function.validate()

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
     * Create Distribution Folder
     */

    _createDistFolder() {

      let _this = this;

      // Set Dist Dir
      let d          = new Date();
      _this.pathDist = _this.S.getProject().getRootPath('_meta', '_tmp', _this.function.name + '@' + d.getTime());

      return BbPromise.resolve();
    }

    /**
     * Package
     */

    _package() {

      // Create pathsPackaged for each file ready to compress
      return this.function.getRuntime()
        .build(this.function, this.pathDist, this.evt.options.stage, this.evt.options.region)
        .then(paths => this.pathsPackaged = paths);
    }

  }

  return( CodePackageLambda );
};
