'use strict';

/**
 * Action: EnvSet
 */

const JawsPlugin = require('../../JawsPlugin'),
      JawsError  = require('../../jaws-error'),
      JawsCLI    = require('../../utils/cli'),
      path       = require('path'),
      EnvUtils   = require('../../utils/env.js'),
      JawsUtils  = require('../../utils');

/**
 * EnvSet Class
 */

class EnvSet extends JawsPlugin {

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
    return 'jaws.core.' + EnvSet.name;
  }

  /**
   * @returns {Promise} upon completion of all registrations
   */

  registerActions() {
    this.Jaws.action(this.envSet.bind(this), {
      handler:       'envSet',
      description:   `set var value for stage and region. Region can be 'all'
usage: jaws env set <stage> <region> <key> <val>

\t Ex: jaws env set prod us-east-1 TABLE_NAME users`,
      context:       'env',
      contextAction: 'set',
      options:       [],
    });
    return Promise.resolve();
  }

  /**
   *
   * @param stageRegionKey <array> stage region key val
   * @returns {Promise}
   */
  envSet() {
    let stageRegionKeyVal = Array.prototype.slice.call(arguments, 0);

    JawsUtils.jawsDebug('stage and region param', stageRegionKeyVal);

    if (!stageRegionKeyVal || stageRegionKeyVal.length !== 4) {
      return Promise.reject(new JawsError('Must specify a stage, region, key and val'), JawsError.errorCodes.UNKNOWN);
    }

    let stage  = stageRegionKeyVal[0],
        region = stageRegionKeyVal[1],
        key    = stageRegionKeyVal[2],
        val    = stageRegionKeyVal[3];

    return EnvUtils.getEnvFiles(this.Jaws, region, stage)
      .then(envMapsByRegion => {
        let putEnvQ = [];

        envMapsByRegion.forEach(mapForRegion => {
          if (!mapForRegion.vars) { //someone could have del the .env file..
            mapForRegion.vars = {};
          }

          mapForRegion.vars[key] = val;

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

module.exports = EnvSet;
