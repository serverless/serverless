'use strict';

/**
 * Action: EnvGet
 */

const JawsPlugin = require('../../JawsPlugin'),
      JawsError  = require('../../jaws-error'),
      JawsCLI    = require('../../utils/cli'),
      chalk      = require('chalk'),
      JawsUtils  = require('../../utils');

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
    this.Jaws.action(this.envGet.bind(this), {
      handler:       'envGet',
      description:   `get var value for stage and region. Region can be 'all'
usage: jaws env get <stage> <region> <key>

\t Ex: jaws env get prod all JAWS_STAGE`,
      context:       'env',
      contextAction: 'get',
      options:       [],
    });
    return Promise.resolve();
  }

  /**
   *
   * @param stageRegionKey <array> stage region key
   * @returns {Promise}
   */
  envGet() {
    let _this          = this,
        stageRegionKey = Array.prototype.slice.call(arguments, 0);

    JawsUtils.jawsDebug('stage and region param', stageRegionKey);

    if (!stageRegionKey || stageRegionKey.length !== 3) {
      return Promise.reject(new JawsError('Must specify a stage, region and key'), JawsError.errorCodes.UNKNOWN);
    }

    let stage  = stageRegionKey[0],
        region = stageRegionKey[1],
        key    = stageRegionKey[2];

    return this.Jaws.getEnvFiles(region, stage)
      .then(envMapsByRegion => {
        let valByRegion = {};

        JawsCLI.log(`Values for ${key} in stage ${stage} by region:`);
        envMapsByRegion.forEach(mapForRegion => {
          let value;
          if (mapForRegion.vars && mapForRegion.vars[key]) {
            value = mapForRegion.vars[key];
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
