'use strict';

/**
 * Action: EnvUnset
 */

const JawsPlugin = require('../../JawsPlugin'),
      JawsError  = require('../../jaws-error'),
      JawsCLI    = require('../../utils/cli'),
      path       = require('path'),
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
   * @param stageRegionKey <array> stage region key
   * @returns {Promise}
   */
  envUnset() {
    let stageRegionKey = Array.prototype.slice.call(arguments, 0);

    JawsUtils.jawsDebug('stage and region param', stageRegionKey);

    if (!stageRegionKey || stageRegionKey.length !== 3) {
      return Promise.reject(new JawsError('Must specify a stage, region and key'), JawsError.errorCodes.UNKNOWN);
    }

    let stage  = stageRegionKey[0],
        region = stageRegionKey[1],
        key    = stageRegionKey[2];

    return this.Jaws.getEnvFiles(region, stage)
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
            putEnvQ.push(this.Jaws.putEnvFile(mapForRegion.regionName, stage, contents));
          }
        });

        return Promise.all(putEnvQ);
      });
  }
}

module.exports = EnvUnset;
