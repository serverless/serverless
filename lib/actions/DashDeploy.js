'use strict';

/**
 * Action: DashDeploy Deploy
 * - Deploys Function Code & Endpoints
 * - Validates Function paths
 * - Loops sequentially through each Region in specified Stage
 * - Passes Function paths to Sub-Actions for deployment
 * - Handles concurrent processing of Sub-Actions for faster deploys
 *
 * Event Properties:
 * - stage:             (String)  The stage to deploy to
 * - regions:           (Array)   The region(s) in the stage to deploy to
 * - aliasFunction:     (String)  Custom Lambda alias.
 * - functions:         (Array)   Array of function JSONs from fun.sl.json
 * - description:         (String)  Provide custom description string for API Gateway stage deployment description.
 */

module.exports = function(S) {

  const path  = require('path'),
    SUtils    = S.utils,
    SError    = require(S.getServerlessPath('Error')),
    SCli      = require(S.getServerlessPath('utils/cli')),
    BbPromise = require('bluebird'),
    async     = require('async'),
    _         = require('lodash'),
    fs        = BbPromise.promisifyAll(require('fs'));

  class DashDeploy extends S.classes.Plugin {

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

      S.addAction(this.dashDeploy.bind(this), {
        handler:       'dashDeploy',
        description:   'Serverless Dashboard - Deploys both code & endpoint',
        context:       'dash',
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
          }, {
            option:      'aliasEndpoint', // TODO: Implement
            shortcut:    'e',
            description: 'Optional - Provide a custom Alias to your Endpoints'
          }, {
            option:      'aliasRestApi',  // TODO: Implement
            shortcut:    'a',
            description: 'Optional - Provide a custom Api Gateway Stage Variable for your REST API'
          }, {
            option:      'description',
            shortcut:    'd',
            description: 'Optional - Provide custom description string for API Gateway stage deployment description'
          }
        ]
      });

      return BbPromise.resolve();
    }

    /**
     * Function Deploy
     */

    dashDeploy(evt) {

      let _this      = this;
      _this.evt      = evt;
      _this.evt.data = {};

      // Add defaults
      _this.evt.options.stage               = _this.evt.options.stage ? _this.evt.options.stage : null;
      _this.evt.options.aliasFunction       = _this.evt.options.aliasFunction ? _this.evt.options.aliasFunction : null;
      _this.evt.options.aliasEndpoint       = _this.evt.options.aliasEndpoint ? _this.evt.options.aliasEndpoint : null;
      _this.evt.options.aliasRestApi        = _this.evt.options.aliasRestApi ? _this.evt.options.aliasRestApi : null;
      _this.evt.options.selectedFunctions   = [];
      _this.evt.options.selectedEndpoints   = [];
      _this.evt.options.selectedEvents      = [];
      _this.evt.data.deployedFunctions      = {};
      _this.evt.data.deployedEndpoints      = {};
      _this.evt.data.deployedEvents         = {};

      // Instantiate Classes
      _this.project    = S.getProject();

      // Flow
      return BbPromise.try(function() {
        })
        .bind(_this)
        .then(_this._validateAndPrepare)
        .then(_this._prompt)
        .then(function() {
          return _this.cliPromptSelectStage('Choose a Stage: ', _this.evt.options.stage, false)
            .then(stage => {
              _this.evt.options.stage = stage;
            })
        })
        .then(function() {
          return _this.cliPromptSelectRegion('Choose a Region in this Stage: ', false, true, _this.evt.options.region, _this.evt.options.stage)
            .then(region => {
              _this.evt.options.region = region;
            })
        })
        .then(_this._deploy)
        .then(function() {
          return _this.evt;
        });
    }

    /**
     * Validate And Prepare
     * - If CLI, maps CLI input to event object
     */

    _validateAndPrepare() {

      let _this = this;

      // If not interactive, throw error
      if (!S.config.interactive) {
        return BbPromise.reject(new SError('Sorry, this is only available in interactive mode'));
      }

      return BbPromise.resolve();
    }

    /**
     * Prompt
     */

    _prompt() {

      let _this = this,
          functions = SUtils.getFunctionsByCwd(_this.project.getAllFunctions());

      // Prepare function & endpoints choices
      let choices    = [];

      _.each( functions, function(func){
        // Push function function as spacer
        choices.push({
          spacer: func.getName()
        });

        choices.push({
          key:        '  ',
          value:      func.getName(),
          label:      `function - ${func.getName()}`,
          type:       'function'
        });

        _.each( func.getAllEndpoints(), function(endpoint){
          choices.push({
            key:        '  ',
            value:      `${endpoint.path}~${endpoint.method}`,
            label:      `endpoint - ${endpoint.path} - ${endpoint.method}`,
            type:       'endpoint'
          });
        });

        _.each( func.getAllEvents(), function(event){
          choices.push({
            key:        '  ',
            value:      event.name,
            label:      `event - ${event.name} - ${event.type}`,
            type:       'event'
          });
        });
      });

      // Show ASCII
      SCli.asciiGreeting();

      // Blank space for neatness in the CLI
      console.log('');

      // Show quick help
      SCli.quickHelp();

      // Blank space for neatness in the CLI
      console.log('');

      // Show select input
      return _this.cliPromptSelect('Select the assets you wish to deploy:', choices, true, 'Deploy')
        .then(function(items) {
          for (let i = 0; i < items.length; i++) {
            if (items[i].toggled) {
              if(items[i].type === "function") _this.evt.options.selectedFunctions.push(items[i].value);
              if(items[i].type === "endpoint") _this.evt.options.selectedEndpoints.push(items[i].value);
              if(items[i].type === "event")    _this.evt.options.selectedEvents.push(items[i].value);
            }
          }

          // Blank space for neatness in the CLI
          console.log('');
        })
    }

    /**
     * Deploy
     */

    _deploy() {

      let _this = this;

      return new BbPromise(function(resolve, reject) {

        // If user selected functions, deploy them
        if (!_this.evt.options.selectedFunctions || !_this.evt.options.selectedFunctions.length) return resolve();

        return S.actions.functionDeploy({
            options: {
              stage:  _this.evt.options.stage,
              region: _this.evt.options.region,
              names:   _this.evt.options.selectedFunctions
            }
          })
          .then(function(evt) {
            _this.evt.data.deployedFunctions = evt.data.deployed;
            return resolve();
          });
        })
        .then(function() {

          // If user selected endpoints, deploy them
          if (!_this.evt.options.selectedEndpoints || !_this.evt.options.selectedEndpoints.length) return BbPromise.resolve();

          return S.actions.endpointDeploy({
              options: {
                stage:       _this.evt.options.stage,
                region:      _this.evt.options.region,
                names:       _this.evt.options.selectedEndpoints
              }
            })
            .then(function(evt) {
              _this.evt.data.deployedEndpoints = evt.data.deployed;
            });
        })
        .then(function() {

          // If user selected endpoints, deploy them
          if (!_this.evt.options.selectedEvents || !_this.evt.options.selectedEvents.length) return BbPromise.resolve();

          return S.actions.eventDeploy({
              options: {
                stage:       _this.evt.options.stage,
                region:      _this.evt.options.region,
                names:      _this.evt.options.selectedEvents
              }
            })
            .then(function(evt) {
              _this.evt.data.deployedEvents = evt.data.deployed;
            });
        })
    }
  }

  return( DashDeploy );
};
