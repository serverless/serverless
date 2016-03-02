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

module.exports = function(SPlugin, serverlessPath) {

  const path     = require('path'),
    SError       = require(path.join(serverlessPath, 'Error')),
    BbPromise    = require('bluebird');
  let SUtils;


  class EventLambdaS3 extends SPlugin {

    constructor(S, config) {
      super(S, config);
      SUtils = S.utils;
    }

    static getName() {
      return 'serverless.core.' + EventLambdaS3.name;
    }

    registerActions() {

      this.S.addAction(this.eventLambdaS3.bind(this), {
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

      if (!_this.evt.options.stage || !_this.evt.options.region || !_this.evt.options.name) {
        return BbPromise.reject(new SError(`Missing stage, region or event name.`));
      }
      let event          = _this.S.getProject().getEvent( _this.evt.options.name ),
          populatedEvent = event.toObjectPopulated({stage: _this.evt.options.stage, region: _this.evt.options.region}),
          functionName   = event.getFunction().getDeployedName(_this.evt.options),
          statementId    = 'sEvents-' + functionName + '-' + event.name + '-' + _this.evt.options.stage,
          regionVars     = _this.S.getProject().getRegion(_this.evt.options.stage, _this.evt.options.region).getVariables(),
          awsAccountId   = regionVars.iamRoleArnLambda.split('::')[1].split(':')[0],
          lambdaArn      = 'arn:aws:lambda:' + _this.evt.options.region + ':' + awsAccountId + ':function:' + functionName + ':' + _this.evt.options.stage;

      _this.aws = _this.S.getProvider('aws');

      let params = {
        FunctionName: lambdaArn,
        StatementId: statementId,
        Qualifier: _this.evt.options.stage
      };
      return _this.aws.request('Lambda', 'removePermission', params, _this.evt.options.stage, _this.evt.options.region)
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
            Qualifier: _this.evt.options.stage
          };
          return _this.aws.request('Lambda', 'addPermission', params, _this.evt.options.stage, _this.evt.options.region)
        })
        .then(function() {
          let projectBucketRegion = _this.S.getProject().getVariables().projectBucketRegion;
          let params = {
            Bucket: populatedEvent.config.bucket,
            NotificationConfiguration: {
              LambdaFunctionConfigurations: [
                {
                  Events: populatedEvent.config.bucketEvents,
                  LambdaFunctionArn: lambdaArn
                }
              ]
            }
          };

          if (populatedEvent.config.filterRules) {
            let filterRules = populatedEvent.config.filterRules.map(function(rule){
              return {
                Name: rule.name,
                Value: rule.value
              }
            });

            params.NotificationConfiguration.LambdaFunctionConfigurations[0].Filter = {
              Key: {
                FilterRules: filterRules
              }
            };
          }

          return _this.aws.request('S3', 'putBucketNotificationConfiguration', params, _this.evt.options.stage, projectBucketRegion);
        })
        .then(function(data) {

          SUtils.sDebug(`Put notification configuration for bucket ${populatedEvent.config.bucket} and lambda ${lambdaArn}`);

          return BbPromise.resolve(data);
        })
    }
  }


  return( EventLambdaS3 );
};
