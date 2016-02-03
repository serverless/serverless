'use strict';

/**
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

      let awsConfig  = {
        region:          _this.evt.options.region,
        accessKeyId:     _this.S.config.awsAdminKeyId,
        secretAccessKey: _this.S.config.awsAdminSecretKey
      };

      _this.Lambda = require('../utils/aws/Lambda')(awsConfig);

      let event = _this.S.state.getEvents({ paths: [_this.evt.options.path] })[0],
          populatedEvent = event.getPopulated({stage: _this.evt.options.stage, region: _this.evt.options.region}),
          regionVars = _this.S.state.getMeta().stages[_this.evt.options.stage].regions[_this.evt.options.region].variables,
          eventVar = 'eventID:' + event._config.sPath,
          awsAccountId = _this.S.state.meta.get().stages[_this.evt.options.stage].regions[_this.evt.options.region].variables.iamRoleArnLambda.split('::')[1].split(':')[0],
          lambdaArn = _this.Lambda.sGetLambdaArn(_this.S.state.getProject().name, _this.evt.options.path.split('/')[0], _this.evt.options.path.split('/')[1], _this.evt.options.path.split('/')[2].split('#')[0], _this.evt.options.region, awsAccountId);

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

        return _this.Lambda.updateEventSourceMappingPromised(params)
          .then(function (data) {

            SUtils.sDebug(`updated stream event source ${populatedEvent.config.streamArn} for lambda ${populatedEvent.config.lambdaArn}`);

            return BbPromise.resolve(data);
          });

      } else {
        params.EventSourceArn = populatedEvent.config.streamArn;
        params.StartingPosition = populatedEvent.config.startingPosition;
        return _this.Lambda.createEventSourceMappingPromised(params)
          .then(function (data) {
            SUtils.sDebug(`Created stream event source ${populatedEvent.config.streamArn} for lambda ${populatedEvent.config.lambdaArn}`);

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
