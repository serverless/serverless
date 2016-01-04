'use strict';

/**
 * Action: EnvSet
 * - Sets an environment variable based on the provide event
 *
 * Event Properties:
 * - stage    (String) a stage that exists in the project
 * - region   (String) a region that is defined in the provided stage
 * - key      (String) the env var key you want to set a value to
 * - value    (String) the env var value you want to set to the provided key
 */

module.exports = function(SPlugin, serverlessPath) {
  const path = require('path'),
      SError  = require(path.join(serverlessPath, 'ServerlessError')),
      SCli    = require(path.join(serverlessPath, 'utils/cli')),
      BbPromise  = require('bluebird'),
      awsMisc    = require(path.join(serverlessPath, 'utils/aws/Misc')),
      SUtils  = require(path.join(serverlessPath, 'utils'));

  /**
   * EnvSet Class
   */

  class EnvSet extends SPlugin {

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
      return 'serverless.core.' + EnvSet.name;
    }

    /**
     * Register Actions
     */

    registerActions() {
      this.S.addAction(this.envSet.bind(this), {
        handler:       'envSet',
        description:   `set var value for stage and region. Region can be 'all'
usage: serverless env set`,
        context:       'env',
        contextAction: 'set',
        options:       [
          {
            option:      'region',
            shortcut:    'r',
            description: 'region you want to set env var in'
          },
          {
            option:      'stage',
            shortcut:    's',
            description: 'stage you want to set env var in'
          },
          {
            option:      'key',
            shortcut:    'k',
            description: 'the key of the env var you want to set'
          },
          {
            option:      'value',
            shortcut:    'v',
            description: 'the value of the env var you want to set'
          },
          {
            option:      'nonInteractive',
            shortcut:    'i',
            description: 'Optional - Turn off CLI interactivity if true. Default: false'
          }
        ]
      });
      return BbPromise.resolve();
    }

    /**
     * Action
     */
    envSet(evt) {
      let _this    = this;
      _this.options = evt.options;

      // Get Meta instance
      this.meta = new this.S.classes.Meta(this.S);

      return _this._prompt()
          .bind(_this)
          .then(_this._validateAndPrepare)
          .then(_this._setEnvVar)
          .then(function() {
            SCli.log('Successfully set env var: ' + _this.options.key);
            return {
              options: _this.options,
              data: {}
            };
          });
    }


    /**
     * Prompt key, value, stage and region
     */
    _prompt() {
      let _this = this;

      return SCli.awsPromptInputEnvKey('Enter env var key to set a value to: ', _this)
          .then(key => {
            _this.options.key = key;
            BbPromise.resolve();
          })
          .then(function(){
            return SCli.awsPromptInputEnvValue('Enter env var value to set to the provided key: ', _this)
                .then(value => {
                  _this.options.value = value;
                  BbPromise.resolve();
                })
          })
          .then(function(){
            return _this.cliPromptSelectStage('Select a stage to set your env var in: ', _this.options.stage, true)
                .then(stage => {
                  _this.options.stage = stage;
                  BbPromise.resolve();
                })
          })
          .then(function(){
            return _this.cliPromptSelectRegion('Select a region to set env var in: ', true, true, _this.options.region, _this.options.stage)
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
        if (!_this.options.stage || !_this.options.region || !_this.options.key || !_this.options.value) {
          return BbPromise.reject(new SError('Missing stage and/or region and/or key'));
        }
      }

      // Validate stage: make sure stage exists
      if (!_this.meta.data.private.stages[_this.options.stage] && _this.options.stage != 'local') {
        return BbPromise.reject(new SError('Stage ' + _this.options.stage + ' does not exist in your project', SError.errorCodes.UNKNOWN));
      }

      // Skip the next validation if stage is 'local' & region is 'all'
      if (_this.options.stage != 'local' && _this.options.region != 'all') {

        // validate region: make sure region exists in stage
        if (!_this.meta.data.private.stages[_this.options.stage].regions[_this.options.region]) {
          return BbPromise.reject(new SError('Region "' + _this.options.region + '" does not exist in stage "' + _this.options.stage + '"'));
        }
      }
    }

    /**
     * set env var based on data validated
     */
    _setEnvVar(){
      let _this = this;

      return awsMisc.getEnvFiles(this.S, _this.options.region,  _this.options.stage)
          .then(envMapsByRegion => {
            let putEnvQ = [];

            envMapsByRegion.forEach(mapForRegion => {
              if (!mapForRegion.vars) { //someone could have del the .env file..
                mapForRegion.vars = {};
              }

              mapForRegion.vars[_this.options.key] = _this.options.value;

              let contents = '';
              Object.keys(mapForRegion.vars).forEach(newKey => {
                contents += [newKey, mapForRegion.vars[newKey]].join('=') + '\n';
              });

              if (_this.options.stage == 'local') {
                putEnvQ.push(SUtils.writeFile(path.join(this.S.config.projectPath, 'back', '.env'), contents));
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

  return( EnvSet );
};
