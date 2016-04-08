'use strict';

/**
 * Action: Function Remove
 * - Loops sequentially through each Region in specified Stage
 * - Removes Function Code
 */

module.exports = function(S) {

  const path  = require('path'),
    SUtils    = S.utils,
    SError    = require(S.getServerlessPath('Error')),
    SCli      = require(S.getServerlessPath('utils/cli')),
    BbPromise = require('bluebird'),
    _         = require('lodash');

  class FunctionRemove extends S.classes.Plugin {

    /**
     * Get Name
     */

    static getName() {
      return 'serverless.core.' + this.name;
    }

    /**
     * Register Plugin Actions
     */

    registerActions() {

      S.addAction(this.functionRemove.bind(this), {
        handler:       'functionRemove',
        description:   'Removes the deployed function, its endpoints and events.',
        context:       'function',
        contextAction: 'remove',
        options:       [
          {
            option:      'stage',
            shortcut:    's',
            description: 'Optional if only one stage is defined in project'
          }, {
            option:      'region',
            shortcut:    'r',
            description: 'Optional - Target one region to remove from. By default: all regions.'
          }, {
            option:      'all',
            shortcut:    'a',
            description: 'Optional - Remove all Functions'
          }
        ],
        parameters: [
          {
            parameter: 'names', // Only accepting paths makes it easier for plugin developers.
            description: 'One or multiple function names',
            position: '0->'
          }
        ]
      });

      return BbPromise.resolve();
    }

    /**
     * Function Deploy
     */

    functionRemove(evt) {
      this.evt = evt;

      // Instantiate Classes
      this.project  = S.getProject();

      if (!this.project.getAllStages().length) return BbPromise.reject(new SError('No existing stages in the project'));

      // Flow

      return this._prompt()
        .bind(this)
        .then(this._validateAndPrepare)
        .then(this._processRemoval)
        .then(() => {

          // Line for neatness
          SCli.log('------------------------');

          // Display Failed Function Removes
          if (this.failed) {
            SCli.log(`Failed to remove the following functions in "${this.evt.options.stage}" from the following regions:`);
            // Display Errors
            _.each(this.failed, (failed, region) => {
              SCli.log(region + ' ------------------------');
              _.each(failed, (result) => {
                SCli.log(`  ${result.name}: ${result.message}`);
                SUtils.sDebug(result.stack);
              });
            });
          }

          // Display Successful Function Remove
          if (this.removed) {
            // Status
            SCli.log(`Successfully removed functions in "${this.evt.options.stage}" from the following regions:`);

            // Display Functions & ARNs
            _.each(this.removed, (removed, region) => {
              SCli.log(region + ' ------------------------');
              _.each(removed, (result) => SCli.log(`  ${result.name}(${result.functionName}): ${result.Arn}`));
            });
          }

          /**
           * Return EVT
           */

          this.evt.data.removed = this.removed;
          this.evt.data.failed  = this.failed;
          return this.evt;

        });
    }

    _prompt() {
      if (!S.config.interactive || this.evt.options.stage) return BbPromise.resolve();
      return this.cliPromptSelectStage('Function Remove - Choose a stage: ', this.evt.options.stage, false)
        .then(stage => this.evt.options.stage = stage);
    }

    /**
     * Validate And Prepare
     * - If CLI, maps CLI input to event object
     */

    _validateAndPrepare() {

      // Set Defaults
      this.evt.options.stage           = this.evt.options.stage || null;
      // this.evt.options.aliasFunction   = this.evt.options.aliasFunction ? this.evt.options.aliasFunction : null;

      // Validate Stage
      if (!this.evt.options.stage) throw new SError(`Stage is required`);

      // Set Deploy Regions
      this.regions  = this.evt.options.region ? [this.evt.options.region] : this.project.getAllRegionNames(this.evt.options.stage);


      this.functions = _.map(this.evt.options.names, (name) => {
        let func = this.project.getFunction(name);
        if (!func) throw new SError(`Function "${name}" doesn't exist in your project`);
        return func;
      });

      // If CLI and no function names targeted, remove from CWD
      if (S.cli && !this.functions.length && !this.evt.options.all) {

        this.functions = SUtils.getFunctionsByCwd(this.project.getAllFunctions());
      }

      // If --all is selected, load all paths
      if (this.evt.options.all) {
        this.functions = this.project.getAllFunctions();
      }

      return BbPromise.resolve();
    }

    _processRemoval() {
      // Status
      SCli.log(`Removing functions in "${this.evt.options.stage}" from the following regions: ${this.regions.join(', ')}`);

      const spinner = SCli.spinner();
      spinner.start();

      return BbPromise
        .map(this.regions, this._removeByRegion.bind(this))
        .then(() => spinner.stop(true)); // Stop Spinner
    }

    _removeByRegion(region) {
      return BbPromise.map(this.functions, ((func) => this._functionRemove(func, region)), {concurrency: 5});
    }

    _functionRemove(func, region) {
      const stage   = this.evt.options.stage;

      if (!this.project.validateRegionExists(stage, region)) {
        return BbPromise.reject(new SError(`Stage "${stage}" or region "${region}" is not found.`));
      }

      const FunctionName = func.getDeployedName({stage, region}),
            aws          = S.getProvider('aws');

      let functionVersion, lambdaAliasArn;

      return func.getAllEndpoints().length && S.actions.endpointRemove({
          options: {
            stage,
            region,
            names:  _.map(func.getAllEndpoints(), (e) => e.path + '~' + e.method)
          }
        })
        .then(() => {
          return func.getAllEvents().length && S.actions.eventRemove({
            options: {
              stage,
              region,
              names:  _.map(func.getAllEvents(), 'name')
            }
          });
        })
        .then(() => aws.request('Lambda', 'getAlias', {FunctionName, Name: stage}, stage, region))
        .then(reply => {
          functionVersion = reply.FunctionVersion;
          lambdaAliasArn = reply.AliasArn;
          return aws.request('Lambda', 'deleteAlias', {FunctionName, Name: stage}, stage, region)
        })
        .then(() => {
          const Qualifier = functionVersion;
          return aws.request('Lambda', 'deleteFunction', {FunctionName, Qualifier}, stage, region)
        })
        .then((result) => {
          // Add Function and Region
          this.removed || (this.removed = {});
          this.removed[region] || (this.removed[region] = []);

          this.removed[region].push({
            functionName: FunctionName,
            name:         func.getName(),
            Arn:          lambdaAliasArn
          });

        })
        .catch((e) => {
          this.failed || (this.failed = {});
          this.failed[region] || (this.failed[region] = []);

          this.failed[region].push({
            function: func,
            name:     func.getName(),
            message:  e.message,
            stack:    e.stack
          });
        });

    }
  }

  return FunctionRemove;
};
