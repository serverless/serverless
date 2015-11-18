'use strict';

/**
 * Action: Function Deploy
 * - Collects, validates, prepares user data
 * - Controls multi-region deployment sequentially
 */

const JawsPlugin = require('../../JawsPlugin'),
    JawsError    = require('../../jaws-error'),
    JawsUtils    = require('../../utils/index'),
    extend       = require('util')._extend,
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
      contextAction: 'deploy',
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

  /**
   * Prompt Stage
   */

  _promptStage() {

    let _this  = this,
        stages = [];

    if (!_this.evt.stage) {

      stages = Object.keys(_this.Jaws._projectJson.stages);

      // If project only has 1 stage, skip prompt
      if (stages.length === 1) _this.evt.stage = stages[0];

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

    return _this.selectInput('Function Deployer - Choose a stage: ', choices, false)
        .then(results => {
          _this.evt.stage = results[0].value;
        });
  }

  /**
   * Prepare Regions
   */

  _prepareRegions() {

    if (this.evt.regions.length) { // User specified specific region to deploy to
      return BbPromise.resolve();
    } else {

      // Deploy to all regions in stage
      let stage         = this.evt.stage,
          projJson      = this.Jaws._projectJson,
          regionConfigs = projJson.stages[stage];

      this.evt.regions  = regionConfigs.map(rCfg => {
        return rCfg.region;
      });
    }

    JawsUtils.jawsDebug('Setting deploy to regions:');
    JawsUtils.jawsDebug(this.evt.regions);
    return BbPromise.resolve();
  }

  /**
   * Deploy Regions
   */

  _deployRegions() {

    let _this = this;

    return BbPromise.try(function() {
          return _this.evt.regions;
        })
        .each(function(region) {

          // Deploy Type
          switch(_this.evt.type) {

            // Deploy Endpoint only
            case "endpoint":

              return _this.Jaws.actions.endpointPackageApiGateway(evtClone)
                  .bind(_this)
                  .then(_this.Jaws.actions.endpointProvisionApiGateway);

            // Deploy Code only (lambda)
            case "code":

                return new BbPromise(function(resolve, reject) {

                  // Deploy Functions code concurrently
                  async.eachLimit(_this.evt.functions, 5, function(func, cb) {

                    // Clone evt object for concurrent operations
                    let evtClone = extend({}, _this.evt);

                    // Add Region JSON for the deploy region
                    evtClone.currentRegion = JawsUtils.getProjRegionConfigForStage(
                        _this.Jaws._projectJson,
                        _this.evt.stage,
                        region
                    );

                    // Add Function to event clone
                    evtClone.currentFunction = func;

                    // Process sub-actions
                    return _this.Jaws.actions.codePackageLambdaNodejs(evtClone)
                        .bind(_this)
                        .then(function(evt) {
                          console.log('HERE: ', evt)
                          return cb();
                        })
                        .catch(function(e) {
                          return reject(new JawsError(func + ' - ' + e.message));
                        });

                  }, function() {
                    return resolve(_this.evt);
                  });
                });

              break;

            // Deploy Code then Endpoint
            case "all":
              break;

            // Default
            default:
              return BbPromise.resolve();
          }
        });
  }
}

module.exports = FunctionDeploy;