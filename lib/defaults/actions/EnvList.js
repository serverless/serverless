'use strict';

/**
 * Action: EnvList
 */

const JawsPlugin = require('../../JawsPlugin'),
      JawsError  = require('../../jaws-error'),
      JawsCLI    = require('../../utils/cli'),
      path       = require('path'),
      chalk      = require('chalk'),
      EnvUtils   = require('../../utils/env.js'),
      JawsUtils  = require('../../utils');

/**
 * EnvList Class
 */

class EnvList extends JawsPlugin {

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
    return 'jaws.core.' + EnvList.name;
  }

  /**
   * @returns {Promise} upon completion of all registrations
   */

  registerActions() {
    this.Jaws.action(this.envList.bind(this), {
      handler:       'envList',
      description:   `List env vars for stage and region.  Region can be 'all'
usage: jaws env list <stage> <region>`,
      context:       'env',
      contextAction: 'list',
      options:       [],
    });
    return Promise.resolve();
  }

  /**
   *
   * @param stage
   * @param region
   * @returns {Promise}
   */
  envList(stage, region) {
    let _this = this;

    if (!stage || !region) {
      return Promise.reject(new JawsError('Must specify a stage and region'), JawsError.errorCodes.UNKNOWN);
    }

    let awsModsDir = path.join(this.Jaws._projectRootPath, 'aws_modules');

    return JawsUtils.findAllAwsmJsons(awsModsDir)
      .then(awsmJsonPaths => {
        return [awsmJsonPaths, EnvUtils.getEnvFiles(_this.Jaws, region, stage)];
      })
      .spread((awsmJsonPaths, envMapsByRegion) => {
        let envInBackMap = {};
        JawsCLI.log(`ENV vars for stage ${stage}:`);
        envMapsByRegion.forEach(mapForRegion => {
          JawsCLI.log('------------------------------');
          JawsCLI.log(mapForRegion.regionName);
          JawsCLI.log('------------------------------');
          console.log(chalk.bold(mapForRegion.raw + '') + '\n');
        });

        //first build up a list of all env vars awsm modules say they need
        awsmJsonPaths.forEach(ajp => {
          let awsmJson = require(ajp);
          if (awsmJson.envVars) {
            awsmJson.envVars.forEach(function(key) {
              let rel = path.relative(awsModsDir, ajp);
              if (envInBackMap[key]) {
                envInBackMap[key].push(rel);
              } else {
                envInBackMap[key] = [rel];
              }
            });
          }
        });

        let awsmKeys = Object.keys(envInBackMap);
        if (awsmKeys.length) {
          JawsCLI.log('awsm.json:lambda.envVars and regions where they are used (red means NOT defined in region):');
          awsmKeys.forEach(key => {
            let regionNamesColored = envMapsByRegion.map(rMap => {
              return (!rMap.vars[key]) ? chalk.white.bgRed(rMap.regionName) : rMap.regionName;
            });

            JawsCLI.log('------------------------------');
            JawsCLI.log(key);
            JawsCLI.log('------------------------------');

            JawsCLI.log(chalk.bold('aws mods using') + ': ' + envInBackMap[key].join(','));
            JawsCLI.log(chalk.bold('regions') + ': ' + regionNamesColored.join(',') + '\n');
          });
        }

        return envMapsByRegion;
      });
  }
}

module.exports = EnvList;
