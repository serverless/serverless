'use strict';

/**
 * Action: Function Deploy
 * - Collects, validates, prepares user data
 * - Controls multi-region deployment sequentially
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

    return BbPromise.resolve();
  }

  /**
   * Function Deploy
   */

  functionDeploy(evt) {

    let _this                       = this;
    _this.evt                       = {};
    _this.evt.queued                = {};
    _this.evt.uploaded              = {};
    _this.evt.provisioned           = {};
    _this.evt.queued.type           = evt.type ? evt.type : null;
    _this.evt.queued.stage          = evt.stage ? evt.stage : null;
    _this.evt.queued.regions        = evt.region ? [evt.region] : [];
    _this.evt.queued.noExeCf        = (evt.noExeCf == true || evt.noExeCf == 'true');
    _this.evt.queued.paths          = evt.paths ? evt.paths : [];
    _this.evt.queued.functions      = [];
    _this.evt.provisioned.functions = [];

    // Flow
    return BbPromise.try(function() {})
        .bind(_this)
        .then(_this._validateAndPrepare)
        .then(_this._promptStage)
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

      // Add type.  Should be first in array
      _this.evt.queued.type = _this.Jaws.cli.params[0];

      // Add function paths.   Should be all other array items
      _this.Jaws.cli.params.splice(0,1);
      _this.evt.queued.paths  = _this.Jaws.cli.params;
    }

    // Validate type
    if (!_this.evt.queued.type ||
        (_this.evt.queued.type !== 'code' &&
        _this.evt.queued.type  !== 'endpoint' &&
        _this.evt.queued.type  !== 'all')
    ) {
      throw new JawsError(`Invalid type.  Must be "code", "endpoint", or "all" `);
    }

    // Validate stage
    if (!this.evt.queued.stage) {
      throw new JawsError(`Stage is required`);
    }

    // If no region specified, deploy to all regions in stage
    if (!_this.evt.queued.regions.length) {
      _this.evt.queued.regions  = _this.Jaws._projectJson.stages[_this.evt.queued.stage].map(rCfg => {
        return rCfg.region;
      });
    }

    JawsUtils.jawsDebug('Queued regions: ' + _this.evt.queued.regions);

    // If no functions, check cwd and resolve that path
    return JawsUtils.getFunctions(
        _this.Jaws._projectRootPath,
        _this.evt.queued.paths && _this.evt.queued.paths.length ? _this.evt.queued.paths : null
        )
        .bind(_this)
        .then(function(functions) {

          // If no functions, throw error
          if (!functions || !functions.length) {
            throw new JawsError(`No function found.  Make sure your current working directory is a function.`);
          }

          // Set queued functions
          _this.evt.queued.functions = functions;
        })
        .then(function() {

          if (_this.evt.queued.type === 'code') return;

          // If type is "endpoint" or "all", collect endpoints
          return JawsUtils.getEndpoints(_this.evt.queued.functions);
        });
  }

  /**
   * Prompt Stage
   */

  _promptStage() {

    let _this  = this,
        stages = [];

    if (!_this.evt.queued.stage) {

      stages = Object.keys(_this.Jaws._projectJson.stage);

      // If project only has 1 stage, skip prompt
      if (stages.length === 1) _this.evt.queued.stage = stages[0];

    } else {

      // If user provided stage, skip prompt
      return BbPromise.resolve();
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
          _this.evt.queued.stage = results[0].value;
        });
  }

  /**
   * Deploy Regions
   */

  _deployRegions() {

    let _this = this;

    return BbPromise.try(function() {
          return _this.evt.queued.regions;
        })
        .each(function(region) {

          // Deploy Type
          switch(_this.evt.queued.type) {

            // Deploy Endpoint only
            case "endpoint":

              // TODO: Move to re-usable function ("all" needs this too)
              // TODO: Create current, add function, add endpoints (even mutliple), process w/ error handling for API Gateway issues
              return _this.Jaws.actions.endpointPackageApiGateway(evtClone)
                  .bind(_this)
                  .then(_this.Jaws.actions.endpointProvisionApiGateway);

            // Deploy Code only (lambda)
            case "code":

              // TODO: Move to re-usable function ("all" needs this too)

              // Package Lambdas
              return new BbPromise(function(resolve, reject) {

                // Create uploaded array for this region
                _this.evt.uploaded[region] = [];

                // Package & Upload functions' code concurrently
                // Package must be redone for each region because ENV vars are set for each region
                async.eachLimit(_this.evt.queued.functions, 5, function(func, cb) {

                  // Create new evt object for concurrent operations
                  let newEvent = {
                    stage: _this.evt.queued.stage,
                    region: JawsUtils.getProjRegionConfigForStage(
                        _this.Jaws._projectJson,
                        _this.evt.queued.stage,
                        region),
                    function: func,
                  };

                  // Process sub-Actions
                  return _this.Jaws.actions.codePackageLambdaNodejs(newEvent)
                      .then(_this.Jaws.actions.codeUploadLambdaNodejs)
                      .then(function(evt) {

                        // Add Function and Region
                        _this.evt.uploaded[region].push(evt.function);
                        return cb();
                      });

                }, resolve);
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
        .then(function() {

          // If type is "endpoint", skip
          if (_this.evt.queued.type === 'endpoint') return _this.evt;

          // If type is "code" or "all", do concurrent, multi-region, CF update
          async.eachLimit(Object.keys(_this.evt.uploaded), 10, function(region, cb) {

            return _this.Jaws.actions.codeProvisionLambdaNodejs(_this.evt)
                .then(function() {
                  return cb();
                });

          }, function() {

          });
        });
  }
}

module.exports = FunctionDeploy;