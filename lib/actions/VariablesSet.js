'use strict';

/**
 * Action: VariablesSet
 * - Defines a new variable that can be used in any of your project's configuration files
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

  class VariablesSet extends S.classes.Plugin {

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
      S.addAction(this.variablesSet.bind(this), {
        handler:       'variablesSet',
        description:   'Defines a new variable that can be used in any of your project\'s configuration files. Usage: serverless variables set',
        context:       'variables',
        contextAction: 'set',
        options:       [
          {
            option:      'type',
            shortcut:    't',
            description: 'variable type (common, stage or region)'
          },
          {
            option:      'region',
            shortcut:    'r',
            description: 'region you want to set the variable in'
          },
          {
            option:      'stage',
            shortcut:    's',
            description: 'stage you want to set the variable in'
          },
          {
            option:      'key',
            shortcut:    'k',
            description: 'the key of the variable you want to set'
          },
          {
            option:      'value',
            shortcut:    'v',
            description: 'the value of the variable you want to set'
          }
        ]
      });
      return BbPromise.resolve();
    }

    /**
     * Action
     */

    variablesSet(evt) {

      let _this    = this;
      _this.evt    = evt;

      return _this._prompt()
          .bind(_this)
          .then(_this._validateAndPrepare)
          .then(_this._setVariable)
          .then(function() {
            
            SCli.log('Successfully set variable: ' + _this.evt.options.key);

            return _this.evt;
          });
    }

    /**
     * Prompt key, value, stage and region
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
              description: 'Enter variable key to set a value to: '.yellow,
              required:    true
            };

            return _this.cliPromptInput(prompts, { key: _this.evt.options.key })
                .then(function(answers) {
                  _this.evt.options.key = answers.key;
                });
          })
          .then(function() {

            // Skip if value is provided already
            if (_this.evt.options.value) return;

            let prompts = {
              properties: {}
            };

            prompts.properties.value = {
              description: 'Enter variable value to set a value to: '.yellow,
              required:    true
            };

            return _this.cliPromptInput(prompts, { value: _this.evt.options.value })
                .then(function(answers) {
                  _this.evt.options.value = answers.value;
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
            return _this.cliPromptSelectStage('Select a stage to set your variable in: ', _this.evt.options.stage, false)
                .then(stage => {
                  _this.evt.options.stage = stage;
                })
          })
          .then(function() {
            if (_this.evt.options.type !== "region") {
              return BbPromise.resolve();
            }
            return _this.cliPromptSelectRegion('Select a region to set variable in: ', false, true, _this.evt.options.region, _this.evt.options.stage)
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
        const paramsOk = (!!_this.evt.options.type && !!_this.evt.options.key && !!_this.evt.options.value) &&
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
     * Set the variable and save it
     */

    _setVariable() {

      let _this  = this,
          type  = this.evt.options.type,
          stage  = this.evt.options.stage,
          region = this.evt.options.region,
          project = S.getProject();

      let setVariableHelper = (region) => {

        let v = {};
        v[_this.evt.options.key] = _this.evt.options.value;

        region.addVariables(v);
        region.save();
      };

      let v = {};
      v[_this.evt.options.key] = _this.evt.options.value;

      switch (type) {
      case 'common':
        project.addVariables(v);
        project.save();
        break;
      case 'stage':
        project.getStage(stage).addVariables(v);
        project.getStage(stage).save();
        break;
      case 'region':
        S.getProject().getRegion(stage, region).addVariables(v);
        S.getProject().getRegion(stage, region).save();
        break;
      }
    }

  }

  return( VariablesSet );
};
