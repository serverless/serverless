'use strict';

const SError   = require('./Error'),
  SCli         = require('./utils/cli'),
  path         = require('path'),
  BbPromise    = require('bluebird');

module.exports = function(S) {

  /**
   * This is the base class that all Serverless Plugins should extend.
   */

  class Plugin {

    /**
     * Constructor
     */

    constructor() {
      this._class = 'Plugin';
    }

    /**
     * Define your plugins name
     */

    static getName() {
      return this.name;
    }
    getName() {
      return this.constructor.getName();
    }

    /**
     * Register Actions
     */

    registerActions() {
      return BbPromise.resolve();
    }

    /**
     * Register Hooks
     */

    registerHooks() {
      return BbPromise.resolve();
    }

    /**
     * Get sPath From CWD
     * - Gets the sPath of the cwd, if any.
     * - Returns false if project root or outside project
     */

    getSPathFromCwd(projectPath) {

      let cwd = process.cwd();

      // Check if in project
      if (cwd.indexOf(projectPath) == -1) return false;

      // Strip project path from cwd
      cwd = cwd.replace(projectPath, '').split(path.sep);

      cwd.shift();

      if (cwd.length > 0) {
        return path.join.apply(path, cwd)
      }

      return false;
    }

    /**
     * CLI: Prompt Input
     * - Handy CLI Prompt Input function for Plugins
     * @param promptSchema @see https://github.com/flatiron/prompt#prompting-with-validation-default-values-and-more-complex-properties
     * @param overrides map {key: 'overrideValue'}
     * @returns {Promise} containing answers by key
     */

    cliPromptInput(promptSchema, overrides) {
      if (S.config.interactive) { //CLI
        let Prompter = SCli.prompt();
        Prompter.override = overrides;
        return Prompter.getAsync(promptSchema);
      } else {
        return BbPromise.resolve(); //in non interactive mode. All options must be set programatically
      }
    }

    /**
     * CLI: Prompt Select
     * - Handy CLI Select Input function for Plugins
     * @param message string
     * @param choices [{key:"",value:"",label:""}]
     * @param multi boolean
     * @param doneLabel string optional
     * @returns {Promise} containing [{value:'blah'},..]
     */

    cliPromptSelect(message, choices, multi, doneLabel) {
      if (S.config.interactive) { //CLI
        return SCli.select(message, choices, multi, doneLabel);
      } else if (S.isWebInterface) {
        //TODO: implement
        return BbPromise.reject(new SError('Not implemented', SError.errorCodes.UNKNOWN));
      } else {
        return BbPromise.reject(new SError('You must specify all necessary options when in a non-interactive mode', SError.errorCodes.UNKNOWN));
      }
    }

    /**
     * CLI: Prompt Select Stage
     */

    cliPromptSelectStage(message, stage, addLocalStage) {

      let _this = this;

      // Validate: Skip if not interactive
      if (!S.config.interactive) return BbPromise.resolve(stage);

      // Skip stage if provided
      if (stage) return BbPromise.resolve(stage);

      let stages = S.getProject().getAllStages();

      // if private has 1 stage, skip prompt
      if (stages.length === 1) {
        return BbPromise.resolve(stages[0].getName());
      }

      if (addLocalStage) stages.push('local');

      // Create Choices
      let choices = [];
      for (let i = 0; i < stages.length; i++) {
        choices.push({
          key: (i + 1) + ') ',
          value: stages[i].getName(),
          label: stages[i].getName()
        });
      }

      return SCli.select(message, choices, false)
        .then(function (results) {
          return results[0].value;
        });
    }

    /**
     * CLI: Prompt Select Region
     */

    cliPromptSelectRegion(message, addAllRegions, existing, region, stage) {

      let _this = this;

      // Resolve region if provided
      if (region) return BbPromise.resolve(region);

      // Resolve region if local stage
      if (stage === 'local') return BbPromise.resolve('local');

      // If stage has one region, skip prompt and return that instead
      if (stage && S.getProject().getAllRegions(stage).length === 1 && existing) {
        return BbPromise.resolve(S.getProject().getAllRegions(stage)[0].name);
      }

      // Skip if not interactive or stage is local
      if (!S.config.interactive || stage === 'local') return BbPromise.resolve();

      let regionChoices = S.getProvider().validRegions;

      // if stage is provided, limit region list
      if (stage) {

        // Make sure stage exists in project
        if (!S.getProject().validateStageExists(stage)) {
          return BbPromise.reject(new SError('Stage ' + stage + ' does not exist in your project', SError.errorCodes.UNKNOWN));
        }

        // if we only want the region that exist in stage
        if (existing) {

          // List only regions in stage
          regionChoices = [];
          S.getProject().getAllRegions(stage).forEach(function (region) {
            regionChoices.push(region.name)
          });
        } else {

          // Make sure there are regions left in stage
          if (S.getProject().getAllRegions(stage).length === S.getProvider('aws').validRegions.length) {
            return BbPromise.reject(new SError('Stage ' + stage + ' already have all possible regions.', SError.errorCodes.UNKNOWN));
          }

          // List only regions NOT in stage
          S.getProject().getAllRegions(stage).forEach(function (regionInStage) {
            let index = regionChoices.indexOf(regionInStage.name);
            regionChoices.splice(index, 1);
          });
        }
      }

      let choices = [];

      if (addAllRegions) {
        choices.push(
          {
            key: '',
            value: 'all',
            label: 'all'
          }
        );
      }

      regionChoices.forEach(function (r) {
        choices.push({
          key: '',
          value: r,
          label: r
        });
      });

      return _this.cliPromptSelect(message, choices, false)
        .then(results => {
          return results[0].value;
        });
    }

    static validateName(name) {
      return /^[a-zA-Z\d\-]+$/.test(name);
    }

  }

  return Plugin;

};

