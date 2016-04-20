'use strict';

/**
 * Action: Function Deploy
 * - Deploys Function Code
 * - Validates Function paths
 * - Loops sequentially through each Region in specified Stage
 * - Passes Function paths to Sub-Actions for deployment
 * - Handles concurrent processing of Sub-Actions for faster deploys
 */

module.exports = function(S) {

  const path   = require('path'),
    SError     = require(S.getServerlessPath('Error')),
    SCli       = require(S.getServerlessPath('utils/cli')),
    SUtils     = S.utils,
    BbPromise  = require('bluebird'),
    fse        = BbPromise.promisifyAll(require('fs-extra'));

  class FunctionDeploy extends S.classes.Plugin {

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

      S.addAction(this.functionDeploy.bind(this), {
        handler:       'functionDeploy',
        description:   'Deploys the code or endpoint of a function, or both',
        context:       'function',
        contextAction: 'deploy',
        options:       [
          {
            option:      'stage',
            shortcut:    's',
            description: 'Optional if only one stage is defined in project'
          }, {
            option:      'region',
            shortcut:    'r',
            description: 'Optional - Target one region to deploy to'
          }, {
            option:      'functionAlias', // TODO: Implement
            shortcut:    'f',
            description: 'Optional - Provide a custom Alias to your Functions'
          }, {
            option:      'all',
            shortcut:    'a',
            description: 'Optional - Deploy all Functions'
          }
          , {
            option:      'dontRemoveTmp',
            shortcut:    't',
            description: 'Optional - Do not remove `_tmp` folder'
          }
        ],
        parameters: [
          {
            parameter: 'names', // Only accepting paths makes it easier for plugin developers.  Otherwise, people should use dash deploy
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

    functionDeploy(evt) {

      let _this     = this;
      _this.evt     = evt;

      // Flow
      return new BbPromise(function(resolve, reject) {

        // Prompt: Stage
        if (!S.config.interactive || _this.evt.options.stage) return resolve();

        if (!S.getProject().getAllStages().length) return reject(new SError('No existing stages in the project'));

        return _this.cliPromptSelectStage('Function Deployer - Choose a stage: ', _this.evt.options.stage, false)
          .then(stage => {
            _this.evt.options.stage = stage;
            return resolve();
          })
      })
        .bind(_this)
        .then(_this._validateAndPrepare)
        .then(_this._processDeployment)
        .then(_this._removeTmpFolder)
        .then(function() {

          // Line for neatness
          SCli.log('------------------------');

          // Display Failed Function Deployments
          if (_this.failed) {
            SCli.log('Failed to deploy the following functions in "'
              + _this.evt.options.stage
              + '" to the following regions:');
            // Display Errors
            for (let i = 0; i < Object.keys(_this.failed).length; i++) {
              let region = _this.failed[Object.keys(_this.failed)[i]];
              SCli.log(Object.keys(_this.failed)[i] + ' ------------------------');
              for (let j = 0; j < region.length; j++) {
                SCli.log('  ' + region[j].functionName + ': ' + region[j].message );
                SUtils.sDebug(region[j].stack);
              }
            }

            // Throw error for CI
            throw new SError('Function Deployment Failed');
          }

          // Display Successful Function Deployments
          if (_this.deployed) {

            // Status
            SCli.log('Successfully deployed the following functions in "'
              + _this.evt.options.stage
              + '" to the following regions: ');

            // Display Functions & ARNs
            for (let i = 0; i < Object.keys(_this.deployed).length; i++) {
              let region = _this.deployed[Object.keys(_this.deployed)[i]];
              SCli.log(Object.keys(_this.deployed)[i] + ' ------------------------');
              for (let j = 0; j < region.length; j++) {
                SCli.log('  ' + region[j].functionName + ' (' + region[j].lambdaName + '): ' + region[j].Arn );
              }
            }
          }

          /**
           * Return EVT
           */

          _this.evt.data.deployed = _this.deployed;
          _this.evt.data.failed   = _this.failed;
          delete(_this.deployed);
          delete(_this.failed);
          return _this.evt;

        });
    }

    /**
     * Validate And Prepare
     * - If CLI, maps CLI input to event object
     */

    _validateAndPrepare() {

      let _this = this;

      // Set Defaults
      _this.functions = [];
      _this.evt.options.names           = _this.evt.options.names ? _this.evt.options.names : [];
      _this.evt.options.stage           = _this.evt.options.stage ? _this.evt.options.stage : null;
      _this.evt.options.functionAlias   = _this.evt.options.functionAlias ? _this.evt.options.functionAlias : null;

      // Instantiate Classes
      _this.project  = S.getProject();

      // Set and check deploy Regions (check for undefined as region could be "false")
      if (_this.evt.options.region && S.getProvider().validRegions.indexOf(_this.evt.options.region) <= -1) {
        return BbPromise.reject(new SError('Invalid region specified'));
      }

      _this.regions  = _this.evt.options.region ? [_this.evt.options.region] : S.getProject().getAllRegionNames(_this.evt.options.stage);

      if (_this.evt.options.names.length) {
        _this.evt.options.names.forEach(function(name) {
          let func = _this.project.getFunction(name);
          if (!func) throw new SError(`Function "${name}" doesn't exist in your project`);
          _this.functions.push(_this.project.getFunction(name));
        });
      }

      // If CLI and no function names targeted, deploy from CWD
      if (S.cli &&
        !_this.evt.options.names.length &&
        !_this.evt.options.all) {
        _this.functions = SUtils.getFunctionsByCwd(S.getProject().getAllFunctions());
      }

      // If --all is selected, load all paths
      if (_this.evt.options.all) {
        _this.functions = S.getProject().getAllFunctions();
      }

      // Ensure tmp folder exists in _meta
      if (!SUtils.dirExistsSync(S.getProject().getRootPath('_meta', '_tmp'))) {
        fse.mkdirSync(S.getProject().getRootPath('_meta', '_tmp'));
      }

      if (_this.functions.length === 0) throw new SError(`You don't have any functions in your project`);

      // Validate Stage
      if (!_this.evt.options.stage) throw new SError(`Stage is required`);

      return BbPromise.resolve();
    }

    /**
     * Process Deployment
     */

    _processDeployment() {

      // Status
      SCli.log(`Deploying the specified functions in "${this.evt.options.stage}" to the following regions: ${this.regions.join(', ')}`);

      this._spinner = SCli.spinner();
      this._spinner.start();

      return BbPromise
        // Deploy Function Code in each region
        .each(this.regions, (region) => this._deployCodeByRegion(region))
        .then(() => S.utils.sDebug(`code deployment is done`))
        // Stop Spinner
        .then(() => this._spinner.stop(true));
    }

    /**
     * Deploy Code By Region
     */

    _deployCodeByRegion(region) {
      /**
       *  Package, Upload, Deploy, Alias functions' code concurrently
       *  - Package must be redone for each region because ENV vars and IAM Roles are set for each region
       */

      const deployFunc = (func) => {
        let newEvt = {
          options: {
            stage:   this.evt.options.stage,
            region:  region,
            name:    func.name
          }
        };

        // Package Code
        return S.actions.codePackageLambda(newEvt)
          .then((result) => {
            S.utils.sDebug(`codePackageLambda is done`);

            let newEvt = {
              options: {
                stage:         result.options.stage,
                region:        result.options.region,
                name:          func.name,
                functionAlias: this.evt.options.functionAlias,
                pathDist:      result.data.pathDist
              }
            };

            return S.actions.codeDeployLambda(newEvt);
          })
          .then((result) => {

            // Add Function and Region
            if (!this.deployed)         this.deployed         = {};
            if (!this.deployed[region]) this.deployed[region] = [];

            this.deployed[region].push({
              lambdaName:   result.data.functionName,
              functionName: func.name,
              Arn:          result.data.functionAliasArn
            });
          })
          .catch((e) => {

            // Stash Failed Function Code
            if (!this.failed)         this.failed = {};
            if (!this.failed[region]) this.failed[region] = [];
            this.failed[region].push({
              functionName:   func.name,
              message:    e.message,
              stack:      e.stack
            });
          });
      }

      return BbPromise.map(this.functions, deployFunc, {concurrency: 5})
    }

    _removeTmpFolder() {
      if (!this.evt.options.dontRemoveTmp) {
        SUtils.sDebug('Removing `_tmp` folder');
        return fse.removeAsync(S.getProject().getRootPath('_meta', '_tmp'));
      } else {
        SCli.log('Skipping `_tmp` folder removal');
      }
    }
  }

  return( FunctionDeploy );
};
