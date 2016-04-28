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
        description:   'Removes a variable from your project\'s configuration files. Usage: serverless variables unset',
        context:       'variables',
        contextAction: 'unset',
        options:       [
          {
            option:      'type',
            shortcut:    't',
            description: 'variable type (common, stage or region)'
          },
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
            // Allow to dismiss region to set stage variables
            const selection = [
                             {key:"1) ", value:"common", label:"Common"},
                             {key:"2) ", value:"stage", label:"Stage"},
                             {key:"3) ", value:"region", label:"Region"}
                            ];
            if (_.indexOf(['common','stage','region'], _this.evt.options.type) !== -1) {
              return BbPromise.resolve();
            }
            return _this.cliPromptSelect('Select variable type: ', selection, false)
            .spread(function(selectType) {
              _this.evt.options.type = selectType.value;
              return BbPromise.resolve();
            });
          })
          .then(function() {
            if (_this.evt.options.type === 'common') {
              return BbPromise.resolve();
            }
            return _this.cliPromptSelectStage('Select a stage to remove your variable from: ', _this.evt.options.stage, false)
                .then(stage => {
                  _this.evt.options.stage = stage;
                })
          })
          .then(function() {
            if (_this.evt.options.type !== "region") {
              return BbPromise.resolve();
            }
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
        const paramsOk = (!!_this.evt.options.type && !!_this.evt.options.key) &&
        (_this.evt.options.type === 'common' || 
          (_this.evt.options.type === 'stage' && !!_this.evt.options.stage) ||
          (_this.evt.options.type === 'region' && !!_this.evt.options.stage && !!_this.evt.options.region));
        
        if (!paramsOk) {
          return BbPromise.reject(new SError('Wrong parameter combination or missing key/value. See --help.'));
        }
      }

      // Validate stage: make sure stage exists
      if ((_this.evt.options.type !== 'common') && !S.getProject().validateStageExists(_this.evt.options.stage) && _this.evt.options.stage != 'local') {
        return BbPromise.reject(new SError('Stage ' + _this.evt.options.stage + ' does not exist in your project'));
      }

      // Skip the next validation if stage is 'local' & region is 'all'
      if (_this.evt.options.type === 'region' && _this.evt.options.stage != 'local' && _this.evt.options.region != 'all') {

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
          type   = this.evt.options.type,
          stage  = this.evt.options.stage,
          region = this.evt.options.region,
          project = S.getProject();

      switch (type) {
      case 'common':
        _.unset(project.getVariables(), _this.evt.options.key);
        project.save();
        break;
      case 'stage':
        _.unset(project.getStage(stage).getVariables(), _this.evt.options.key);
        project.getStage(stage).save();
        break;
      case 'region':
        _.unset(S.getProject().getRegion(stage, region).getVariables(), _this.evt.options.key);
        S.getProject().getRegion(stage, region).save();
        break;
      }

    }

  }

  return( VariablesUnset );
};
