'use strict';


/**
 * EventDeployStreamLambda:
 *     Deploys a Stream based event sources (dynamoDB & Kinesis).
 *
 * Options:
 *     - stage: stage to deploy event to
 *     - region: region to deploy event to
 *     - path: event path
 */

module.exports = function(SPlugin, serverlessPath) {

  const path     = require('path'),
    SError       = require(path.join(serverlessPath, 'ServerlessError')),
    SUtils       = require(path.join(serverlessPath, 'utils/index')),
    BbPromise    = require('bluebird');


  class EventDeployStreamLambda extends SPlugin {

    constructor(S, config) {
      super(S, config);
    }

    static getName() {
      return 'serverless.core.' + EventDeployStreamLambda.name;
    }

    registerActions() {

      this.S.addAction(this.eventDeployStreamLambda.bind(this), {
        handler:       'eventDeployStreamLambda',
        description:   'Deploy a stream based event source'
      });

      return BbPromise.resolve();
    }

    /**
     * Deploy Stream Event
     */

    eventDeployStreamLambda(evt) {
      let _this     = this;
      _this.evt     = evt;

      if (!_this.evt.options.stage || !_this.evt.options.region || !_this.evt.options.path) {
        return BbPromise.reject(new SError(`Missing stage, region, or event path.`));
      }

      _this.aws = _this.S.getProvider('aws');

      let event          = _this.S.getProject().getEvent( _this.evt.options.path ),
          populatedEvent = event.toObjectPopulated({stage: _this.evt.options.stage, region: _this.evt.options.region}),
          functionName   = _this.S.getProject().getFunction( _this.evt.options.path.split('#')[0] ).getDeployedName(_this.evt.options),
          regionVars     = _this.S.state.getMeta().stages[_this.evt.options.stage].regions[_this.evt.options.region].variables,
          eventVar       = 'eventID:' + event._config.sPath,
          awsAccountId   = _this.S.state.meta.get().stages[_this.evt.options.stage].regions[_this.evt.options.region].variables.iamRoleArnLambda.split('::')[1].split(':')[0],
          lambdaArn      = 'arn:aws:lambda:' + _this.evt.options.region + ':' + awsAccountId + ':function:' + functionName + ':' + _this.evt.options.stage;

      populatedEvent.config.startingPosition = populatedEvent.config.startingPosition || 'TRIM_HORIZON';
      populatedEvent.config.batchSize = populatedEvent.config.batchSize || 100;
      populatedEvent.config.enabled = populatedEvent.config.enabled ? true : false;

      let params = {
        FunctionName: lambdaArn,
        BatchSize: populatedEvent.config.batchSize,
        Enabled: populatedEvent.config.enabled
      };

      // Update or Create
      if (regionVars[eventVar]) {
        params.UUID = regionVars[eventVar];

        return _this.aws.request('Lambda', 'updateEventSourceMapping', params, _this.evt.options.stage, _this.evt.options.region)
          .then(function (data) {

            SUtils.sDebug(`updated stream event source ${populatedEvent.config.streamArn} for lambda ${lambdaArn}`);

            return BbPromise.resolve(data);
          });

      } else {

        params.EventSourceArn = populatedEvent.config.streamArn;
        params.StartingPosition = populatedEvent.config.startingPosition;

        return _this.aws.request('Lambda', 'createEventSourceMapping', params, _this.evt.options.stage, _this.evt.options.region)
          .then(function (data) {
            SUtils.sDebug(`Created stream event source ${populatedEvent.config.streamArn} for lambda ${lambdaArn}`);

            // save UUID
            regionVars[eventVar] = data.UUID;
            _this.S.state.save();

            return BbPromise.resolve(data);
          });
      }
    }
  }


  return( EventDeployStreamLambda );
};
