'use strict';

/**
 * Action: Service Deploy
 */

const JawsPlugin = require('../../JawsPlugin'),
    JawsError    = require('../../jaws-error'),
    JawsCLI      = require('../../utils/cli'),
    JawsUtils    = require('../../utils/index'),
    AWSUtils     = require('../../utils/aws'),
    BbPromise    = require('bluebird'),
    path         = require('path'),
    os           = require('os');

let fs = require('fs');
BbPromise.promisifyAll(fs);

class ServiceDeploy extends JawsPlugin {

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
    return 'jaws.core.' + ServiceDeploy.name;
  }

  /**
   * Register Plugin Actions
   * @returns {Promise} upon completion of all registrations
   */

  registerActions() {
    this.Jaws.action(this.serviceDeploy.bind(this), {
      handler:       'serviceDeploy',
      description:   'Deploys the code or endpoint of a service, or both',
      context:       'service',
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
   * Service Deploy
   * @param stage
   * @param region
   * @param noExeCf
   * @returns {Promise.<T>}
   */

  serviceDeploy(stage, region, noExeCf) {

    let _this                   = this;
    this.Jaws.ctx.stage         = stage;
    this.Jaws.ctx.regions       = region ? [region] : [];
    this.Jaws.ctx.noExeCf       = (noExeCf == true || noExeCf == 'true');
    this.Jaws.ctx.type          = Array.prototype.slice.call(arguments, 3);
    this.Jaws.ctx.type          = this.Jaws.ctx.type[0] ? this.Jaws.ctx.type[0].toLowerCase() : null;
    this.Jaws.ctx.services  = Array.prototype.slice.call(arguments, 4);

    // Flow
    return BbPromise.try(function() {})
        .bind(_this)
        .then(function() {

          // Get full service paths relative to project root
          if (!_this.Jaws.ctx.services.length) {

            // If no services, check cwd and resolve that path
            return JawsUtils.getServices(
                _this.Jaws._projectRootPath,
                _this.Jaws.ctx.type
            );

          } else {

            // If services, resolve their paths
            return JawsUtils.getServices(
                _this.Jaws._projectRootPath,
                _this.Jaws.ctx.type,
                _this.Jaws.ctx.services
            );
          }
        })
        .then(function(fullServicePaths){
          _this.Jaws.ctx.services = fullServicePaths;
          return;
        })
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

    // Validate "type"
    if (!_this.Jaws.ctx.type ||
        (_this.Jaws.ctx.type !== 'code' &&
        _this.Jaws.ctx.type !== 'endpoint' &&
        _this.Jaws.ctx.type !== 'all')
    ) {
      throw new JawsError(`Invalid type.  Must be "code", "endpoint", or "all" `);
    }

    // If no services, throw error
    if (!_this.Jaws.ctx.services.length) {
      throw new JawsError(`No service found.  Make sure your current working directory is a service.`);
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

    if (!_this.Jaws.ctx.stage) {
      stages = Object.keys(_this.Jaws._projectJson.stages);

      // If project only has 1 stage, skip prompt
      if (stages.length === 1) {
        _this.Jaws.ctx.stage = stages[0];
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

    return _this.selectInput('Service Deployer - Choose a stage: ', choices, false)
        .then(results => {
          _this.Jaws.ctx.stage = results[0].value;
        });
  }

  /**
   * Prepare Regions
   * this._stage must be set before calling this method
   * @returns {Promise} list of regions
   * @private
   */

  _prepareRegions() {

    if (this.Jaws.ctx.regions.length) { // User specified specific region to deploy to
      return Promise.resolve();
    } else {

      // Deploy to all regions in stage
      let stage         = this.Jaws.ctx.stage,
          projJson      = this.Jaws._projectJson,
          regionConfigs = projJson.stages[stage];

      this.Jaws.ctx.regions = regionConfigs.map(rCfg => {
        return rCfg.region;
      });
    }

    JawsUtils.jawsDebug('Setting deploy to regions:');
    JawsUtils.jawsDebug(this.Jaws.ctx.regions);
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
          return _this.Jaws.ctx.regions;
        })
        .each(function(region) {

          // Deploy endpoints to each region
          _this.Jaws.ctx.currentRegion = JawsUtils.getProjRegionConfigForStage(_this.Jaws._projectJson, _this.Jaws.ctx.stage, region);

          // Deploy Type
          switch(_this.Jaws.ctx.type) {

            // Deploy Endpoint only
            case "endpoint":

              return BbPromise.try(function() {
                    _this.Jaws.actions.endpointPackageApiGateway(_this.Jaws.ctx.services)
                  })
                  .bind(_this)
                  .then(_this.Jaws.actions.endpointProvisionApiGateway);

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

module.exports = ServiceDeploy;