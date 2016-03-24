'use strict';

/**
 * Action: VariablesUnset
 * - Removes a variable from your project's configuration files
 */

module.exports = function(S) {

  const path   = require('path'),
    replaceall = require('replaceall'),
    SUtils     = S.utils,
    SError     = require(S.getServerlessPath('Error')),
    SCli       = require(S.getServerlessPath('utils/cli')),
    BbPromise  = require('bluebird'),
    _          = require('lodash'),
    async      = require('async');

  class VariablesUnset extends S.classes.Plugin {

    /**
     * Define your plugins name
     */

    static getName() {
      return 'serverless.core.' + this.name;
    }

    /**
     * @returns {Promise} upon completion of all registrations
     */

    registerActions() {
      S.addAction(this.variablesUnset.bind(this), {
        handler:       'variablesUnset',
        description:   `Removes a variable from your project's configuration files.
usage: serverless variables unset`,
        context:       'variables',
        contextAction: 'unset',
        options:       [
          {
            option:      'region',
            shortcut:    'r',
            description: 'region you want to remove the variable from'
          },
          {
            option:      'stage',
            shortcut:    's',
            description: 'stage you want to remove the variable from'
          },
          {
            option:      'key',
            shortcut:    'k',
            description: 'the key of the variable you want to remove'
          }
        ]
      });
      return BbPromise.resolve();
    }

    /**
     * Action
     */

    variablesUnset(evt) {

      let _this    = this;
      _this.evt    = evt;

      return _this._prompt()
          .bind(_this)
          .then(_this._validateAndPrepare)
          .then(_this._removeVariable)
          .then(function() {
            
            SCli.log('Successfully unset variable: ' + _this.evt.options.key);

            return _this.evt;
          });
    }

    /**
     * Prompt key, stage and region
     */
    _prompt() {
      let _this = this;

      if (!S.config.interactive) return BbPromise.resolve();

      return BbPromise.try(function() {

            // Skip if key is provided already
            if (_this.evt.options.key) return;

            let prompts = {
              properties: {}
            };

            prompts.properties.key = {
              description: 'Enter variable key to remove: '.yellow,
              required:    true
            };

            return _this.cliPromptInput(prompts, { key: _this.evt.options.key })
                .then(function(answers) {
                  _this.evt.options.key = answers.key;
                });
          })
          .then(function() {
            return _this.cliPromptSelectStage('Select a stage to remove your variable from: ', _this.evt.options.stage, false)
                .then(stage => {
                  _this.evt.options.stage = stage;
                })
          })
          .then(function() {
            return _this.cliPromptSelectRegion('Select a region to remove variable from: ', false, true, _this.evt.options.region, _this.evt.options.stage)
                .then(region => {
                  _this.evt.options.region = region;
                });
          });
    }

    /**
     * Validate all data from event, interactive CLI or non interactive CLI
     * and prepare data
     */

    _validateAndPrepare() {
      let _this = this;

      // non interactive validation
      if (!S.config.interactive) {
        // Check Params
        if (!_this.evt.options.stage || !_this.evt.options.region || !_this.evt.options.key) {
          return BbPromise.reject(new SError('Missing stage and/or region and/or key'));
        }
      }

      // Validate stage: make sure stage exists
      if (!S.getProject().validateStageExists(_this.evt.options.stage) && _this.evt.options.stage != 'local') {
        return BbPromise.reject(new SError('Stage ' + _this.evt.options.stage + ' does not exist in your project'));
      }

      // Skip the next validation if stage is 'local' & region is 'all'
      if (_this.evt.options.stage != 'local' && _this.evt.options.region != 'all') {

        // validate region: make sure region exists in stage
        if (!S.getProject().validateRegionExists(_this.evt.options.stage, _this.evt.options.region)) {
          return BbPromise.reject(new SError('Region "' + _this.evt.options.region + '" does not exist in stage "' + _this.evt.options.stage + '"'));
        }
      }
    }

    /**
     * Unset the variable and save it
     */

    _removeVariable() {

      let _this  = this,
          stage  = this.evt.options.stage,
          region = this.evt.options.region;

      let unsetVariableHelper = (region) => {

        _.unset(region.getVariables(), _this.evt.options.key);
        region.save();
      };

      if (region != 'all' || stage == 'local') {  //single region
        if (stage == 'local') {
          region = 'local';
        }

        unsetVariableHelper(S.getProject().getRegion(stage, region));
      } else {
        // All regions
        S.getProject().getAllRegions(stage).forEach(function (region) {
          unsetVariableHelper(region);
        });
      }
    }

  }

  return( VariablesUnset );
};