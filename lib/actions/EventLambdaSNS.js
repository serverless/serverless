'use strict';

/**
 * EventLambdaSNS:
 *     Deploys an SNS based event sources. Subscribes a lambda to an SNS topic.
 *
 * Options:
 *     - stage: stage to deploy event to
 *     - region: region to deploy event to
 *     - path: event path
 */

module.exports = function(SPlugin, serverlessPath) {

  const path     = require('path'),
    SError       = require(path.join(serverlessPath, 'Error')),
    SUtils       = require(path.join(serverlessPath, 'utils/index')),
    BbPromise    = require('bluebird');


  class EventLambdaSNS extends SPlugin {

    constructor(S, config) {
      super(S, config);
    }

    static getName() {
      return 'serverless.core.' + EventLambdaSNS.name;
    }

    registerActions() {

      this.S.addAction(this.eventLambdaSNS.bind(this), {
        handler:       'eventLambdaSNS',
        description:   'Deploy an SNS event source. Subscribes the function to an SNS topic.'
      });

      return BbPromise.resolve();
    }


    eventLambdaSNS(evt) {
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
          topicArn       = 'arn:aws:sns:' + _this.evt.options.region + ':' + awsAccountId + ':' + populatedEvent.config.topicName,
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
            Principal: 'sns.amazonaws.com',
            Qualifier: _this.evt.options.stage
          };
          return _this.aws.request('Lambda', 'addPermission', params, _this.evt.options.stage, _this.evt.options.region)
        })
        .then(function(data) {
          let params = {
            Protocol: 'lambda',
            TopicArn: topicArn,
            Endpoint: lambdaArn
          };
          return _this.aws.request('SNS', 'subscribe', params, _this.evt.options.stage, _this.evt.options.region)
        })
        .then(function(data){
          SUtils.sDebug(`Subscription to SNS topic ${topicArn} added for lambda ${lambdaArn}`);
          return BbPromise.resolve(data);
        });
    }
  }

  return( EventLambdaSNS );
};
