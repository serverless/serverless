'use strict';

/**
 * Action: EnvSet
 * - Sets an environment variable based on the provide event
 */

module.exports = function(SPlugin, serverlessPath) {
  const path = require('path'),
      SError  = require(path.join(serverlessPath, 'Error')),
      SCli    = require(path.join(serverlessPath, 'utils/cli')),
      BbPromise  = require('bluebird'),
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
      if (!_this.S.getProject().validateStageExists(_this.evt.options.stage) && _this.evt.options.stage != 'local') {
        return BbPromise.reject(new SError('Stage ' + _this.evt.options.stage + ' does not exist in your project', SError.errorCodes.UNKNOWN));
      }

      // Skip the next validation if stage is 'local' & region is 'all'
      if (_this.evt.options.stage != 'local' && _this.evt.options.region != 'all') {

        // validate region: make sure region exists in stage
        if (!_this.S.getProject().validateRegionExists(_this.evt.options.stage, _this.evt.options.region)) {
          return BbPromise.reject(new SError('Region "' + _this.evt.options.region + '" does not exist in stage "' + _this.evt.options.stage + '"'));
        }
      }
    }

    /**
     * set env var based on data validated
     */
    _setEnvVar(){
      let _this = this;

      return SUtils.getEnvFiles(_this.S, _this.evt.options.region,  _this.evt.options.stage)
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
                putEnvQ.push(SUtils.writeFile(_this.S.getProject().getRootPath('.env'), contents));
              } else {
                let project  = _this.S.getProject().getVariables().project,
                    projectBucket   = _this.S.getProject().getVariables().projectBucket,
                    projectBucketRegion = _this.S.getProject().getVariables().projectBucketRegion;

                _this.aws = _this.S.getProvider();

                let params = {
                  Bucket:      projectBucket,
                  Key:         ['serverless', project, _this.evt.options.stage, mapForRegion.region, 'envVars', '.env'].join('/'),
                  ACL:         'private',
                  ContentType: 'text/plain',
                  Body:        contents
                };

                putEnvQ.push(_this.aws.request('S3', 'putObject', params, _this.evt.options.stage, projectBucketRegion));
              }
            });

            return BbPromise.all(putEnvQ);
          });
    }
  }

  return( EnvSet );
};