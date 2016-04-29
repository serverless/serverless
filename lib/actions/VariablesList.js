'use strict';

/**
 * Action: VariablesList
 * - List all variables defined in your project.
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

  class VariablesList extends S.classes.Plugin {

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
      S.addAction(this.variablesList.bind(this), {
        handler:       'variablesList',
        description:   'List all variables defined in your project. Usage: serverless variables list',
        context:       'variables',
        contextAction: 'list',
        options:       [
          {
            option:      'region',
            shortcut:    'r',
            description: 'region you want to list variables from'
          },
          {
            option:      'stage',
            shortcut:    's',
            description: 'stage you want to list variables from'
          },
          {
            option:      'all',
            shortcut:    'a',
            description: 'list all available variables'
          }
        ]
      });
      return BbPromise.resolve();
    }

    /**
     * Action
     */

    variablesList(evt) {

      let _this    = this;
      _this.evt    = evt;

      return _this._prompt()
          .bind(_this)
          .then(_this._validateAndPrepare)
          .then(_this._listVariables)
          .then(function() {
            return _this.evt;
          });
    }

    /**
     * Prompt key, value, stage and region
     */
    _prompt() {
      let _this = this;

      if (!S.config.interactive || _this.evt.options.all) return BbPromise.resolve();

      return BbPromise.try(function() {
          return _this.cliPromptSelectStage('Select a stage: ', _this.evt.options.stage, false)
                .then(stage => {
                  _this.evt.options.stage = stage;
                });
          })
          .then(function() {
            return _this.cliPromptSelectRegion('Select a region: ', false, true, _this.evt.options.region, _this.evt.options.stage)
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
        if (!_this.evt.options.all && (!_this.evt.options.stage || !_this.evt.options.region)) {
          return BbPromise.reject(new SError('Missing stage and/or region'));
        }
      }

      if (_this.evt.options.all) {
        _this.evt.options.region = 'all';
      } else {
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
    }

    /**
     * Set the variable and save it
     */

    _listVariables() {

      let _this  = this,
          stage  = this.evt.options.stage,
          region = this.evt.options.region,
          all    = this.evt.options.all;

      let listRegionVariableHelper = (region) => {

        let variables = region.getVariables();
        SCli.log('  ' + region.getName() + ':');
        for (var variable in variables) {
          if (!_.startsWith(variable, '_') && _.has(variables, variable)) {
            SCli.log('    ' + variable + ' = "' + variables[variable] + '"');
          }
        }
      };

      let listStageVariableHelper = (stage) => {

        let variables = stage.getVariables();
        SCli.log(stage.getName());
        for (var variable in variables) {
          if (!_.startsWith(variable, '_') && _.has(variables, variable)) {
            SCli.log('  ' + variable + ' = "' + variables[variable] + '"');
          }
        }
      };

      if (all) {
        S.getProject().getAllStages().forEach(stage => {
          listStageVariableHelper(stage);
          S.getProject().getAllRegions(stage.getName()).forEach(function (region) {
            listRegionVariableHelper(region);
          });
        });
      } else if (region != 'all' || stage == 'local') {  //single region
        if (stage == 'local') {
          region = 'local';
        }

        listStageVariableHelper(S.getProject().getStage(stage));
        listRegionVariableHelper(S.getProject().getRegion(stage, region));
      } else {
        // All regions
        listStageVariableHelper(S.getProject().getStage(stage));
        S.getProject().getAllRegions(stage).forEach(function (region) {
          listRegionVariableHelper(region);
        });
      }
    }

  }

  return( VariablesList );
};
