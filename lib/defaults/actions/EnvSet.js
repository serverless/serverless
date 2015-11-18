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
    this.Jaws.addAction(this.envSet.bind(this), {
      handler:       'envSet',
      description:   `set var value for stage and region. Region can be 'all'
usage: jaws env set <stage> <region> <key> <val>

\t Ex: jaws env set prod us-east-1 TABLE_NAME users`,
      context:       'env',
      contextAction: 'set',
      options:       [],
    });
    return BbPromise.resolve();
  }

  /**
   *
   * @param stage
   * @param region
   * @param key
   * @param val
   * @returns {Promise}
   */
  envSet(evt) {
    if (!evt.stage || !evt.region || !evt.key || !evt.val) {
      return BbPromise.reject(new JawsError('Must specify a stage, region, key and val'), JawsError.errorCodes.UNKNOWN);
    }

    return EnvUtils.getEnvFiles(this.Jaws, evt.region, evt.stage)
      .then(envMapsByRegion => {
        let putEnvQ = [];

        envMapsByRegion.forEach(mapForRegion => {
          if (!mapForRegion.vars) { //someone could have del the .env file..
            mapForRegion.vars = {};
          }

          mapForRegion.vars[evt.key] = evt.val;

          let contents = '';
          Object.keys(mapForRegion.vars).forEach(newKey => {
            contents += [newKey, mapForRegion.vars[newKey]].join('=') + '\n';
          });

          if (evt.stage == 'local') {
            putEnvQ.push(utils.writeFile(path.join(this.Jaws._projectRootPath, '.env'), contents));
          } else {
            putEnvQ.push(EnvUtils.putEnvFile(this.Jaws, mapForRegion.regionName, evt.stage, contents));
          }
        });

        return BbPromise.all(putEnvQ);
      });
  }
}

module.exports = EnvSet;
