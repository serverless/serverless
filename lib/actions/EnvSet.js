'use strict';

/**
 * Action: EnvSet
 * - Sets an environment variable based on the provide event
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
      _this.evt    = evt;

      return _this._prompt()
          .bind(_this)
          .then(_this._validateAndPrepare)
          .then(_this._setEnvVar)
          .then(function() {

            SCli.log('Successfully set env var: ' + _this.evt.options.key);

            /**
             * Return EVT
             */

            return _this.evt;

          });
    }


    /**
     * Prompt key, value, stage and region
     */
    _prompt() {
      let _this = this;

      return SCli.awsPromptInputEnvKey('Enter env var key to set a value to: ', _this)
          .then(key => {
            _this.evt.options.key = key;
            BbPromise.resolve();
          })
          .then(function(){
            return SCli.awsPromptInputEnvValue('Enter env var value to set to the provided key: ', _this)
                .then(value => {
                  _this.evt.options.value = value;
                  BbPromise.resolve();
                })
          })
          .then(function(){
            return _this.cliPromptSelectStage('Select a stage to set your env var in: ', _this.evt.options.stage, true)
                .then(stage => {
                  _this.evt.options.stage = stage;
                  BbPromise.resolve();
                })
          })
          .then(function(){
            return _this.cliPromptSelectRegion('Select a region to set env var in: ', true, true, _this.evt.options.region, _this.evt.options.stage)
                .then(region => {
                  _this.evt.options.region = region;
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
        if (!_this.evt.options.stage || !_this.evt.options.region || !_this.evt.options.key || !_this.evt.options.value) {
          return BbPromise.reject(new SError('Missing stage and/or region and/or key'));
        }
      }

      // Validate stage: make sure stage exists
      if (!_this.S.state.meta.get().stages[_this.evt.options.stage] && _this.evt.options.stage != 'local') {
        return BbPromise.reject(new SError('Stage ' + _this.evt.options.stage + ' does not exist in your project', SError.errorCodes.UNKNOWN));
      }

      // Skip the next validation if stage is 'local' & region is 'all'
      if (_this.evt.options.stage != 'local' && _this.evt.options.region != 'all') {

        // validate region: make sure region exists in stage
        if (!_this.S.state.meta.get().stages[_this.evt.options.stage].regions[_this.evt.options.region]) {
          return BbPromise.reject(new SError('Region "' + _this.evt.options.region + '" does not exist in stage "' + _this.evt.options.stage + '"'));
        }
      }
    }

    /**
     * set env var based on data validated
     */
    _setEnvVar(){
      let _this = this;

      return awsMisc.getEnvFiles(this.S, _this.evt.options.region,  _this.evt.options.stage)
          .then(envMapsByRegion => {
            let putEnvQ = [];

            envMapsByRegion.forEach(mapForRegion => {
              if (!mapForRegion.vars) { //someone could have del the .env file..
                mapForRegion.vars = {};
              }

              mapForRegion.vars[_this.evt.options.key] = _this.evt.options.value;

              let contents = '';
              Object.keys(mapForRegion.vars).forEach(newKey => {
                contents += [newKey, mapForRegion.vars[newKey]].join('=') + '\n';
              });

              if (_this.evt.options.stage == 'local') {
                putEnvQ.push(SUtils.writeFile(this.S.getProject().getFilePath('.env'), contents));
              } else {
                let projectName  = _this.S.state.meta.get().variables.project,
                    bucketName   = _this.S.state.meta.get().variables.projectBucket,
                    bucketRegion = bucketName.split('.')[1];

                let awsConfig = {
                  region:          bucketRegion,
                  accessKeyId:     _this.S.config.awsAdminKeyId,
                  secretAccessKey: _this.S.config.awsAdminSecretKey,
                };
                let S3  = require('../utils/aws/S3')(awsConfig);
                putEnvQ.push(S3.sPutEnvFile(bucketName, projectName, _this.evt.options.stage, mapForRegion.region, contents));
              }
            });

            return BbPromise.all(putEnvQ);
          });
    }
  }

  return( EnvSet );
};