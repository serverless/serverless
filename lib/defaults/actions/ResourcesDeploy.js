'use strict';

/**
 * Action: ResourcesDeploy
 */

const JawsPlugin = require('../../JawsPlugin'),
      JawsError  = require('../../jaws-error'),
      JawsCLI    = require('../../utils/cli'),
      AWSUtils   = require('../../utils/aws'),
      JawsUtils  = require('../../utils/index');

class ResourcesDeploy extends JawsPlugin {

  /**
   * @param Jaws class object
   * @param config object
   */

  constructor(Jaws, config) {
    super(Jaws, config);
    this._stage  = null;
    this._region = null;
  }

  /**
   * Define your plugins name
   *
   * @returns {string}
   */
  static getName() {
    return 'jaws.core.' + ResourcesDeploy.name;
  }

  /**
   * @returns {Promise} upon completion of all registrations
   */

  registerActions() {
    this.Jaws.action(this.deployResources.bind(this), {
      handler:       'resourcesDeploy',
      description:   `Provision AWS resources (resources-cf.json). If only one stage, [stage] is optional.  If only one region for [stage], [region] is optional.
usage: jaws resources deploy [stage] [region]

ex:
  jaws resources deploy dev us-east-1`,
      context:       'resources',
      contextAction: 'deploy',
      options:       [],
    });
    return Promise.resolve();
  }

  /**
   *
   * @param stage optional if proj has only one stage
   * @param region optional if only one region for stage
   * @returns {Promise}
   */
  deployResources(stage, region) {
    let _this   = this,
        spinner = JawsCLI.spinner();

    JawsUtils.jawsDebug('stage and region param', stageRegion);

    this._stage  = stage;
    this._region = region;

    return this.Jaws.validateProject()
      .bind(_this)
      .then(_this._promptStageRegion)
      .then(() => {
        JawsCLI.log('Deploying resources to stage  "'
          + _this._stage
          + ' and region '
          + _this._region
          + '"via Cloudformation.  This could take a while depending on how many resources you are updating...');

        spinner.start();

        return AWSUtils.cfUpdateResourcesStack(
          _this.Jaws,
          _this._stage,
          _this._region);
      })
      .then(cfData => {
        return AWSUtils.monitorCf(cfData, _this.Jaws._awsProfile, _this._region, 'update');
      })
      .then(() => {
        spinner.stop(true);
        JawsCLI.log('Resource Deployer:  Successfully deployed ' + _this._stage + ' resources to ' + _this._region);
      });
  }

  /**
   *
   * @returns {Promise}
   * @private
   */
  _promptStageRegion() {
    let stages  = [],
        regions = [],
        _this   = this,
        stageDeferred, regionDeferred;

    // If stage exists, skip
    if (!this._stage) {
      stages = Object.keys(_this.Jaws._projectJson.stages);

      // If project only has 1 stage, skip prompt
      if (stages.length === 1) {
        this._stage = stages[0];
        JawsUtils.jawsDebug('Only one stage for project. Using ' + this._stage);
      }
    }

    if (this._stage) { //User specified stage or only one stage
      stageDeferred = Promise.resolve();
    } else {
      // Create Choices
      let choices = stages.map(stage => {
        return {
          key:   '',
          value: stage,
          label: stage,
        };
      });

      stageDeferred = this.selectInput('Choose a stage: ', choices, false)
        .then(results => {
          _this._stage = results[0].value;
        });
    }

    // If stage exists, skip
    if (!this._region) {
      regions = this.Jaws._projectJson.stages[_this._stage];

      // If project only has 1 stage, skip prompt
      if (regions.length === 1) {
        this._region = regions[0].region;
        JawsUtils.jawsDebug('Only one region for project. Using ' + this._region);
      }
    }

    if (this._region) { //User specified region or only 1 region for stage
      regionDeferred = Promise.resolve();
    } else {
      // Create Choices
      let choices = regions.map(region => {
        return {
          key:   '',
          value: region,
          label: region,
        };
      });

      regionDeferred = this.selectInput('Choose a region: ', choices, false)
        .then(results => {
          _this._region = results[0].value;
        });
    }

    return stageDeferred
      .then(() => {
        return regionDeferred;
      });
  }
}

module.exports = ResourcesDeploy;
