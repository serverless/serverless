'use strict';

/**
 */

module.exports = function(SPlugin, serverlessPath) {

  const path     = require('path'),
    SError       = require(path.join(serverlessPath, 'ServerlessError')),
    SUtils       = require(path.join(serverlessPath, 'utils/index')),
    BbPromise    = require('bluebird');


  class EventDeployCloudWatchLogsLambda extends SPlugin {

    constructor(S, config) {
      super(S, config);
    }

    static getName() {
      return 'serverless.core.' + EventDeployCloudWatchLogsLambda.name;
    }

    registerActions() {

      this.S.addAction(this.eventDeployCloudWatchLogsLambda.bind(this), {
        handler:       'eventDeployCloudWatchLogsLambda',
        description:   'Deploy a CloudWatch Logs event source'
      });

      return BbPromise.resolve();
    }

    /**
     * Code Package Lambda
     */

    eventDeployCloudWatchLogsLambda(evt) {
      let _this     = this;
      _this.evt     = evt;

      // Validate required properties
      if (!_this.evt.options.stage || !_this.evt.options.region || !_this.evt.options.event || !_this.evt.options.event.config.lambdaArn || !_this.evt.options.event.config.filtername || !_this.evt.options.event.config.filterPattern || !_this.evt.options.event.config.logGroupName || !_this.evt.options.event.config.roleArn) {
        return BbPromise.reject(new SError(`Missing stage, region or valid event.`));
      }

      let populatedEvent = _this.evt.options.event.getPopulated({stage: _this.evt.options.stage, region: _this.evt.options.region});

      let awsConfig  = {
        region:          _this.evt.options.region,
        accessKeyId:     _this.S.config.awsAdminKeyId,
        secretAccessKey: _this.S.config.awsAdminSecretKey
      };

      _this.CloudWatchLogs = require('../CloudWatch')(awsConfig);

      // the AWS method creates or updates the subscription, so we don't need
      // to check if we're updating or creating
      let params = {
        destinationArn: populatedEvent.config.lambdaArn,
        filterName: populatedEvent.config.filterName,
        filterPattern: populatedEvent.config.filterPattern,
        logGroupName: populatedEvent.config.logGroupName,
        roleArn: populatedEvent.config.roleArn
      };

      return _this.CloudWatchLogs.putSubscriptionFilterAsync(params)
        .then(function(data) {
          return BbPromise.resolve(data);
        })
    }
  }


  return( EventDeployCloudWatchLogsLambda );
};
