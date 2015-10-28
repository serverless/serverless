'use strict';

/**
 * Action: EndpointDeploy
 */

const JawsPlugin = require('../../JawsPlugin'),
      JawsError  = require('../../jaws-error'),
      JawsCLI    = require('../../utils/cli'),
      BbPromise  = require('bluebird'),
      path       = require('path'),
      os         = require('os'),
      AWSUtils   = require('../../utils/aws'),
      JawsUtils  = require('../../utils/index');

let fs = require('fs');
BbPromise.promisifyAll(fs);

class EndpointDeploy extends JawsPlugin {

  /**
   * @param Jaws class object
   * @param config object
   */
  constructor(Jaws, config, endpointAwsmPaths, stage, region) {
    super(Jaws, config);
    this._endpointAwsmPaths   = endpointAwsmPaths;
    this._stage           = stage;
    this._region          = region;
  }

  /**
   * Define your plugins name
   *
   * @returns {string}
   */
  static getName() {
    return 'jaws.core.' + EndpointDeploy.name;
  }

  /**
   * @returns {Promise} upon completion of all registrations
   */

  registerActions() {
    this.Jaws.action(this.endpointDeploy.bind(this), {
      handler:       'endpointDeploy',
      description:   'Deploy one or multiple endpoints',
      context:       'endpoint',
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
        }
      ],
    });
    return Promise.resolve();
  }

  /**
   * Fetch deployed lambdas in CF stack
   *
   * @private
   */
  _fetchDeployedLambdas() {
    let _this = this;

    return AWSUtils.cfGetLambdaResourceSummaries(
        _this.Jaws._awsProfile,
        _this._regionJson.region,
        AWSUtils.cfGetLambdasStackName(_this._stage, _this.Jaws._projectJson.name)
        )
        .then(lambdas => {
          this._lambdas = lambdas;
        });
  }


  _validate() {

  }
}

module.exports = EndpointDeploy;