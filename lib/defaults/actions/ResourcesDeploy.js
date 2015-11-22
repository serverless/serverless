'use strict';

/**
 * Action: ResourcesDeploy
 */

const JawsPlugin = require('../../JawsPlugin'),
      JawsError  = require('../../jaws-error'),
      JawsCLI    = require('../../utils/cli'),
      BbPromise  = require('bluebird'),
      JawsUtils  = require('../../utils/index');

class ResourcesDeploy extends JawsPlugin {

  /**
   * @param Jaws class object
   * @param config object
   */

  constructor(Jaws, config) {
    super(Jaws, config);
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
    this.Jaws.addAction(this.deployResources.bind(this), {
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
  deployResources(evt) {
    let _this   = this,
        spinner = JawsCLI.spinner();

    JawsUtils.jawsDebug('stage and region param', stageRegion);
    
    if(evt.stage && evt.region) {
      _this.evt = evt;
    }

    return this.Jaws.validateProject()
      .bind(_this)
      .then(_this._promptStageRegion)
      .then(() => {
        JawsCLI.log('Deploying resources to stage  "'
          + _this.evt.stage
          + ' and region '
          + _this.evt.region
          + '"via Cloudformation.  This could take a while depending on how many resources you are updating...');

        spinner.start();
        
        
        let config = {
          profile: _this._awsProfile, 
          region : _this.evt.region
        };
        _this.CF  = require('../../utils/aws/CloudFormation')(config);
        return _this.CF.sUpdateResourcesStack(
          _this.Jaws,
          _this.evt.stage,
          _this.evt.region);
      })
      .then(cfData => {
        return _this.CF.sMonitorCf(cfData, _this.Jaws._awsProfile, _this.evt.region, 'update');
      })
      .then(() => {
        spinner.stop(true);
        JawsCLI.log('Resource Deployer:  Successfully deployed ' + _this.evt.stage + ' resources to ' + _this.evt.region);
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
    if (!this.evt.stage) {
      stages = Object.keys(_this.Jaws._projectJson.stage);

      // If project only has 1 stage, skip prompt
      if (stages.length === 1) {
        this.evt.stage = stages[0];
        JawsUtils.jawsDebug('Only one stage for project. Using ' + this.evt.stage);
      }
    }

    if (this.evt.stage) { //User specified stage or only one stage
      stageDeferred = BbPromise.resolve();
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
          _this.evt.stage = results[0].value;
        });
    }

    // If region exists, skip
    if (!_this.evt.region) {
      regions = this.Jaws._projectJson.stage[_this.evt.stage];

      // If project only has 1 region, skip prompt
      if (regions.length === 1) {
        _this.evt.region = regions[0].region;
        JawsUtils.jawsDebug('Only one region for project. Using ' + this.evt.region);
      }
    }

    if (this.evt.region) { //User specified region or only 1 region for stage
      regionDeferred = BbPromise.resolve();
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
          _this.evt.region = results[0].value;
        });
    }

    return stageDeferred
      .then(() => {
        return regionDeferred;
      });
  }
}

module.exports = ResourcesDeploy;
