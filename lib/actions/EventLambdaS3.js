'use strict';

/**
 * EventLambdaS3:
 *     Deploys an S3 based event sources.
 *
 * Options:
 *     - stage: stage to deploy event to
 *     - region: region to deploy event to
 *     - path: event path
 */

module.exports = function(S) {

  const path   = require('path'),
    SUtils     = S.utils,
    SError     = require(S.getServerlessPath('Error')),
    BbPromise  = require('bluebird'),
    _          = require('lodash');

  class EventLambdaS3 extends S.classes.Plugin {

    static getName() {
      return 'serverless.core.' + this.name;
    }

    registerActions() {

      S.addAction(this.eventLambdaS3.bind(this), {
        handler:       'eventLambdaS3',
        description:   'Deploy an S3 event source'
      });

      return BbPromise.resolve();
    }

    /**
     * Code Package Lambda
     */

    eventLambdaS3(evt) {
      let _this     = this;
      _this.evt     = evt;

      const stage  = this.evt.options.stage,
            region = this.evt.options.region;

      if (!stage || !region || !_this.evt.options.name) {
        return BbPromise.reject(new SError(`Missing stage, region or event name.`));
      }

      _this.aws = S.getProvider('aws');

      let event          = S.getProject().getEvent( _this.evt.options.name ),
          populatedEvent = event.toObjectPopulated({stage, region}),
          functionName   = event.getFunction().getDeployedName(_this.evt.options),
          statementId    = 'sEvents-' + functionName + '-' + event.name + '-' + stage,
          awsAccountId   = _this.aws.getAccountId(stage, region),
          lambdaArn      = 'arn:aws:lambda:' + region + ':' + awsAccountId + ':function:' + functionName + ':' + stage;

      let params = {
        FunctionName: lambdaArn,
        StatementId: statementId,
        Qualifier: stage
      };

      return _this.aws.request('Lambda', 'removePermission', params, stage, region)
        .then(function(data) {
          SUtils.sDebug(`Removed lambda permission with statement ID: ${statementId}`);
        })
        .catch(function(error) {})
        .then(function (data) {

          SUtils.sDebug(`Adding lambda permission with statement ID: ${statementId}`);

          let params = {
            FunctionName: lambdaArn,
            StatementId: statementId,
            Action: 'lambda:InvokeFunction',
            Principal: 's3.amazonaws.com',
            SourceArn: 'arn:aws:s3:::' + populatedEvent.config.bucket,
            Qualifier: stage
          };
          return _this.aws.request('Lambda', 'addPermission', params, stage, region)
        })
        .then(function() {

          // get current bucket notification config to avoid put overwrite
          let params = {
            Bucket: populatedEvent.config.bucket
          };

          return _this.aws.request('S3', 'getBucketNotificationConfiguration', params, stage, region);
        })
        .then(function(data) {

          let params = {
            Bucket: populatedEvent.config.bucket,
            NotificationConfiguration: data
          };

          let lambdaConfig = {
            Events: populatedEvent.config.bucketEvents,
            LambdaFunctionArn: lambdaArn
          };

          if (populatedEvent.config.filterRules) {
            let filterRules = populatedEvent.config.filterRules.map(function(rule){
              return {
                Name: rule.name,
                Value: rule.value
              }
            });

            lambdaConfig.Filter = {
              Key: {
                FilterRules: filterRules
              }
            };
          }

          // update or create notification config for this lambda
          if (!_.find(params.NotificationConfiguration.LambdaFunctionConfigurations, {LambdaFunctionArn: lambdaArn})) {
            params.NotificationConfiguration.LambdaFunctionConfigurations.push(lambdaConfig);
          } else {
            let configPos = params.NotificationConfiguration.LambdaFunctionConfigurations.map(function(c) { return c.LambdaFunctionArn; }).indexOf(lambdaArn);
            params.NotificationConfiguration.LambdaFunctionConfigurations[configPos] = lambdaConfig;
          }

          return _this.aws.request('S3', 'putBucketNotificationConfiguration', params, stage, region);
        })
        .then(function(data) {
          SUtils.sDebug(`Put notification configuration for bucket ${populatedEvent.config.bucket} and lambda ${lambdaArn}`);

          return BbPromise.resolve(data);
        })
    }
  }


  return( EventLambdaS3 );
};
