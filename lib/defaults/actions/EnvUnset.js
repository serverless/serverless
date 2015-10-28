'use strict';

/**
 * Action: EnvUnset
 */

const JawsPlugin = require('../../JawsPlugin'),
      JawsError  = require('../../jaws-error'),
      JawsCLI    = require('../../utils/cli'),
      path       = require('path'),
      EnvUtils   = require('../../utils/env.js'),
      JawsUtils  = require('../../utils');

/**
 * EnvUnset Class
 */

class EnvUnset extends JawsPlugin {

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
    return 'jaws.core.' + EnvUnset.name;
  }

  /**
   * @returns {Promise} upon completion of all registrations
   */

  registerActions() {
    this.Jaws.action(this.envUnset.bind(this), {
      handler:       'envUnset',
      description:   `unset var value for stage and region. Region can be 'all'
usage: jaws env unset <stage> <region> <key>

\t Ex: jaws env unset prod us-east-1 TABLE_NAME`,
      context:       'env',
      contextAction: 'unset',
      options:       [],
    });
    return Promise.resolve();
  }

  /**
   *
   * @param stage
   * @param region
   * @param key
   * @returns {Promise}
   */
  envUnset(stage, region, key) {
    if (!stage || !region || !key) {
      return Promise.reject(new JawsError('Must specify a stage, region, key'), JawsError.errorCodes.UNKNOWN);
    }

    return EnvUtils.getEnvFiles(this.Jaws, region, stage)
      .then(envMapsByRegion => {
        let putEnvQ = [];

        envMapsByRegion.forEach(mapForRegion => {
          if (!mapForRegion.vars) { //someone could have del the .env file..
            mapForRegion.vars = {};
          }

          delete mapForRegion.vars[key];

          let contents = '';
          Object.keys(mapForRegion.vars).forEach(newKey => {
            contents += [newKey, mapForRegion.vars[newKey]].join('=') + '\n';
          });

          if (stage == 'local') {
            putEnvQ.push(utils.writeFile(path.join(this.Jaws._projectRootPath, '.env'), contents));
          } else {
            putEnvQ.push(EnvUtils.putEnvFile(this.Jaws, mapForRegion.regionName, stage, contents));
          }
        });

        return Promise.all(putEnvQ);
      });
  }
}

module.exports = EnvUnset;
