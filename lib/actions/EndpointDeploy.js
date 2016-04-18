'use strict';

/**
 * Action: Endpoint Deploy
 * - Deploys Endpoints
 * - Validates Endpoint paths
 * - Loops sequentially through each Region in specified Stage
 * - Passes Endpoint paths to Sub-Actions for deployment
 * - Handles concurrent processing of Sub-Actions for faster deploys
 *
 * Options:
 * - stage:              (String)  The stage to deploy to
 * - region:             (String)  The region in the stage to deploy to
 * - names:              (Array)   Array of endpoint names to deploy.  Format: ['users/show~GET'] path~method
 * - aliasEndpoint:      (String)  The Lambda Alias the endpoint should point to.
 * - all:                (Boolean) Indicates whether all Functions in the project should be deployed.
 * - description:        (String)  Provide custom description string for API Gateway stage deployment description.
 */

module.exports = function(S) {

  const path     = require('path'),
      SUtils     = S.utils,
      SError     = require(S.getServerlessPath('Error')),
      SCli       = require(S.getServerlessPath('utils/cli')),
      BbPromise  = require('bluebird'),
      fs         = BbPromise.promisifyAll(require('fs')),
      os         = require('os');

  class EndpointDeploy extends S.classes.Plugin {

    static getName() {
      return 'serverless.core.' + this.name;
    }

    registerActions() {

      S.addAction(this.endpointDeploy.bind(this), {
        handler:       'endpointDeploy',
        description:   'Deploys REST API endpoints',
        context:       'endpoint',
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
            option:      'aliasEndpoint', // TODO: Implement
            shortcut:    'e',
            description: 'Optional - Point Endpoint(s) to a specific Lambda alias'
          }, {
            option:      'aliasRestApi', // TODO: Implement
            shortcut:    'i',
            description: 'Optional - Override the API Gateway "functionAlias" Stage Variable'
          }, {
            option:      'description',
            shortcut:    'd',
            description: 'Optional - Provide custom description string for API Gateway stage deployment description'
          }, {
            option:      'all',
            shortcut:    'a',
            description: 'Optional - Deploy all Functions'
          }
        ],
        parameters: [
          {
            parameter: 'names',
            description: 'The names/ids of the endpoints you want to deploy in this format: user/create~GET',
            position: '0->'
          }
        ]
      });

      return BbPromise.resolve();
    }

    /**
     * Endpoint Deploy
     */

    endpointDeploy(evt) {

      let _this = this;
      _this.evt = evt;

      // Flow
      return BbPromise.try(() => {
          // Prompt: Stage
            if (!S.config.interactive || this.evt.options.stage) return;

            return this.cliPromptSelectStage('Endpoint Deployer - Choose a stage: ', this.evt.options.stage, false)
              .then(stage => this.evt.options.stage = stage)
          })
          .bind(_this)
          .then(_this._validateAndPrepare)
          .then(_this._processDeployment)
          .then(function() {

            // Display Successfully Deployed Endpoints, if any
            if (_this.evt.data.deployed) {
              SCli.log('Successfully deployed endpoints in "' + _this.evt.options.stage + '" to the following regions:');
              for (let i = 0; i < Object.keys(_this.evt.data.deployed).length; i++) {
                let region = _this.evt.data.deployed[Object.keys(_this.evt.data.deployed)[i]];
                SCli.log(Object.keys(_this.evt.data.deployed)[i] + ' ------------------------');
                for (let j = 0; j < region.length; j++) {
                  SCli.log('  ' + region[j].endpointMethod + ' - ' + region[j].endpointPath + ' - ' + region[j].endpointUrl);
                }
              }
            }

            // Display Failed Deployed Endpoints, if any
            if(_this.evt.data.failed) {
              SCli.log('Failed to deploy endpoints in "' + _this.evt.options.stage + '" to the following regions:');
              for (let i = 0; i < Object.keys(_this.evt.data.failed).length; i++) {
                let region = _this.evt.data.failed[Object.keys(_this.evt.data.failed)[i]];
                SCli.log(Object.keys(_this.evt.data.failed)[i] + ' ------------------------');
                for (let j = 0; j < region.length; j++) {
                  SCli.log('  ' + region[j].endpointMethod + ' - ' + region[j].endpointPath + ': ' + region[j].message );
                  // Show Error Stacktrace if in debug mode
                  SUtils.sDebug(region[j].stack);
                }
              }
              SCli.log('');
              SCli.log('Run this again with --debug to get more error information...');
            }

            /**
             * Return EVT
             */
            
            return _this.evt;

          });
    }

    /**
     * Validate And Prepare
     * - If CLI, maps CLI input to event object
     */

    _validateAndPrepare() {

      let _this       = this;
      _this.project   = S.getProject();
      _this.aws       = S.getProvider();
      _this.endpoints = [];

      // Set defaults
      _this.evt.options.names  = _this.evt.options.names ? _this.evt.options.names : [];

      // Prepare endpoints
      if (_this.evt.options.names.length) {
        _this.endpoints = _this.project.getEndpointsByNames(_this.evt.options.names);
      }

      // If CLI and no endpoint names targeted, deploy from CWD
      if (S.cli &&
          !_this.evt.options.names.length &&
          !_this.evt.options.all) {

        let functionsByCwd = SUtils.getFunctionsByCwd(_this.project.getAllFunctions());

        functionsByCwd.forEach(function(func) {
          func.getAllEndpoints().forEach(function(endpoint) {
            _this.endpoints.push(endpoint);
          });
        });
      }

      // If --all is selected, load all paths
      if (_this.evt.options.all) {
        _this.endpoints = _this.project.getAllEndpoints();
      }

      if (_this.endpoints.length === 0) throw new SError(`You don't have any endpoints in your project`);

      // Reduce collected endpoints to endpoint names
      _this.endpoints = _this.endpoints.map(function(e) {
        return e.getName();
      });

      // Validate Stage
      if (!_this.evt.options.stage) throw new SError(`Stage is required`);

      return BbPromise.resolve();
    }

    /**
     * Process Endpoint Deployment
     */

    _processDeployment() {

      let _this = this;

      // Create new event object
      let newEvt = {
        options: {
          stage:          this.evt.options.stage,
          region:         this.evt.options.region,
          names:          this.endpoints,
          aliasEndpoint:  this.evt.options.aliasEndpoint,
          aliasRestApi:   this.evt.options.aliasRestApi,
          description:    this.evt.options.description
        }
      };

      return S.actions.endpointDeployApiGateway(newEvt)
        .then(function(evt) {
          _this.evt.data.deployed = evt.data.deployed;
          _this.evt.data.failed   = evt.data.failed;
        })
    }
  }

  return( EndpointDeploy );
};
