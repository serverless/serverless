'use strict';

/**
 * EventLambdaStream:
 *     Deploys a Stream based event sources (dynamoDB & Kinesis).
 *
 * Options:
 *     - stage: stage to deploy event to
 *     - region: region to deploy event to
 *     - path: event path
 */

module.exports = function(S) {

  const path     = require('path'),
    SUtils       = S.utils,
    SError       = require(S.getServerlessPath('Error')),
    BbPromise    = require('bluebird');

  class EventLambdaStream extends S.classes.Plugin {

    static getName() {
      return 'serverless.core.' + this.name;
    }

    registerActions() {

      S.addAction(this.eventLambdaStream.bind(this), {
        handler:       'eventLambdaStream',
        description:   'Deploy a stream based event source'
      });

      return BbPromise.resolve();
    }

    /**
     * Deploy Stream Event
     */

    eventLambdaStream(evt) {
      let _this     = this;
      _this.evt     = evt;

      if (!_this.evt.options.stage || !_this.evt.options.region || !_this.evt.options.name) {
        return BbPromise.reject(new SError(`Missing stage, region, or event name.`));
      }

      _this.aws = S.getProvider('aws');

      let event          = S.getProject().getEvent( _this.evt.options.name ),
          populatedEvent = event.toObjectPopulated({stage: _this.evt.options.stage, region: _this.evt.options.region}),
          functionName   = event.getFunction().getDeployedName(_this.evt.options),
          regionVars     = S.getProject().getRegion(_this.evt.options.stage, _this.evt.options.region).getVariables(),
          eventVar       = 'eventID:' + event.name,
          awsAccountId   = this.aws.getAccountId(_this.evt.options.stage, _this.evt.options.region),
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
            let newVar = {},
                regionInstance = S.getProject().getRegion(_this.evt.options.stage, _this.evt.options.region);
            newVar[eventVar] = data.UUID;
            regionInstance.addVariables(newVar);
            regionInstance.save();

            return BbPromise.resolve(data);
          });
      }
    }
  }


  return( EventLambdaStream );
};
