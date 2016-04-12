'use strict';

/**
 * Action: Function Rollback
 * - Rollbacks the deployed function from one version to another.
 */

module.exports = function(S) {

  const path  = require('path'),
    SUtils    = S.utils,
    SError    = require(S.getServerlessPath('Error')),
    SCli      = require(S.getServerlessPath('utils/cli')),
    BbPromise = require('bluebird'),
    moment    = require('moment'),
    chalk     = require('chalk'),
    _         = require('lodash');

  class FunctionRollback extends S.classes.Plugin {

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

      S.addAction(this.functionRollback.bind(this), {
        handler:       'functionRollback',
        description:   'Rollbacks the deployed function from one version to another.',
        context:       'function',
        contextAction: 'rollback',
        options:       [
          {
            option:      'stage',
            shortcut:    's',
            description: 'Optional if only one stage is defined in project'
          }, {
            option:      'region',
            shortcut:    'r',
            description: 'Optional if only one region is defined in stage'
          }, {
            option:      'maxItems',
            shortcut:    'm',
            description: 'Optional - Maximum versions to show. By default: 50'
          }, {
            option:      'version',
            shortcut:    'v',
            description: 'Optional - A function version to rollback.'
          },
        ],
        parameters: [
          {
            parameter: 'name',
            description: 'A function name to rollback',
            position: '0'
          }
        ]
      });

      return BbPromise.resolve();
    }

    /**
     * Function Deploy
     */

    functionRollback(evt) {
      this.evt = evt;

      // Instantiate Classes
      this.project  = S.getProject();
      this.provider = S.getProvider('aws');

      if (!this.project.getAllStages().length) return BbPromise.reject(new SError('No existing stages in the project'));

      // Flow

      return this._prompt()
        .bind(this)
        .then(this._validateAndPrepare)
        .then(this._rollback)
        .then(() => {

          /**
           * Return EVT
           */

          return this.evt;

        });
    }

    _prompt() {
      if (!S.config.interactive || this.evt.options.stage) return BbPromise.resolve();
      return this.cliPromptSelectStage('Function Rollback - Choose a stage: ', this.evt.options.stage, false)
        .then(stage => this.evt.options.stage = stage)
        .then(() => this.cliPromptSelectRegion('Select a region: ', false, true, this.evt.options.region, this.evt.options.stage) )
        .then(region => this.evt.options.region = region);
    }

    /**
     * Validate And Prepare
     * - If CLI, maps CLI input to event object
     */

    _validateAndPrepare() {

      // Set Defaults
      this.evt.options.stage    = this.evt.options.stage || null;
      this.evt.options.maxItems = this.evt.options.maxItems || 50;
      // this.evt.options.aliasFunction   = this.evt.options.aliasFunction ? this.evt.options.aliasFunction : null;

      // Validate Stage
      if (!this.evt.options.stage) throw new SError(`Stage is required`);
      if (!this.evt.options.region) throw new SError(`Region is required`);

      if (this.evt.options.name) {
        this.func = this.project.getFunction(this.evt.options.name);
        if (!this.func) throw new SError(`Function "${this.evt.options.name}" doesn't exist in your project`);
      }

      // If CLI and no function names targeted, remove from CWD
      if (S.cli && !this.func) {
        if (!SUtils.fileExistsSync(path.join(process.cwd(), 's-function.json'))) {
          throw new SError(`Please provide a function name or run the command in a function folder.`);
        }
        this.func = SUtils.getFunctionsByCwd(this.project.getAllFunctions())[0];
      }

      return BbPromise.resolve();
    }

    _listVersions() {
      const stage        = this.evt.options.stage,
            region       = this.evt.options.region,
            FunctionName = this.func.getDeployedName({stage, region}),
            Role         = this.project.getRegion(stage, region).getVariables().iamRoleArnLambda;

      const getVersions  = (versions, Marker) => {
        versions = versions || [];

        return this.provider
          .request('Lambda', 'listVersionsByFunction', {FunctionName, Marker}, stage, region)
          .then((reply) => {
            versions = versions.concat(reply.Versions);
            if (reply.NextMarker) return getVersions(versions, reply.NextMarker);
            return versions;
          });
      };

      return getVersions()
        .then((versions) => {
          return _.chain(versions)
            .reject({Version: '$LATEST'})
            .filter({Role}) // Role is the stage specific property. There is no other way to get versions by stage.
            .orderBy('Version', 'desc')
            .take(this.evt.options.maxItems)
            .value();
        });
    }

    _getDeployedFunction() {
      const stage        = this.evt.options.stage,
            region       = this.evt.options.region,
            params       = {
              FunctionName: this.func.getDeployedName({stage, region}),
              Qualifier: stage
            };
      return this.provider.request('Lambda', 'getFunction', params, stage, region)
        .then((res) => res.Configuration);
    }

    _rollback() {
      const stage   = this.evt.options.stage,
            region  = this.evt.options.region,
            spinner = SCli.spinner();

      spinner.start(`Loading versions for function "${this.func.getName()}" for stage "${stage}" in region "${region}"`);

      return BbPromise.all([this._getDeployedFunction(), this._listVersions()])
        .spread((deployedFunction, versions) => {
          spinner.stop()

          if (_.isEmpty(versions)) throw new SError(`There is no versions for function "${this.func.getName()}" for stage "${stage}" in region "${region}"`);

          return BbPromise.try(() => {
            if (this.evt.options.version) {
              return _.find(versions, {Version: this.evt.options.version.toString()})
            } else {
              let choices = _.map(versions, (v) => {
                let isCurrentText = '';
                if (v.Version === deployedFunction.Version) isCurrentText = chalk.yellow('(current)')
                let label = `v${v.Version} - ${moment(v.LastModified).format('LLL')} ${isCurrentText}`
                return {label, value: v};
              });
              console.log('')
              return this.cliPromptSelect('Select a version to rollback:', choices)
                .then(item => item[0].value)
            }
          })
          .then((rollbackTo) => {
            let params = {
              FunctionName: rollbackTo.FunctionName,
              Name: stage,
              FunctionVersion: rollbackTo.Version,
            };

            if (rollbackTo.Version === deployedFunction.Version) throw new SError(`Selected version is the currently deployed version.`);
            spinner.start(`Rolling back function "${this.func.getName()}" to v${rollbackTo.Version}`);
            return this.provider.request('Lambda', 'updateAlias', params, stage, region)
              .then((reply) => {
                spinner.stop();

                console.log('');

                if (reply.FunctionVersion === rollbackTo.Version) {
                  SCli.log(chalk.green(`Function "${this.func.getName()}" has been successfully rolled back from v${deployedFunction.Version} to v${rollbackTo.Version}`));
                  this.evt.data.rollbackFrom = deployedFunction.Version;
                  this.evt.data.rollbackTo = rollbackTo.Version;
                  return this.evt
                } else {
                  SCli.log(chalk.red(`Failed`));
                  SCli.log('Run this again with --debug to get more error information...');
                  SUtils.sDebug(reply);
                }
              });
          });
      });
    }

   }

  return FunctionRollback;
};
