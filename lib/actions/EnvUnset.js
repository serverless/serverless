'use strict';

/**
 * Action: EnvUnset
 * - Unsets an environment variable based on the provided event
 *
 * Event Properties:
 * - stage    (String) a stage that exists in the project
 * - region   (String) a region that is defined in the provided stage
 * - key      (String) the env var key you want to unset from region bucket
 */

module.exports = function(SPlugin, serverlessPath) {
  const path = require('path'),
      SError  = require(path.join(serverlessPath, 'ServerlessError')),
      SCli    = require(path.join(serverlessPath, 'utils/cli')),
      BbPromise  = require('bluebird'),
      awsMisc    = require(path.join(serverlessPath, 'utils/aws/Misc')),
      SUtils  = require(path.join(serverlessPath, 'utils'));

  /**
   * EnvUnset Class
   */

  class EnvUnset extends SPlugin {

    /**
     * Constructor
     */

    constructor(S, config) {
      super(S, config);
      this.options = {};
    }

    /**
     * Define your plugins name
     */

    static getName() {
      return 'serverless.core.' + EnvUnset.name;
    }

    /**
     * Register Actions
     */

    registerActions() {
      this.S.addAction(this.envUnset.bind(this), {
        handler:       'envUnset',
        description:   `unset var value for stage and region. Region can be 'all'
usage: serverless env unset`,
        context:       'env',
        contextAction: 'unset',
        options:       [
          {
            option:      'region',
            shortcut:    'r',
            description: 'region you want to unset env var from'
          },
          {
            option:      'stage',
            shortcut:    's',
            description: 'stage you want to unset env var from'
          },
          {
            option:      'key',
            shortcut:    'k',
            description: 'the key of the env var you want to unset'
          },
          {
            option:      'nonInteractive',
            shortcut:    'i',
            description: 'Optional - Turn off CLI interactivity if true. Default: false'
          },
        ],
      });
      return BbPromise.resolve();
    }

    /**
     * Action
     */
    envUnset(evt) {
      let _this    = this;
      _this.options = evt.options;

      // Get Meta instance
      this.meta = new this.S.classes.Meta(this.S);

      return _this._prompt()
          .bind(_this)
          .then(_this._validateAndPrepare)
          .then(_this._unsetEnvVar)
          .then(function() {
            SCli.log('Successfully unset env var: ' + _this.options.key);
            return {
              options: _this.options,
              data: {}
            };
          });
    }


    /**
     * Prompt key, stage and region
     */
    _prompt() {
      let _this = this;

      return SCli.awsPromptInputEnvKey('Enter env var key to unset its value: ', _this)
          .then(key => {
            _this.options.key = key;
            BbPromise.resolve();
          })
          .then(function(){
            return _this.cliPromptSelectStage('Select a stage to unset env var from: ', _this.options.stage, true)
                .then(stage => {
                  _this.options.stage = stage;
                  BbPromise.resolve();
                })
          })
          .then(function(){
            return _this.cliPromptSelectRegion('Select a region to unset env var from: ', true, true, _this.options.region, _this.options.stage)
                .then(region => {
                  _this.options.region = region;
                  BbPromise.resolve();
                });
          });
    }


    /**
     * Validate all data from event, interactive CLI or non interactive CLI
     * and prepare data
     */

    _validateAndPrepare(){
      let _this = this;

      // non interactive validation
      if (!_this.S.config.interactive) {

        // Check Params
        if (!_this.options.stage || !_this.options.region || !_this.options.key) {
          return BbPromise.reject(new SError('Missing stage and/or region and/or key'));
        }
      }

      // validate stage: make sure stage exists
      if (!_this.meta.data.private.stages[_this.options.stage] && _this.options.stage != 'local') {
        return BbPromise.reject(new SError('Stage ' + _this.options.stage + ' does not exist in your project', SError.errorCodes.UNKNOWN));
      }

      // Skip the next validation if stage is 'local' & region is 'all'
      if (_this.options.stage != 'local' && _this.options.region != 'all') {

        // Validate region: make sure region exists in stage
        if (!_this.meta.data.private.stages[_this.options.stage].regions[_this.options.region]) {
          return BbPromise.reject(new SError('Region "' + _this.options.region + '" does not exist in stage "' + _this.options.stage + '"'));
        }
      }
    }

    /**
     * unset env var based on data validated
     */
    _unsetEnvVar(){
      let _this = this;

      return awsMisc.getEnvFiles(_this.S, _this.options.region, _this.options.stage)
          .then(envMapsByRegion => {
            let putEnvQ = [];

            envMapsByRegion.forEach(mapForRegion => {
              if (!mapForRegion.vars) { //someone could have del the .env file..
                mapForRegion.vars = {};
              }

              delete mapForRegion.vars[_this.options.key];

              let contents = '';
              Object.keys(mapForRegion.vars).forEach(newKey => {
                contents += [newKey, mapForRegion.vars[newKey]].join('=') + '\n';
              });

              if (_this.options.stage == 'local') {
                putEnvQ.push(utils.writeFile(path.join(_this.S.config.projectPath, 'back', '.env'), contents));
              } else {
                let projectName  = _this.meta.data.private.variables.project,
                    bucketName   = _this.meta.data.private.variables.projectBucket,
                    bucketRegion = bucketName.split('.')[1];

                let awsConfig = {
                  region:          bucketRegion,
                  accessKeyId:     _this.S.config.awsAdminKeyId,
                  secretAccessKey: _this.S.config.awsAdminSecretKey,
                };

                let S3  = require('../utils/aws/S3')(awsConfig);
                putEnvQ.push(S3.sPutEnvFile(bucketName, projectName, _this.options.stage, _this.options.region, contents));
              }
            });

            return BbPromise.all(putEnvQ);
          });
    }
  }

  return( EnvUnset );
};
