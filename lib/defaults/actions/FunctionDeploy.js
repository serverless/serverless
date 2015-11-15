'use strict';

/**
 * Action: Function Deploy
 */

const JawsPlugin = require('../../JawsPlugin'),
    JawsError    = require('../../jaws-error'),
    JawsCLI      = require('../../utils/cli'),
    JawsUtils    = require('../../utils/index'),
    AWSUtils     = require('../../utils/aws'),
    extend       = require('util')._extend,
    BbPromise    = require('bluebird'),
    path         = require('path'),
    os           = require('os');

let fs = require('fs');
BbPromise.promisifyAll(fs);

class FunctionDeploy extends JawsPlugin {

  /**
   * Constructor
   * @param Jaws class object
   * @param config object
   */

  constructor(Jaws, config) {
    super(Jaws, config);
  }

  /**
   * Define your plugins name
   * @returns {string}
   */

  static getName() {
    return 'jaws.core.' + FunctionDeploy.name;
  }

  /**
   * Register Plugin Actions
   * @returns {Promise} upon completion of all registrations
   */

  registerActions() {
    this.Jaws.action(this.functionDeploy.bind(this), {
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
    return Promise.resolve();
  }

  /**
   * Function Deploy
   * @param evt
   * @returns {Promise.<T>}
   */

  functionDeploy(evt) {

    let _this                   = this;
    _this.evt                   = evt;

    // Flow
    return BbPromise.try(function() {})
        .bind(_this)
        .then(_this._validate)
        .then(_this._promptStage)
        .then(_this._prepareRegions)
        .then(_this._deployRegions);
  }

  /**
   * Validate
   * @private
   */

  _validate() {

    let _this = this;

    // If cli, process command line input
    if (_this.Jaws.cli) {

      // Add options to evt
      _this.evt = _this.Jaws.cli.options;

      // Add "type".  Should be first in array
      _this.evt.type       = _this.Jaws.cli.params[0];

      // Add "functions".  Should be all other array items
      _this.Jaws.cli.params.splice(0,1);
      _this.evt.functions  = _this.Jaws.cli.params;
    }

    // Validate type
    if (!_this.evt.type ||
        (_this.evt.type !== 'code' &&
        _this.evt.type !== 'endpoint' &&
        _this.evt.type !== 'all')
    ) {
      throw new JawsError(`Invalid type.  Must be "code", "endpoint", or "all" `);
    }

    // Validate stage
    if (!this.evt.stage) throw new JawsError(`Stage is required`);

    // If region specfied, add it to regions array for deployment
    if (this.evt.region) {
      this.evt.regions = [this.evt.region];
      delete this.evt.region; // Remove original region for cleanliness
    }

    // Process noExeCf
    this.evt.noExeCf   = (this.evt.noExeCf == true || this.evt.noExeCf == 'true');

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
   * @returns {Promise}
   * @private
   */

  _promptStage() {

    let stages = [],
        _this  = this;

    if (!_this.evt.stage) {
      stages = Object.keys(_this.Jaws._projectJson.stages);

      // If project only has 1 stage, skip prompt
      if (stages.length === 1) {
        _this.evt.stage = stages[0];
      }
    } else {

      // If user provided stage, skip prompt
      return Promise.resolve();
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
   * this._stage must be set before calling this method
   * @returns {Promise} list of regions
   * @private
   */

  _prepareRegions() {

    if (this.evt.regions.length) { // User specified specific region to deploy to
      return Promise.resolve();
    } else {

      // Deploy to all regions in stage
      let stage         = this.evt.stage,
          projJson      = this.Jaws._projectJson,
          regionConfigs = projJson.stages[stage];

      this.evt.regions = regionConfigs.map(rCfg => {
        return rCfg.region;
      });
    }

    JawsUtils.jawsDebug('Setting deploy to regions:');
    JawsUtils.jawsDebug(this.evt.regions);
    return Promise.resolve();
  }

  /**
   * Deploy Regions
   * @returns {*}
   * @private
   */

  _deployRegions() {

    let _this = this;

    return BbPromise.try(function() {
          return _this.evt.regions;
        })
        .each(function(region) {

          // Clone evt object keeps us safe when we start doing concurrent operations
          let evtClone = extend({}, _this.evt);

          // Add Region JSON for the deploy region
          evtClone.deployRegion = JawsUtils.getProjRegionConfigForStage(_this.Jaws._projectJson, _this.evt.stage, region);

          // Deploy Type
          switch(evtClone.type) {

            // Deploy Endpoint only
            case "endpoint":

              return _this.Jaws.actions.endpointPackageApiGateway(evtClone)
                  .bind(_this)
                  .then(_this.Jaws.actions.endpointProvisionApiGateway);

              //return BbPromise.try(function() {})
              //    .bind(_this)
              //    .then(function() {
              //      return _this.Jaws.actions.endpointPackageApiGateway(evtClone);
              //    })
              //    .then(_this.Jaws.actions.endpointProvisionApiGateway);

            // Deploy Code only (lambda)
            case "code":
              break;

            // Deploy Code then Endpoint
            case "all":
              break;


            default:
              return Promise.resolve();
          }
        });
  }
}

module.exports = FunctionDeploy;