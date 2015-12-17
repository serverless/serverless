'use strict';

/**
 * Action: Function Deploy
 * - Deploys Function Code
 * - Validates Function paths
 * - Loops sequentially through each Region in specified Stage
 * - Passes Function paths to Sub-Actions for deployment
 * - Handles concurrent processing of Sub-Actions for faster deploys
 *
 * Event Properties:
 * - stage:             (String)  The stage to deploy to
 * - regions:           (Array)   The region(s) in the stage to deploy to
 * - paths:             (Array)   Array of function paths to deploy.  Format: 'users/show', 'users/create'
 * - aliasFunction:     (String)  Custom Lambda alias.
 * - all:               (Boolean) Indicates whether all Functions in the project should be deployed.
 * - functions:         (Array)   Array of function JSONs from fun.sl.json
 * - deployed: (Object)  Contains regions and the code functions that have been uploaded to the S3 bucket in that region
 */

module.exports = function(SPlugin, serverlessPath) {
  const path       = require('path'),
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
            shortcut:    'af',
            description: 'Optional - Provide a custom Alias to your Functions'
          }, {
            option:      'all',
            shortcut:    'a',
            description: 'Optional - Select all Functions in your project for deployment'
          }
        ],
      });

      return BbPromise.resolve();
    }

    /**
     * Function Deploy
     */

    functionDeploy(event) {

      let _this = this,
          evt   = {};

      // If CLI - parse options
      if (_this.S.cli) {

        // Options
        evt = JSON.parse(JSON.stringify(this.S.cli.options)); // Important: Clone objects, don't refer to them

        // Option - Non-interactive
        if (_this.S.cli.options.nonInteractive) _this.S._interactive = false

        // Function paths - They should all be params
        evt.paths  = _this.S.cli.params;
      }

      // If NO-CLI, add options
      if (event) evt = event;

      // Add defaults
      evt.stage               = evt.stage ? evt.stage : null;
      evt.regions             = evt.region ? [evt.region] : [];
      evt.paths               = evt.paths ? evt.paths : [];
      evt.all                 = evt.all ? true : false;
      evt.aliasFunction       = evt.aliasFunction ? evt.aliasFunction : null;
      evt.functions           = [];
      evt.deployed            = {};

      // Delete region for neatness
      if (evt.region) delete evt.region;

      // Flow
      return _this._validateAndPrepare(evt)
          .bind(_this)
          .then(_this._prepareFunctions)
          .then(function(evt) {
            return _this.cliPromptSelectStage('Function Deployer - Choose a stage: ', evt.stage, false)
              .then(stage => {
                evt.stage = stage;
                return evt;
              })
          })
          .then(_this._prepareRegions)
          .then(_this._processDeployment)
          .then(function(evt) {
            return evt;
          });
    }

    /**
     * Validate And Prepare
     * - If CLI, maps CLI input to event object
     */

    _validateAndPrepare(evt) {

      let _this = this;

      if (!_this.S.cli) {

        // Validate Paths
        if (!evt.paths.length && !evt.all) {
          throw new SError(`One or multiple paths are required`);
        }

        // Validate Stage
        if (!evt.stage) {
          throw new SError(`Stage is required`);
        }
      }

      return BbPromise.resolve(evt);
    }

    /**
     * Prepare Functions
     */

    _prepareFunctions(evt) {

      let _this = this;

      // If NO-CLI - Get Functions from submitted paths
      if (!_this.S.cli) {

        return SUtils.getFunctions(
            _this.S._projectRootPath,
            evt.all ? null : evt.paths)
            .then(function (functions) {

              evt.functions = functions;
              // Delete Paths
              if (evt.paths) delete evt.paths;
              return evt;
            });
      }

      // IF CLI + ALL/paths, get functions
      if (_this.S.cli && (evt.all || evt.paths.length)) {

        return SUtils.getFunctions(
            _this.S._projectRootPath,
            evt.all ? null : evt.paths)
            .then(function (functions) {

              if (!functions.length) throw new SError(`No functions found`);
              evt.functions = functions;
              // Delete Paths
              if (evt.paths) delete evt.paths;
              return evt;
            });
      }

      // IF CLI +  no ALL + no paths - prompt user to select functions
      if (_this.S.cli && !evt.all && !evt.paths.length) {

        return _this.cliPromptSelectFunctions(
            process.cwd(),
            'Select the functions you wish to deploy:',
            true,
            true)
            .then(function (selected) {
              evt.functions = selected;
              return evt;
            });
      }
    }


    /**
     * Prepare Regions
     */

    _prepareRegions(evt) {

      // If no region specified, deploy to all regions in stage
      if (!evt.regions.length) {
        evt.regions  = this.S._projectJson.stages[evt.stage].map(rCfg => {
          return rCfg.region;
        });
      }

      return evt;
    }

    /**
     * Process Deployment
     */

    _processDeployment(evt) {

      let _this = this;

      // Status
      SCli.log('Deploying functions in "' + evt.stage + '" to the following regions: ' + evt.regions);
      _this._spinner = SCli.spinner();
      _this._spinner.start();

      return BbPromise.try(function() {
            return evt.regions;
          })
          .bind(_this)
          .each(function(region) {

            // Add Deployed Region
            evt.deployed[region] = [];

            // Deploy Function Code in each region
            return _this._deployCodeByRegion(evt, region);
          })
          .then(function() {

            // Status
            _this._spinner.stop(true);
            SCli.log('Successfully deployed functions in "' + evt.stage + '" to the following regions: ' + evt.regions);
            return evt;
          });
    }

    /**
     * Deploy Code By Region
     */

    _deployCodeByRegion(evt, region) {

      let _this = this;

      return new BbPromise(function(resolve, reject) {

        /**
         *  Package, Upload, Deploy, Alias functions' code concurrently
         *  - Package must be redone for each region because ENV vars and IAM Roles are set for each region
         */

        async.eachLimit(evt.functions, 5, function(func, cb) {

          // Create new evt object for concurrent operations
          let evtClone = {
            stage: evt.stage,
            region: SUtils.getRegionConfig(
                _this.S._projectJson,
                evt.stage,
                region),
            function: func,
          };

          // Process sub-Actions
          return _this.S.actions.codePackageLambdaNodejs(evtClone)
              .bind(_this)
              .then(_this.S.actions.codeDeployLambdaNodejs)
              //.then(_this.S.actions.createEventSourceLambdaNodejs)
              .then(function(evtCloneProcessed) {

                // Add Function and Region
                evt.deployed[region].push(evtCloneProcessed.function);
                return cb();
              })
              .catch(function(e) {

                // Stash Failed Function Code
                if (!evt.failed) evt.failed = {};
                if (!evt.failed[region]) evt.failed[region] = [];
                evt.failed[region].push({
                  message:  e.message,
                  stack:    e.stack,
                  function: func.pathFunction + '-' + func.name,
                });

                return cb();
              })

        }, function() {
          return resolve(evt, region);
        });
      });
    }
  }

  return( FunctionDeploy );
};
