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

const SPlugin    = require('../ServerlessPlugin'),
    SError       = require('../ServerlessError'),
    SUtils       = require('../utils/index'),
    SCli         = require('../utils/cli'),
    BbPromise    = require('bluebird'),
    async        = require('async'),
    path         = require('path'),
    fs           = require('fs'),
    os           = require('os');

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

    // If CLI, parse options
    if (_this.S.cli) {

      // Options
      evt = this.S.cli.options;

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

    // Flow
    return _this._validateAndPrepare(evt)
        .bind(_this)
        .then(_this._promptStage)
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

    // If NO-CLI, validate paths
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

    // Get Functions From Paths

    if (_this.S.cli) {

      // If CLI & paths, get functions
      // If CLI & no paths, get full paths from CWD

      return SUtils.getFunctions(
          evt.all ? _this.S._projectRootPath : process.cwd(),
          evt.paths && evt.paths.length ? evt.paths : null)
          .then(function(functions) {
            if (!functions.length) throw new SError(`No functions found`);
            evt.functions = functions;
            // Delete Paths
            if (evt.paths) delete evt.paths;
            return evt;
          });

    } else {

      // If NO-CLI, resolve full paths from submitted paths
      return SUtils.getFunctions(
          _this.S._projectRootPath,
          evt.all ? null : evt.paths)
          .then(function(functions) {
            evt.functions = functions;
            // Delete Paths
            if (evt.paths) delete evt.paths;
            return evt;
          });

    }
  }

  /**
   * Prompt Stage
   */

  _promptStage(evt) {

    let _this  = this;

    // If user provided stage, skip prompt
    if (evt.stage) return BbPromise.resolve(evt);

    // Collect project stages
    let stages = Object.keys(_this.S._projectJson.stages);

    // If project only has 1 stage, skip prompt
    if (stages.length === 1) {
      evt.stage = stages[0];
      return BbPromise.resolve(evt);
    }

    // Create Choices
    let choices = [];
    for (let i = 0; i < stages.length; i++) {
      choices.push({
        key:   '',
        value: stages[i],
        label: stages[i],
      });
    }

    // Show prompt
    return _this.cliSelectInput('Function Deployer - Choose a stage: ', choices, false)
        .then(results => {
          evt.stage = results[0].value;
          return evt;
        });
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

    // Delete region for neatness
    if (evt.region) delete evt.region;

    return evt;
  }

  /**
   * Process Deployment
   */

  _processDeployment(evt) {

    let _this = this;

    // Status
    SCli.log('Deploying functions in "' + evt.stage + '" to the following regions: ' + evt.regions);

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
                function: func.path,
              });

              return cb();
            })

      }, function() {
        return resolve(evt, region);
      });
    });
  }
}

module.exports = FunctionDeploy;
