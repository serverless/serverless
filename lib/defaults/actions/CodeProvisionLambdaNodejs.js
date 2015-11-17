'use strict';

/**
 * Action: Code Provision: Lambda: Nodejs
 * - Collects and optimizes Lambda code in a temp folder
 */

const JawsPlugin = require('../../JawsPlugin'),
    JawsError    = require('../../jaws-error'),
    JawsUtils    = require('../../utils/index'),
    extend       = require('util')._extend,
    BbPromise    = require('bluebird'),
    path         = require('path'),
    fs           = require('fs'),
    os           = require('os');

// Promisify fs module
BbPromise.promisifyAll(fs);

class CodeProvisionLambdaNodejs extends JawsPlugin {

  /**
   * Constructor
   */

  constructor(Jaws, config) {
    super(Jaws, config);
  }

  /**
   * Get Name
   */

  static getName() {
    return 'jaws.core.' + CodeProvisionLambdaNodejs.name;
  }

  /**
   * Register Plugin Actions
   */

  registerActions() {

    this.Jaws.addAction(this.CodeProvisionLambdaNodejs.bind(this), {
      handler:       'codeProvisionLambdaNodejs',
      description:   'Deploys the code or endpoint of a function, or both'
    });

    return BbPromise.resolve();
  }

  /**
   * Function Deploy
   */

  codeProvisionLambdaNodejs(evt) {

    let _this = this;
    _this.evt = evt;

    // Flow
    return BbPromise.try(function() {})
        .bind(_this)
        .then(_this._validateAndPrepare)
        .then(_this._promptStage)
        .then(_this._prepareRegions)
        .then(_this._deployRegions);
  }

  /**
   * Validate And Prepare
   * - If CLI, maps CLI input to event object
   */

  _validateAndPrepare() {

    let _this = this;

    // If cli, process command line input
    if (_this.Jaws.cli) {

      // Add options to evt
      _this.evt = _this.Jaws.cli.options;

      // Add type.  Should be first in array
      _this.evt.type = _this.Jaws.cli.params[0];

      // Add function paths.  Should be all other array items
      _this.Jaws.cli.params.splice(0,1);
      _this.evt.functions  = _this.Jaws.cli.params;
    }

    // Validate type
    if (!_this.evt.type ||
        (_this.evt.type !== 'code' &&
        _this.evt.type  !== 'endpoint' &&
        _this.evt.type  !== 'all')
    ) {
      throw new JawsError(`Invalid type.  Must be "code", "endpoint", or "all" `);
    }

    // Validate stage
    if (!this.evt.stage) throw new JawsError(`Stage is required`);

    // If region specified, add it to regions array for deployment
    if (this.evt.region) {
      this.evt.regions = [this.evt.region];
      delete this.evt.region; // Remove original "region" property for cleanliness
    }

    // Process noExeCf
    this.evt.noExeCf = (this.evt.noExeCf == true || this.evt.noExeCf == 'true');

    // Get full function paths relative to project root
    if (!_this.evt.functions.length) {

      // If no functions, check cwd and resolve that path
      return JawsUtils.getFunctions(
          _this.Jaws._projectRootPath,
          _this.evt.type
          )
          .then(function(functions) {
            // If no functions, throw error
            if (!_this.evt.functions.length) {
              throw new JawsError(`No function found.  Make sure your current working directory is a function.`);
            }

            _this.evt.functions = functions;
          });

    } else {

      // If functions, resolve their paths
      return JawsUtils.getFunctions(
          _this.Jaws._projectRootPath,
          _this.evt.type,
          _this.evt.functions
          )
          .then(function(functions) {
            _this.evt.functions = functions;
          });
    }
  }
}

module.exports = CodeProvisionLambdaNodejs;