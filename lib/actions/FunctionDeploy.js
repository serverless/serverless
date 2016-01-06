'use strict';

/**
 * Action: Function Deploy
 * - Deploys Function Code
 * - Validates Function paths
 * - Loops sequentially through each Region in specified Stage
 * - Passes Function paths to Sub-Actions for deployment
 * - Handles concurrent processing of Sub-Actions for faster deploys
 */

module.exports = function(SPlugin, serverlessPath) {

  const path     = require('path'),
    SError       = require(path.join(serverlessPath, 'ServerlessError')),
    SUtils       = require(path.join(serverlessPath, 'utils/index')),
    SCli         = require(path.join(serverlessPath, 'utils/cli')),
    BbPromise    = require('bluebird'),
    async        = require('async'),
    fs           = require('fs');

  // Promisify fs module
  BbPromise.promisifyAll(fs);

  class FunctionDeploy extends SPlugin {

    /**
     * Constructor
     */

    constructor(S, config) {
      super(S, config);
    }

    /**
     * Get Name
     */

    static getName() {
      return 'serverless.core.' + FunctionDeploy.name;
    }

    /**
     * Register Plugin Actions
     */

    registerActions() {

      this.S.addAction(this.functionDeploy.bind(this), {
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
            option:      'aliasFunction', // TODO: Implement
            shortcut:    'f',
            description: 'Optional - Provide a custom Alias to your Functions'
          }
        ],
        parameters: [
          {
            parameter: 'paths',
            description: 'One or multiple paths to your function',
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
      return new BbPromise(function(resolve) {

        // Prompt: Stage
        if (!_this.S.config.interactive || _this.evt.options.stage) return resolve();

        return _this.cliPromptSelectStage('Function Deployer - Choose a stage: ', _this.evt.options.stage, false)
          .then(stage => {
            _this.evt.options.stage = stage;
            return resolve();
          })
      })
        .bind(_this)
        .then(_this._validateAndPrepare)
        .then(_this._processDeployment)
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
                SCli.log('  ' + region[j].module + '/' + region[j].function + ': ' + region[j].message );
                SUtils.sDebug(region[j].stack);
              }
            }
          }

          // Display Successful Function Deployments
          if (_this.deployed) {

            // Status
            SCli.log('Successfully deployed functions in "'
              + _this.evt.options.stage
              + '" to the following regions: ');

            // Display Functions & ARNs
            for (let i = 0; i < Object.keys(_this.deployed).length; i++) {
              let region = _this.deployed[Object.keys(_this.deployed)[i]];
              SCli.log(Object.keys(_this.deployed)[i] + ' ------------------------');
              for (let j = 0; j < region.length; j++) {
                SCli.log('  ' + region[j].module + '/' + region[j].function + ': ' + region[j].Arn );
              }
            }
          }

          /**
           * Return EVT
           */

          _this.evt.data.deployed = _this.deployed;
          _this.evt.data.failed   = _this.failed;
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
      _this.evt.options.stage           = _this.evt.options.stage ? _this.evt.options.stage : null;
      _this.evt.options.paths           = _this.evt.options.paths ? _this.evt.options.paths : [];
      _this.evt.options.aliasFunction   = _this.evt.options.aliasFunction ? _this.evt.options.aliasFunction : null;

      // Instantiate Classes
      _this.project    = new _this.S.classes.Project(_this.S);
      _this.meta       = new _this.S.classes.Meta(_this.S);

      // Set Deploy Regions
      _this.regions    = _this.evt.options.region ? [_this.evt.options.region] : Object.keys(_this.meta.data.private.stages[_this.evt.options.stage].regions);

      if (!_this.evt.options.paths.length) {
        let CWD = process.cwd(),
            isModule  = SUtils.fileExistsSync(path.join(CWD, 's-module.json')) || SUtils.fileExistsSync(path.join(CWD, '..', 's-module.json')),
            isFunction = SUtils.fileExistsSync(path.join(CWD, 's-function.json'));

          if (isModule) {
            let moduleName;
            try {
              moduleName = SUtils.readAndParseJsonSync(path.join(CWD, 's-module.json')).name;
            } catch (e) {
              moduleName = SUtils.readAndParseJsonSync(path.join(CWD, '..', 's-module.json')).name;
            }

            let functionList = fs.readdirSync(path.join(_this.S.config.projectPath, 'back', 'modules', moduleName, 'functions'));
            functionList.forEach(function(functionName) {
              _this.evt.options.paths.push(moduleName + path.sep + functionName);
            });

          } else if (isFunction) {
              let functionName = SUtils.readAndParseJsonSync(path.join(CWD, 's-function.json')).name;
              let moduleName   = SUtils.readAndParseJsonSync(path.join(CWD, '..', '..', 's-module.json')).name;
              _this.evt.options.paths.push(moduleName + path.sep + functionName);
          }
      }

      // Validate Stage
      if (!_this.evt.options.stage) {
        throw new SError(`Stage is required`);
      }

      return BbPromise.resolve();
    }

    /**
     * Process Deployment
     */

    _processDeployment() {

      let _this = this;

      // Status
      SCli.log('Deploying functions in "'
        + _this.evt.options.stage
        + '" to the following regions: '
        + _this.regions.join(', '));

      _this._spinner = SCli.spinner();
      _this._spinner.start();

      return BbPromise.try(function() {
          return _this.regions;
        })
        .bind(_this)
        .each(function(region) {

          // Prepare functions
          let getFunctionsOptions = {
            paths: _this.evt.options.paths
          };
          _this.functions = _this.project.getFunctions(getFunctionsOptions);

          // Deploy Function Code in each region
          return _this._deployCodeByRegion(region);
        })
        .then(function() {

          // Stop Spinner
          _this._spinner.stop(true);
        });
    }

    /**
     * Deploy Code By Region
     */

    _deployCodeByRegion(region) {

      let _this = this;

      return new BbPromise(function(resolve) {

        /**
         *  Package, Upload, Deploy, Alias functions' code concurrently
         *  - Package must be redone for each region because ENV vars and IAM Roles are set for each region
         */

        async.eachLimit(_this.functions, 5, function(func, cb) {

          return BbPromise.try(function() {

              // Nodejs
              if (func.data.runtime = 'nodejs') {

                let newEvt = {
                  options: {
                    stage:    _this.evt.options.stage,
                    region:   region,
                    module:   func.module,
                    function: func.data.name
                  }
                };

                // Package Code
                return _this.S.actions.codePackageLambdaNodejs(newEvt)
                  .bind(_this)
                  .then(function(result) {

                    let newEvt = {
                      options: {
                        stage:         result.options.stage,
                        region:        result.options.region,
                        module:        result.options.module,
                        function:      result.options.function,
                        pathDist:      result.data.pathDist,
                        pathsPackaged: result.data.pathsPackaged
                      }
                    };

                    // Deploy Code
                    return _this.S.actions.codeDeployLambdaNodejs(newEvt);
                  });
              }
            })
            .then(function(result) {

              // Add Function and Region
              if (!_this.deployed)         _this.deployed         = {};
              if (!_this.deployed[region]) _this.deployed[region] = [];
              _this.deployed[region].push({
                module:   func.module,
                function: func.data.name,
                Arn:      result.data.lambdaAliasArn
              });

              return cb();

            })
            .catch(function(e) {

              // Stash Failed Function Code
              if (!_this.failed)         _this.failed = {};
              if (!_this.failed[region]) _this.failed[region] = [];
              _this.failed[region].push({
                module:   func.module,
                function: func.data.name,
                message:  e.message,
                stack:    e.stack
              });

              return cb();
            });

        }, function() {
          return resolve(region);
        });
      });
    }
  }

  return( FunctionDeploy );
};