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
 * - paths:             (Array)   Array of function paths to deploy.  Format module.function: ['users/show', 'users/create']
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

      let _this     = this;
      _this.options = options || {};

      // If CLI, parse arguments
      if (_this.S.cli && (!options || !options.subaction)) {
        _this.options       = JSON.parse(JSON.stringify(_this.S.cli.options)); // Important: Clone objects, don't refer to them
        _this.options.paths = JSON.parse(JSON.stringify(_this.S.cli.params));
        if (_this.S.cli.options.nonInteractive) _this.S.config.interactive = false;
      }

      // Flow
      return new BbPromise(function(resolve) {

        // Prompt: Stage
        if (!_this.S.config.interactive || _this.options.stage) return resolve();

        return _this.cliPromptSelectStage('Function Deployer - Choose a stage: ', _this.options.stage, false)
          .then(stage => {
            _this.options.stage = stage;
            return resolve();
          })
      })
        .bind(_this)
        .then(_this._validateAndPrepare)
        .then(_this._processDeployment)
        .then(function() {

          // Display Failed Function Deployments
          if (_this.failed) {
            SCli.log('Failed to deploy the following functions in "'
              + _this.options.stage
              + '" to the following regions:');
            // Display Errors
            for (let i = 0; i < Object.keys(_this.failed).length; i++) {
              let region = _this.failed[Object.keys(_this.failed)[i]];
              SCli.log(Object.keys(_this.failed)[i] + ' ------------------------');
              for (let j = 0; j < region.length; j++) {
                SCli.log('  ' + region[j].module + '/' + region[j].function + ': ' + region[j].message );
                SUtils.sDebug(region[j].stack);
              }
            }
          }

          // Display Successful Function Deployments
          if (_this.deployed) {

            // Status
            SCli.log('Successfully deployed functions in "'
              + _this.options.stage
              + '" to the following regions: ');

            // Display Functions & ARNs
            for (let i = 0; i < Object.keys(_this.deployed).length; i++) {
              let region = _this.deployed[Object.keys(_this.deployed)[i]];
              SCli.log(Object.keys(_this.deployed)[i] + ' ------------------------');
              for (let j = 0; j < region.length; j++) {
                SCli.log('  ' + region[j].module + '/' + region[j].function + ': ' + region[j].ARN );
              }
            }
          }

          /**
           * Return Action Data
           * - WARNING: Adjusting these will break Plugins
           */

          return {
            options: _this.options,
            data: {
              deployed: _this.deployed,
              failed:   _this.failed
            }
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
      _this.options.stage           = _this.options.stage ? _this.options.stage : null;
      _this.options.paths           = _this.options.paths ? _this.options.paths : [];
      _this.options.all             = _this.options.all ? true : false;
      _this.options.aliasFunction   = _this.options.aliasFunction ? _this.options.aliasFunction : null;

      // Instantiate Classes
      _this.project    = new _this.S.classes.Project(_this.S);
      _this.meta       = new _this.S.classes.Meta(_this.S);

      // Set Deploy Regions
      _this.regions    = _this.options.region ? [_this.options.region] : Object.keys(_this.meta.data.private.stages[_this.options.stage].regions);

      // Validate Paths
      if (!_this.options.paths.length && !_this.options.all) {
        throw new SError(`One or multiple paths are required, or the all option must be set`);
      }

      // Validate Stage
      if (!_this.options.stage) {
        throw new SError(`Stage is required`);
      }

      return BbPromise.resolve();
    }

    /**
     * Process Deployment
     */

    _processDeployment() {

      let _this = this;

      // Status
      SCli.log('Deploying functions in "'
        + _this.options.stage
        + '" to the following regions: '
        + _this.regions.join(', '));
      SCli.log('------------------------');

      _this._spinner = SCli.spinner();
      _this._spinner.start();

      return BbPromise.try(function() {
          return _this.regions;
        })
        .bind(_this)
        .each(function(region) {

          // Prepare functions
          // TODO: REFACTOR GETFUNCTIONS TO USE OPTIONS OBJ
          _this.functions = _this.project.getFunctions(_this.options.all ? null : _this.options.paths);

          // Deploy Function Code in each region
          return _this._deployCodeByRegion(region);
        })
        .then(function() {

          // Stop Spinner
          _this._spinner.stop(true);
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

        async.eachLimit(_this.functions, 5, function(func, cb) {

          return BbPromise.try(function() {

            // Nodejs
            if (func.data.runtime = 'nodejs') {

              // Package Code
              return _this.S.actions.codePackageLambdaNodejs({
                  stage:    _this.options.stage,
                  region:   region,
                  module:   func.module,
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
                  });
                });
            }

          })
            .then(function(result) {

              // Add Function and Region
              if (!_this.deployed)         _this.deployed = {};
              if (!_this.deployed[region]) _this.deployed[region] = [];
              _this.deployed[region].push({
                module:   func.module,
                function: func.data.name,
                ARN:      result.lambdaAliasArn
              });

              return cb();

            })
            .catch(function(e) {

              // Stash Failed Function Code
              if (!_this.failed)         _this.failed = {};
              if (!_this.failed[region]) _this.failed[region] = [];
              _this.failed[region].push({
                module:   func.module,
                function: func.data.name,
                message:  e.message,
                stack:    e.stack
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