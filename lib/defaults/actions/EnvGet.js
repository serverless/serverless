'use strict';

/**
 * Action: EnvGet
 */

const JawsPlugin = require('../../JawsPlugin'),
      JawsError  = require('../../jaws-error'),
      JawsCLI    = require('../../utils/cli'),
      chalk      = require('chalk'),
      JawsUtils  = require('../../utils'),
      EnvUtils   = require('../../utils/env.js');

/**
 * EnvGet Class
 */

class EnvGet extends JawsPlugin {

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
    return 'jaws.core.' + EnvGet.name;
  }

  /**
   * @returns {Promise} upon completion of all registrations
   */

  registerActions() {
    this.Jaws.addAction(this.envGet.bind(this), {
      handler:       'envGet',
      description:   `get var value for stage and region. Region can be 'all'
usage: jaws env get <stage> <region> <key>

\t Ex: jaws env get prod all JAWS_STAGE`,
      context:       'env',
      contextAction: 'get',
      options:       [],
    });
    return BbPromise.resolve();
  }

  /**
   *
   * @param stage
   * @param region
   * @param key
   * @returns {Promise}
   */
  envGet(evt) {
    if (!evt.stage || !evt.region) {
      return BbPromise.reject(new JawsError('Must specify a stage, region and key'), JawsError.errorCodes.UNKNOWN);
    }

    return EnvUtils.getEnvFiles(this.Jaws, evt.region, evt.stage)
      .then(envMapsByRegion => {
        let valByRegion = {};

        JawsCLI.log(`Values for ${key} in stage ${stage} by region:`);
        envMapsByRegion.forEach(mapForRegion => {
          let value;
          if (mapForRegion.vars && mapForRegion.vars[evt.key]) {
            value = mapForRegion.vars[evt.key];
            valByRegion[mapForRegion.regionName] = value;
          } else {
            value = chalk.red('NOT SET');
          }

          console.log(chalk.underline.bold(mapForRegion.regionName) + `: ${value}`);
        });

        return valByRegion;
      });
  }
}

module.exports = EnvGet;
