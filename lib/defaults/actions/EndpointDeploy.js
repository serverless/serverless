'use strict';

/**
 * Action: DeployEndpoint
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
    return 'jaws.core.' + AliasLambda.name;
  }

  /**
   * @returns {Promise} upon completion of all registrations
   */

  registerActions() {
    this.Jaws.action(this.tbd.bind(this), {
      handler:       'tbd',
      description:   `Create alias for lambda at CWD.  If 'GREATEST' is specified for <version>, the highest version number for the lambda will be used.

usage: jaws lambda alias <version|GREATEST> <aliasName>`,
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
          description: 'Optional. Default is to version lambda in all regions defined in stage'
        }
      ],
    });
    return Promise.resolve();
  }
}

module.exports = EndpointDeploy;