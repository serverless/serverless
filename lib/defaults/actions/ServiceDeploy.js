'use strict';

/**
 * Action: ServiceDeploy
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
    let _this           = this;
    this._stage         = stage;
    this._region        = region;
    this._noExeCf       = (noExeCf == true || noExeCf == 'true');
    this._type          = Array.prototype.slice.call(arguments, 3);
    this._type          = this._type[0] ? this._type[0].toLowerCase() : null;
    this._servicePaths  = Array.prototype.slice.call(arguments, 4);

    // Flow
    return BbPromise.try(function() {})
        .bind(_this)
        .then(function() {

          // Get full service paths relative to project root
          if (!_this._servicePaths.length) {

            // If no servicePaths, check cwd and resolve that path
            return JawsUtils.getServices(
                _this.Jaws._projectRootPath,
                _this._type
            );

          } else {

            // If servicePaths, resolve their paths
            return JawsUtils.getServices(
                _this.Jaws._projectRootPath,
                _this._type,
                _this._servicePaths
            );
          }
        })
        .then(function(fullServicePaths){
          _this._servicePaths = fullServicePaths;
          return;
        })
        .then(_this._validate)
        .then(_this._promptStage)
        .then(_this._computeDeployToRegions)
        .then(_this._deployRegions);
  }

  /**
   * Validate
   * @private
   */

  _validate() {

    let _this = this;

    // Validate "type"
    if (!_this._type ||
        (_this._type !== 'code' &&
        _this._type !== 'endpoint' &&
        _this._type !== 'all')
    ) {
      throw new JawsError(`Invalid type.  Must be "code", "endpoint", or "all" `);
    }

    // If no servicePaths, throw error
    if (!_this._servicePaths.length) {
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

    if (!_this._stage) {
      stages = Object.keys(_this.Jaws._projectJson.stages);

      // If project only has 1 stage, skip prompt
      if (stages.length === 1) {
        _this._stage = stages[0];
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
          _this._stage = results[0].value;
        });
  }

  /**
   * Compute Deploy To Regions
   * this._stage must be set before calling this method
   * @returns {Promise} list of regions
   * @private
   */

  _computeDeployToRegions() {

    if (this._region) { // User specified specific region to deploy to
      this._deployToRegions = [this._region];
    } else {

      // Deploy to all regions in stage
      let stage         = this._stage,
          projJson      = this.Jaws._projectJson,
          regionConfigs = projJson.stages[stage];

      this._deployToRegions = regionConfigs.map(rCfg => {
        return rCfg.region;
      });
    }

    JawsUtils.jawsDebug('Setting deploy to regions:');
    JawsUtils.jawsDebug(this._deployToRegions);
    return BbPromise.resolve(this._deployToRegions);
  }

  /**
   * Deploy Regions
   * @returns {*}
   * @private
   */

  _deployRegions() {

    let _this = this;

    return BbPromise.try(function() {
          return _this._deployToRegions;
        })
        .each(function(region) {

          // Deploy endpoints to each region
          _this._regionJson = JawsUtils.getProjRegionConfigForStage(_this.Jaws._projectJson, _this._stage, region);

          // Deploy Type
          switch(_this._type) {

            // Deploy Endpoint only
            case "endpoint":

              return _this.Jaws.actions.endpointPackageApiGateway(_this._servicePaths)
                  .then(function(serviceJsons) {

                    console.log(serviceJsons);
                    console.log(_this);

                    // TODO: WHY IS THIS RETURNING A FUNCTION??
                    // TODO: ADD TO CONTEXT INSTEAD??

                    _this._serviceJsons = serviceJsons;
                  });

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