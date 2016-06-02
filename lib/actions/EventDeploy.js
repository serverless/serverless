'use strict';

/**
 * Action: Event Deploy
 * - Deploys Event Sources for a lambda function
 * - Validates event sources paths
 * - Loops sequentially through each Region in specified Stage
 * - Passes event paths to Sub-Actions for deployment
 * - Handles concurrent processing of Sub-Actions for faster deploys
 *
 * Options:
 * - stage:              (String)  The stage to deploy to
 * - region:             (String)  The region in the stage to deploy to
 * - paths:              (Array)   Array of event paths to deploy.  Format: ['users/show#eventName']
 * - all:                (Boolean) Indicates whether all Events in the project should be deployed.
 */

module.exports = function(S) {

  const path  = require('path'),
    SError    = require(S.getServerlessPath('Error')),
    SCli      = require(S.getServerlessPath('utils/cli')),
    SUtils    = S.utils,
    BbPromise = require('bluebird'),
    async     = require('async');

  class EventDeploy extends S.classes.Plugin {

    static getName() {
      return 'serverless.core.' + this.name;
    }

    registerActions() {

      S.addAction(this.eventDeploy.bind(this), {
        handler:       'eventDeploy',
        description:   'Deploys event sources for lambdas',
        context:       'event',
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
            option:      'all',
            shortcut:    'a',
            description: 'Optional - Deploy all Events'
          }
        ],
        parameters: [
          {
            parameter: 'names',
            description: 'One or multiple event names',
            position: '0->'
          }
        ]
      });

      return BbPromise.resolve();
    }

    /**
     * Event Deploy
     */

    eventDeploy(evt) {

      let _this = this;
      _this.evt = evt;

      // Flow
      return new BbPromise(function(resolve) {

        // Prompt: Stage
        if (!S.config.interactive || _this.evt.options.stage) return resolve();

        return _this.cliPromptSelectStage('Event Deployer - Choose a stage: ', _this.evt.options.stage, false)
          .then(stage => {
            _this.evt.options.stage = stage;
            return resolve();
          })
      })
        .bind(_this)
        .then(_this._validateAndPrepare)
        .then(_this._processDeployment)
        .then(function() {

          // Display Successfully Deployed Events, if any
          if (_this.deployed) {
            SCli.log('Successfully deployed events in "' + _this.evt.options.stage + '" to the following regions:');
            for (let i = 0; i < Object.keys(_this.deployed).length; i++) {
              let region = _this.deployed[Object.keys(_this.deployed)[i]];
              SCli.log(Object.keys(_this.deployed)[i] + ' ------------------------');
              for (let j = 0; j < region.length; j++) {
                SCli.log(`  ${region[j].name} (${region[j].type} event)`);
              }
            }
          }

          // Display Failed Deployed Events, if any
          if(_this.failed) {
            SCli.log('Failed to deploy events in "' + _this.evt.options.stage + '" to the following regions:');
            for (let i = 0; i < Object.keys(_this.failed).length; i++) {
              let region = _this.failed[Object.keys(_this.failed)[i]];
              SCli.log(Object.keys(_this.failed)[i] + ' ------------------------');
              for (let j = 0; j < region.length; j++) {
                SCli.log('  ' + region[j].name + ': ' + region[j].message );
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

      _this.project   = S.getProject();
      _this.aws       = S.getProvider();
      _this.events = [];

      // Set defaults
      _this.evt.options.names  = _this.evt.options.names ? _this.evt.options.names : [];
      _this.regions            = _this.evt.options.region ? [_this.evt.options.region] : _this.project.getAllRegionNames(_this.evt.options.stage);

      if (_this.evt.options.names.length) {
        _this.evt.options.names.forEach(function(eventName) {
          _this.events.push(_this.project.getEvent(eventName));
        });
      }

      // If CLI and no event names targeted, deploy from CWD
      if (S.cli &&
        !_this.evt.options.names.length &&
        !_this.evt.options.all) {

        let functionsByCwd = SUtils.getFunctionsByCwd(_this.project.getAllFunctions());

        functionsByCwd.forEach(function(func) {
          func.getAllEvents().forEach(function(event) {
            _this.events.push(event);
          });
        });

      }

      // If --all is selected, load all paths
      if (_this.evt.options.all) {
        _this.events = _this.project.getAllEvents();
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
      console.log('');
      SCli.log('Deploying events in "' + _this.evt.options.stage + '" to the following regions: ' + _this.regions.join(', '));
      _this._spinner = SCli.spinner();
      _this._spinner.start();

      return BbPromise.try(function() {
          return _this.regions;
        })
        .bind(_this)
        .each(function(region) {

          // Deploy Events in each region
          return _this._deployEventsByRegion(region);
        })
        .then(function() {

          // Stop Spinner
          _this._spinner.stop(true);

        });
    }

    /**
     * Deploy Events By Region
     */

    _deployEventsByRegion(region) {

      let _this = this;

      return new BbPromise(function(resolve, reject) {

        async.eachSeries(_this.events, function(event, eCb) {

        let eventType = event.type.toLowerCase(),
            subAction,
            newEvt = {
              options: {
                stage:   _this.evt.options.stage,
                region:  region,
                name:    event.name
              }
            };

        if(eventType === 'dynamodbstream' || eventType === 'kinesisstream') {
          subAction = 'eventLambdaStream';
        } else if (eventType === 's3') {
          subAction = 'eventLambdaS3';
        } else if (eventType === 'iot') {
          subAction = 'eventIotRule';
        } else if (eventType === 'sns') {
          subAction = 'eventLambdaSNS';
        } else if (eventType === 'schedule') {
          subAction = 'eventLambdaSchedule';
        } else {
          throw new SError(`Event type ${eventType} is not supported` );
        }

        return S.actions[subAction](newEvt)
          .then(function (result) {

            // Stash deployed events
            if (!_this.deployed) _this.deployed = {};
            if (!_this.deployed[region]) _this.deployed[region] = [];
            _this.deployed[region].push({
              function:         event._function,
              name:             event.toObjectPopulated({stage: _this.evt.options.stage, region: region}).name,
              type:             event.type
            });

            return eCb();
          })
            .catch(function(e) {
              // Stash Failed Events
              if (!_this.failed) _this.failed = {};
              if (!_this.failed[region]) _this.failed[region] = [];
              _this.failed[region].push({
                function:         event ? event._function : 'unknown',
                name:             event.toObjectPopulated({stage: _this.evt.options.stage, region: region}).name,
                message:          e.message,
                stack:            e.stack
              });

              return eCb();
            });

        }, function() {
          return resolve();
        });
      })
    }
  }

  return( EventDeploy );
};
