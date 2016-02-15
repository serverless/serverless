'use strict';

/**
 * Action: EndpointRun
 * - Tests your deployed endpoint by making an HTTP request according to your endpoint config
 */

module.exports  = function(SPlugin, serverlessPath) {
  const path    = require('path'),
    SCli        = require(path.join(serverlessPath, 'utils/cli')),
    _           = require('lodash'),
    BbPromise   = require('bluebird');

  /**
   * EndpointRun Class
   */

  class EndpointRun extends SPlugin {

    constructor(S, config) {
      super(S, config);
    }

    static getName() {
      return 'serverless.core.' + EndpointRun.name;
    }

    registerActions() {
      this.S.addAction(this.endpointRun.bind(this), {
        handler:       'endpointRun',
        description:   `Tests your deployed endpoint by making an HTTP request according to your endpoint config`,
        context:       'endpoint',
        contextAction: 'run',
        options:       [
          {
            option:      'region',
            shortcut:    'r',
            description: 'region you want to run your function in'
          },
          {
            option:      'stage',
            shortcut:    's',
            description: 'stage you want to run your function in'
          }
        ],
        parameters: [
          {
            parameter: 'path',
            description: 'path to your endpoint',
            position: '0->1'
          }
        ]
      });
      return BbPromise.resolve();
    }

    /**
     * Action
     */

    endpointRun() {

      let _this    = this;
      _this.evt    = evt;

      // Instantiate Classes
      _this.project = _this.S.getProject();
      _this.meta    = _this.S.state.getMeta();

      // Set defaults
      _this.evt.options.path  = _this.evt.options.paths ? _this.evt.options.paths[0] : null;

      // If CLI and no paths targeted, deploy from CWD if Function
      if (_this.S.cli && !_this.evt.options.path) {

      }


      return _this._prompt()
        .bind(_this)
        .then(_this._validateAndPrepare)
        .then(_this._getEnvVar)
        .then(function() {

          /**
           * Return EVT
           */

          return _this.evt;

        });
    }

    /**
     * Prompt key, stage and region
     */
    _prompt() {

      let _this = this;
      _this.evt = evt;

      return _this.cliPromptSelectStage('Select the stage you want to run endpoint from: ', _this.evt.options.stage, false)
        .then(stage => {
          _this.evt.options.stage = stage;
          BbPromise.resolve();
        })
        .then(function(){
          return _this.cliPromptSelectRegion('Select the region you want to run endpoint from: ', false, true, _this.evt.options.region, _this.evt.options.stage)
            .then(region => {
              _this.evt.options.region = region;
              BbPromise.resolve();
            });
        });

    }

    _validateAndPrepare(){
      let _this = this;

      // non interactive validation
      if (!_this.S.config.interactive) {
        // Check Params
        if (!_this.evt.options.stage || !_this.evt.options.region) {
          return BbPromise.reject(new SError('Missing stage and/or region'));
        }
      }

      // validate stage: make sure stage exists
      if (!_this.S.state.meta.get().stages[_this.evt.options.stage]) {
        return BbPromise.reject(new SError('Stage ' + _this.evt.options.stage + ' does not exist in your project', SError.errorCodes.UNKNOWN));
      }

      // validate region: make sure region exists in stage
      if (!_this.S.state.meta.get().stages[_this.evt.options.stage].regions[_this.evt.options.region]) {
        return BbPromise.reject(new SError('Region "' + _this.evt.options.region + '" does not exist in stage "' + _this.evt.options.stage + '"'));
      }

    }
  }

  return( EndpointRun );
};