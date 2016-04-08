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

module.exports = function(S) {

  const path   = require('path'),
    SUtils     = S.utils,
    SError     = require(S.getServerlessPath('Error')),
    BbPromise  = require('bluebird');

  class EventLambdaSNS extends S.classes.Plugin {

    static getName() {
      return 'serverless.core.' + this.name;
    }

    registerActions() {

      S.addAction(this.eventLambdaSNS.bind(this), {
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

      _this.aws = S.getProvider('aws');

      let event          = S.getProject().getEvent( _this.evt.options.name ),
          populatedEvent = event.toObjectPopulated({stage: _this.evt.options.stage, region: _this.evt.options.region}),
          functionName   = event.getFunction().getDeployedName(_this.evt.options),
          statementId    = 'sEvents-' + functionName + '-' + event.name + '-' + _this.evt.options.stage,
          awsAccountId   = _this.aws.getAccountId(_this.evt.options.stage, _this.evt.options.region),
          lambdaArn      = 'arn:aws:lambda:' + _this.evt.options.region + ':' + awsAccountId + ':function:' + functionName + ':' + _this.evt.options.stage,
          topic          = populatedEvent.config.topic || populatedEvent.config.topicName,
          topicArn       = topic && topic.indexOf('arn:') === 0 ? topic : ('arn:aws:sns:' + _this.evt.options.region + ':' + awsAccountId + ':' + topic),
          topicRegion    = /arn:aws:sns:(.*):(.*):(.*)/.exec(topicArn)[1];

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
          return _this.aws.request('SNS', 'subscribe', params, _this.evt.options.stage, topicRegion)
        })
        .then(function(data){
          SUtils.sDebug(`Subscription to SNS topic ${topicArn} added for lambda ${lambdaArn}`);
          return BbPromise.resolve(data);
        });
    }
  }

  return( EventLambdaSNS );
};
