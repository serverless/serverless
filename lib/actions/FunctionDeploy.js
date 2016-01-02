'use strict';

/**
 * Action: Function Deploy
 * - Deploys Function Code
 * - Validates Function paths
 * - Loops sequentially through each Region in specified Stage
 * - Passes Function paths to Sub-Actions for deployment
 * - Handles concurrent processing of Sub-Actions for faster deploys
 *
 * Options:
 * - stage:             (String)  The stage to deploy to
 * - region:            (String)  The region in the stage to deploy to
 * - path:              (String)  A function path to deploy.  Format module.function: 'users/show', 'users/create'
 * - aliasFunction:     (String)  Custom Lambda alias.
 * - all:               (Boolean) Indicates whether all Functions in the project should be deployed.
 */

module.exports = function(SPlugin, serverlessPath) {

  const path     = require('path'),
    SError       = require(path.join(serverlessPath, 'ServerlessError')),
    SUtils       = require(path.join(serverlessPath, 'utils/index')),
    SCli         = require(path.join(serverlessPath, 'utils/cli')),
    BbPromise    = require('bluebird'),
    async        = require('async'),
    fs           = require('fs');

  // Promisify fs module
  BbPromise.promisifyAll(fs);

  class FunctionDeploy extends SPlugin {

    /**
     * Constructor
     */

    constructor(S, config) {
      super(S, config);
    }

    /**
     * Get Name
     */

    static getName() {
      return 'serverless.core.' + FunctionDeploy.name;
    }

    /**
     * Register Plugin Actions
     */

    registerActions() {

      this.S.addAction(this.functionDeploy.bind(this), {
        handler:       'functionDeploy',
        description:   'Deploys the code or endpoint of a function, or both',
        context:       'function',
        contextAction: 'deploy',
        options:       [
          {
            option:      'stage',
            shortcut:    's',
            description: 'Optional if only one stage is defined in project'
          }, {
            option:      'region',
            shortcut:    'r',
            description: 'Optional - Target one region to deploy to'
          }, {
            option:      'aliasFunction', // TODO: Implement
            shortcut:    'f',
            description: 'Optional - Provide a custom Alias to your Functions'
          }, {
            option:      'all',
            shortcut:    'a',
            description: 'Optional - Select all Functions in your project for deployment'
          }
        ]
      });

      return BbPromise.resolve();
    }

    /**
     * Function Deploy
     */

    functionDeploy(options) {

      let _this    = this;
      this.options = options || {};

      // If CLI, parse arguments
      if (this.S.cli && (!options || !options.subaction)) {
        this.options       = JSON.parse(JSON.stringify(this.S.cli.options)); // Important: Clone objects, don't refer to them
        this.options.paths = JSON.parse(JSON.stringify(this.S.cli.params));
        if (this.S.cli.options.nonInteractive) this.S.config.interactive = false;
      }

      // Flow
      return _this._validateAndPrepare()
        .bind(_this)
        .then(function() {
          return _this.cliPromptSelectStage('Function Deployer - Choose a stage: ', this.options.stage, false)
            .then(stage => {
              this.options.stage = stage;
            })
        })
        .then(_this._processDeployment)
        .then(function() {

          /**
           * Return Action Data
           * - WARNING: Adjusting these will break Plugins
           */

          return {
            options: _this.options
          }

        });
    }

    /**
     * Validate And Prepare
     * - If CLI, maps CLI input to event object
     */

    _validateAndPrepare() {

      let _this = this;

      // Set Defaults
      this.options.stage               = this.options.stage ? this.options.stage : null;
      this.options.paths               = this.options.paths ? this.options.paths : [];
      this.options.all                 = this.options.all ? true : false;
      this.options.aliasFunction       = this.options.aliasFunction ? this.options.aliasFunction : null;

      // Set Deploy Regions
      this.regions    = this.options.region ? [this.options.region] : [];
      this.deployed   = {};

      // Instantiate Classes
      this.project    = new this.S.classes.Project(this.S);
      this.meta       = new this.S.classes.Meta(this.S);

      // Non-CLI Validations
      if (!_this.S.cli) {

        // Validate Paths
        if (!_this.options.paths.length && !_this.options.all) {
          throw new SError(`One or multiple paths are required`);
        }

        // Validate Stage
        if (!_this.options.stage) {
          throw new SError(`Stage is required`);
        }
      }

      // Prepare functions
      _this.functions = _this.project.getFunctions(_this.options.all ? _this.options.paths : null);

      return BbPromise.resolve();
    }

    /**
     * Process Deployment
     */

    _processDeployment() {

      let _this = this;

      // Status
      SCli.log('Deploying functions in "' + _this.options.stage + '" to the following regions: ' + _this.regions.join(', '));
      _this._spinner = SCli.spinner();
      _this._spinner.start();

      return BbPromise.try(function() {
          return this.regions;
        })
        .bind(_this)
        .each(function(region) {

          // Add Deployed Region
          this.deployed[region] = [];

          // Deploy Function Code in each region
          return _this._deployCodeByRegion(region);
        })
        .then(function() {

          // Status
          _this._spinner.stop(true);

          if (this.failed) {

            // Status
            SCli.log('Failed to deploy the following functions in "' + this.options.stage + '" to the following regions:');

            // Display Methods & URLS
            for (let i = 0; i < Object.keys(this.failed).length; i++) {
              let region = this.failed[Object.keys(this.failed)[i]];
              SCli.log(Object.keys(this.failed)[i] + ' ------------------------');
              for (let j = 0; j < region.length; j++) {
                SCli.log('  ' + region[j].function + ': ' + region[j].message );
                SUtils.sDebug(region[j].stack);
              }
            }
          } else {
            SCli.log('Successfully deployed functions in "' + this.options.stage + '" to the following regions: ' + this.options.regions);
          }
        });
    }

    /**
     * Deploy Code By Region
     */

    _deployCodeByRegion(region) {

      let _this = this;

      return new BbPromise(function(resolve) {

        /**
         *  Package, Upload, Deploy, Alias functions' code concurrently
         *  - Package must be redone for each region because ENV vars and IAM Roles are set for each region
         */

        async.eachLimit(this.functions, 5, function(func, cb) {

          return new BbPromise(function(resolve) {

            // Nodejs
            if (func.module.data.runtime = 'nodejs') {

              // Package Code
              return _this.S.actions.codePackageLambdaNodejs({
                  stage:    _this.options.stage,
                  region:   _this.options.region,
                  module:   func.module.data.name,
                  function: func.data.name
                })
                .bind(_this)
                .then(function(result) {

                 // Deploy Code
                 return _this.S.actions.codeDeployLambdaNodejs({
                   stage:         result.options.stage,
                   region:        result.options.region,
                   module:        result.options.module,
                   function:      result.options.function,
                   pathDist:      result.pathDist,
                   pathsPackaged: result.pathsPackaged
                 })
                })
                .then(function(result) {
                  return resolve(result);
                });
            }
          })
            .then(function(result) {

              // Add Function and Region
              this.options.deployed[region].push(result.function);
              return cb();

            })
            .catch(function(e) {

              // Stash Failed Function Code
              if (!_this.failed) _this.failed = {};
              if (!_this.failed[region]) _this.failed[region] = [];
              _this.failed[region].push({
                message:  e.message,
                stack:    e.stack,
                function: func.pathFunction + '-' + func.name,
              });

              return cb();
            });

        }, function() {
          return resolve(region);
        });
      });
    }
  }

  return( FunctionDeploy );
};