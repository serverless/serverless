'use strict';

/**
 * Action: Function Deploy
 * - Deploys one or many functions across multiple regions, concurrently
 * - Deploys both Function Code and funciton Endpoints
 */

const JawsPlugin = require('../../JawsPlugin'),
    JawsError    = require('../../jaws-error'),
    JawsUtils    = require('../../utils/index'),
    BbPromise    = require('bluebird'),
    async        = require('async'),
    path         = require('path'),
    fs           = require('fs'),
    os           = require('os');

// Promisify fs module
BbPromise.promisifyAll(fs);

class FunctionDeploy extends JawsPlugin {

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
    return 'jaws.core.' + FunctionDeploy.name;
  }

  /**
   * Register Plugin Actions
   */

  registerActions() {

    this.Jaws.addAction(this.functionDeploy.bind(this), {
      handler:       'functionDeploy',
      description:   'Deploys the code or endpoint of a function, or both',
      context:       'function',
      contextAction: 'queued',
      options:       [
        {
          option:      'stage',
          shortcut:    's',
          description: 'Optional if only one stage is defined in project'
        }, {
          option:      'region',
          shortcut:    'r',
          description: 'Optional if only one region is defined in stage'
        }, {
          option:      'noExeCf',
          shortcut:    'c',
          description: 'Don\'t execute CloudFormation, just generate it',
        },
      ],
    });

    // TODO: Add "all" option

    return BbPromise.resolve();
  }

  /**
   * Function Deploy
   */

  functionDeploy(event) {

    let _this                 = this;
    let evt                   = {};
    evt.queued                = {};
    evt.queued.type           = event.type ? event.type : null;
    evt.queued.stage          = event.stage ? event.stage : null;
    evt.queued.regions        = event.region ? [event.region] : [];
    evt.queued.noExeCf        = (event.noExeCf == true || event.noExeCf == 'true');
    evt.queued.paths          = event.paths ? event.paths : [];
    evt.queued.functions      = [];
    evt.uploaded              = {};

    // Flow
    return _this._validateAndPrepare(evt)
        .bind(_this)
        .then(_this._promptStage)
        .then(_this._deployRegions)
        .then(function() {
          console.log("DONE: ", evt);
        });
  }

  /**
   * Validate And Prepare
   * - If CLI, maps CLI input to event object
   */

  _validateAndPrepare(evt) {

    let _this = this;

    // If cli, parse command line input
    if (_this.Jaws.cli) {

      // Add type.  Should be first in array
      evt.queued.type   = _this.Jaws.cli.params[0];

      // Add function paths.   Should be all other array items
      _this.Jaws.cli.params.splice(0,1);
      evt.queued.paths  = _this.Jaws.cli.params;
    }

    // Validate type
    if (!evt.queued.type ||
        (evt.queued.type !== 'code' &&
        evt.queued.type  !== 'endpoint' &&
        evt.queued.type  !== 'all')) {
      throw new JawsError(`Invalid type.  Must be "code", "endpoint", or "all" `);
    }

    // Validate stage
    if (!evt.queued.stage) {
      throw new JawsError(`Stage is required`);
    }

    // If no region specified, deploy to all regions in stage
    if (!evt.queued.regions.length) {
      evt.queued.regions  = _this.Jaws._projectJson.stages[evt.queued.stage].map(rCfg => {
        return rCfg.region;
      });
    }

    JawsUtils.jawsDebug('Queued regions: ' + evt.queued.regions);

    return BbPromise.try(function() {

      // If CLI and paths - process paths
      if (_this.Jaws.cli && evt.queued.paths && evt.queued.paths.length) {
        return JawsUtils.getFunctions(
            path.join(_this.Jaws._projectRootPath, 'back', 'slss_modules'),
            evt.queued.paths);
      }

      // If CLI and no paths - Find functions in current working directory
      if (_this.Jaws.cli && (!evt.queued.paths || !evt.queued.paths.length)) {
        return JawsUtils.getFunctions(process.cwd(), null);
      }

      // If No-CLI and paths
      if (!_this.Jaws.cli && evt.queued.paths && evt.queued.paths.length) {
        return JawsUtils.getFunctions(
            path.join(_this.Jaws._projectRootPath, 'back', 'slss_modules'),
            evt.queued.paths);
      }

      // If No-CLI and no paths - throw error
      if (!_this.Jaws.cli && (!evt.queued.paths || evt.queued.paths.length)) {
        throw new JawsError(`Function paths are required.`);
      }

    })
        .bind(_this)
        .then(function(functions) {

          // If no functions, throw error
          if (!functions || !functions.length) {
            throw new JawsError(`No function(s) found.`);
          }

          // Set queued functions
          evt.queued.functions = functions;
        })
        .then(function() {

          if (evt.queued.type === 'code') return evt;

          // If type is "endpoint" or "all", collect and add endpoints
          return JawsUtils.getEndpoints(evt.queued.functions)
              .then(function(endpoints) {
                evt.queued.endpoints = endpoints;
                return evt;
              });
        });
  }

  /**
   * Prompt Stage
   */

  _promptStage(evt) {

    let _this  = this,
        stages = [];

    if (!evt.queued.stage) {

      stages = Object.keys(_this.Jaws._projectJson.stage);

      // If project only has 1 stage, skip prompt
      if (stages.length === 1) evt.queued.stage = stages[0];

    } else {

      // If user provided stage, skip prompt
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
    return _this.selectInput('Function Deployer - Choose a stage: ', choices, false)
        .then(results => {
          evt.queued.stage = results[0].value;
          return evt;
        });
  }

  /**
   * Deploy Regions
   */

  _deployRegions(evt) {

    let _this = this;

    return BbPromise.try(function() {
          return evt.queued.regions;
        })
        .bind(_this)
        .each(function(region) {

          // Deploy Type
          switch(evt.queued.type) {

            // Deploy Endpoint only
            case "endpoint":
              return _this._deployEndpointByRegion(evt, region);
            break;
            // Deploy Code only
            case "code":
                return _this._processCodeByRegion(evt, region)
                    .then(function(evt) {
                      return _this._provisionCodeAllRegions(evt, region);
                    });
              break;
            // Deploy Code then Endpoint
            case "all":
              break;
            // Default
            default:
              return BbPromise.resolve();
          }
        })
  }

  /**
   * Deploy Code By Region
   * @region
   */

  _processCodeByRegion(evt, region) {

    let _this = this;

    return new BbPromise(function(resolve, reject) {

      // Create uploaded array for this region
      evt.uploaded[region] = [];

      // Package & Upload functions' code concurrently
      // Package must be redone for each region because ENV vars are set for each region
      async.eachLimit(evt.queued.functions, 5, function(func, cb) {

        // Create new evt object for concurrent operations
        let evtClone = {
          stage: evt.queued.stage,
          region: JawsUtils.getProjRegionConfigForStage(
              _this.Jaws._projectJson,
              evt.queued.stage,
              region),
          function: func,
        };

        // TODO: Read runtime of func
        // TODO: Deploy by runtime

        // Process sub-Actions
        return _this.Jaws.actions.codePackageLambdaNodejs(evtClone)
            .bind(_this)
            .then(_this.Jaws.actions.codeCompressLambdaNodejs)
            .then(_this.Jaws.actions.codeUploadLambdaNodejs)
            .then(function(evtCloneProcessed) {
              // Add Function and Region
              evt.uploaded[region].push(evtCloneProcessed.function);
              return cb();
            });

      }, function() {
        return resolve(evt, region);
      });
    });
  }

  /**
   * Provision Code All Regions
   * - Initiates CloudFormation Stack Create/Update in all Regions Concurrently
   */

  _provisionCodeAllRegions(evt, region) {

    let _this = this;

    return new BbPromise(function(resolve, reject) {

      // If type is "endpoint", skip
      if (evt.queued.type === 'endpoint') return resolve();

      // If type is "code" or "all", do concurrent, multi-region, CF update
      async.eachLimit(Object.keys(evt.uploaded), 5, function(region, cb) {

        let newEvent = {
          stage: evt.queued.stage,
          region: JawsUtils.getProjRegionConfigForStage(
              _this.Jaws._projectJson,
              evt.queued.stage,
              region),
          functions: evt.uploaded[region],
        };

        return _this.Jaws.actions.codeProvisionLambdaNodejs(newEvent)
            .then(cb);

      }, function() {
        return resolve(evt);
      });
    });
  }

  /**
   * Deploy Endpoint By Region
   */
  // TODO: MAKE EVT CLONE
  // TODO: Handle API Gateway Throttling Errors
  _deployEndpointByRegion(evt, region) {
    let _this = this;

    let newEvent = {
      stage: evt.queued.stage,
      region: JawsUtils.getProjRegionConfigForStage(
          _this.Jaws._projectJson,
          evt.queued.stage,
          region),
      functions: evt.uploaded[region],
    };

    return _this.Jaws.actions.endpointPackageApiGateway(evtClone)
        .bind(_this)
        .then(_this.Jaws.actions.endpointProvisionApiGateway);
  }
}

module.exports = FunctionDeploy;