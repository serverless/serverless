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

module.exports = function(SPlugin, serverlessPath) {

  const path     = require('path'),
    SError       = require(path.join(serverlessPath, 'ServerlessError')),
    SUtils       = require(path.join(serverlessPath, 'utils/index')),
    SCli         = require(path.join(serverlessPath, 'utils/cli')),
    BbPromise    = require('bluebird'),
    async        = require('async');


  class EventDeploy extends SPlugin {

    constructor(S) {
      super(S);
    }

    static getName() {
      return 'serverless.core.' + EventDeploy.name;
    }

    registerActions() {

      this.S.addAction(this.eventDeploy.bind(this), {
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
            parameter: 'paths',
            description: 'One or multiple paths to your event',
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
        if (!_this.S.config.interactive || _this.evt.options.stage) return resolve();

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
                SCli.log('  ' + region[j].eventSPath);
              }
            }
          }

          // Display Failed Deployed Endpoints, if any
          if(_this.failed) {
            SCli.log('Failed to deploy events in "' + _this.evt.options.stage + '" to the following regions:');
            for (let i = 0; i < Object.keys(_this.failed).length; i++) {
              let region = _this.failed[Object.keys(_this.failed)[i]];
              SCli.log(Object.keys(_this.failed)[i] + ' ------------------------');
              for (let j = 0; j < region.length; j++) {
                SCli.log('  ' + region[j].eventSPath + ': ' + region[j].message );
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

      // Instantiate Classes
      _this.project = _this.S.getProject();
      _this.meta    = _this.S.state.getMeta();

      // Set defaults
      _this.evt.options.paths  = _this.evt.options.paths ? _this.evt.options.paths : [];
      _this.regions            = _this.evt.options.region ? [_this.evt.options.region] : Object.keys(_this.meta.stages[_this.evt.options.stage].regions);

      // If CLI and no paths targeted, deploy from CWD if Function
      if (_this.S.cli &&
        !_this.evt.options.paths.length &&
        !_this.evt.options.all) {

        // Get all functions in CWD
        let sPath = _this.getSPathFromCwd(_this.S.getProject().getRootPath());

        if (!sPath) {
          throw new SError(`You must be in a component to deploy events`);
        }

        _this.evt.options.paths = _this.S.state.getEvents({
          paths: [sPath],
          returnPaths: true
        });

        if (!_this.evt.options.paths.length) {
          throw new SError(`No events found in this location: ` + sPath);
        }

        SCli.log('Deploying all events in: ' + sPath + '...');
      }

      // If --all is selected, load all paths
      if (_this.evt.options.all) {
        _this.evt.options.paths = _this.S.state.getEvents({ returnPaths: true });
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

        async.eachSeries(_this.evt.options.paths, function(path, eCb) {

        let event = _this.S.state.getEvents({ paths: [path] })[0];

        if(!event) throw new SError(`Event could not be found: ${path}`);

        let eventType = event.type.toLowerCase(),
            subAction,
            newEvt = {
              options: {
                stage:   _this.evt.options.stage,
                region:  region,
                path:    path
              }
            };

        if(eventType === 'dynamodbstream' || eventType === 'kinesisstream') {
          subAction = 'eventDeployStreamLambda';
        } else if (eventType === 's3') {
          subAction = 'eventDeployS3Lambda';
        } else if (eventType === 'sns') {
          subAction = 'eventDeploySNSLambda';
        } else if (eventType === 'schedule') {
          subAction = 'eventDeployScheduledLambda';
        }

        return _this.S.actions[subAction](newEvt)
          .then(function (result) {

            // Stash deployed endpoints
            if (!_this.deployed) _this.deployed = {};
            if (!_this.deployed[region]) _this.deployed[region] = [];
            _this.deployed[region].push({
              module:           event._config.module,
              function:         event._config.function,
              name:             event.name,
              eventSPath:       path
            });

            return eCb();
          })
            .catch(function(e) {
              // Stash Failed Endpoint
              if (!_this.failed) _this.failed = {};
              if (!_this.failed[region]) _this.failed[region] = [];
              _this.failed[region].push({
                module:           event ? event._config.module : 'unknown',
                function:         event ? event._config.function : 'unknown',
                eventSPath:       path,
                name:             event.name,
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
