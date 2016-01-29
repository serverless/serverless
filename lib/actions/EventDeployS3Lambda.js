'use strict';

/**
 */

module.exports = function(SPlugin, serverlessPath) {

  const path     = require('path'),
    SError       = require(path.join(serverlessPath, 'ServerlessError')),
    SUtils       = require(path.join(serverlessPath, 'utils/index')),
    BbPromise    = require('bluebird');


  class EventDeployS3Lambda extends SPlugin {

    constructor(S, config) {
      super(S, config);
    }

    static getName() {
      return 'serverless.core.' + EventDeployS3Lambda.name;
    }

    registerActions() {

      this.S.addAction(this.eventDeployS3Lambda.bind(this), {
        handler:       'eventDeployS3Lambda',
        description:   'Deploy an S3 event source'
      });

      return BbPromise.resolve();
    }

    /**
     * Code Package Lambda
     */

    eventDeployS3Lambda(evt) {
      let _this     = this;
      _this.evt     = evt;

      // Validate required properties
      if (!_this.evt.options.stage || !_this.evt.options.region || !_this.evt.options.event || !_this.evt.options.event.config.lambdaArn || !_this.evt.options.event.config.bucket || !_this.evt.options.event.config.bucketEvents) {
        return BbPromise.reject(new SError(`Missing stage, region or valid event.`));
      }

      let populatedEvent = _this.evt.options.event.getPopulated({stage: _this.evt.options.stage, region: _this.evt.options.region});

      let awsConfig  = {
        region:          _this.evt.options.region,
        accessKeyId:     _this.S.config.awsAdminKeyId,
        secretAccessKey: _this.S.config.awsAdminSecretKey
      };

      _this.S3 = require('../utils/aws/S3')(awsConfig);

      // the AWS method creates or updates the notification configuration,
      // so we don't need to check if we're updating or creating
      let params = {
        Bucket: populatedEvent.config.bucket,
        NotificationConfiguration: {
          LambdaFunctionConfigurations: [
            {
              Events: populatedEvent.config.bucketEvents,
              LambdaFunctionArn: populatedEvent.config.lambdaArn
            }
          ]
        }
      };

      return _this.S3.putBucketNotificationConfigurationPromised(params)
        .then(function(data) {
          return BbPromise.resolve(data);
        })
    }
  }


  return( EventDeployS3Lambda );
};
