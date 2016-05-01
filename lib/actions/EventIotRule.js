'use strict';

/**
 * EventIotRule:
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
    SCli       = require(S.getServerlessPath('utils/cli')),
    SError     = require(S.getServerlessPath('Error')),
    BbPromise  = require('bluebird'),
    _          = require('lodash');

  class EventIotRule extends S.classes.Plugin {

    static getName() {
      return 'serverless.core.' + this.name;
    }

    registerActions() {

      S.addAction(this.eventIotRule.bind(this), {
        handler:       'eventIotRule',
        description:   'Deploy an Iot Rule event source'
      });

      return BbPromise.resolve();
    }

    /**
     * Code Package Lambda
     */

    eventIotRule(evt) {
      let _this     = this;
      _this.evt     = evt;

      const stage  = this.evt.options.stage,
            region = this.evt.options.region;

      if (!stage || !region || !_this.evt.options.name) {
        return BbPromise.reject(new SError(`Missing stage, region or event name.`));
      }

      _this.aws = S.getProvider('aws');
      SUtils.sDebug(`AccountID: ${_this.aws.getAccountId(stage, region)}`);
      let event          = S.getProject().getEvent( _this.evt.options.name ),
          populatedEvent = event.toObjectPopulated({stage, region}),
          functionName   = event.getFunction().getDeployedName(_this.evt.options),
          statementId    = 'sEvents-' + functionName + '-' + event.name + '-' + stage,
          awsAccountId   = _this.aws.getAccountId(stage, region),
          lambdaArn      = 'arn:aws:lambda:' + region + ':' + awsAccountId + ':function:' + functionName + ':' + stage,
          ruleName       = populatedEvent.config.rule.name,
          rulesql        = populatedEvent.config.rule.sql,
          description    = populatedEvent.config.rule.description ? populatedEvent.config.rule.description : 'Serverless IoT Rule',
          iotSQLVersion  = populatedEvent.config.rule.iotSQLVersion ? populatedEvent.config.rule.iotSQLVersion : '2016-03-23-beta',
          ruleDisabled   = populatedEvent.config.rule.ruleDisabled != null ? populatedEvent.config.rule.ruleDisabled : false;

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
        .then(function(data){
          var params = {
            ruleName: ruleName
          };
          SUtils.sDebug(`Checking for existing Iot Rule: ${ruleName}`);
          return _this.aws.request('Iot', 'getTopicRule', params, stage, region);
        })
        .catch(function(error) {
          SUtils.sDebug(`Error getting IoT Rule: ${error}`);
        })
        .then(function(data){
          var params = {
            ruleName: ruleName,
            topicRulePayload: {
              actions: [{
                lambda: {
                  functionArn: lambdaArn
                }
              }],
              sql: rulesql,
              awsIotSqlVersion: iotSQLVersion,
              description: description,
              ruleDisabled: ruleDisabled
            }
          };
          if (data != null) {
            SUtils.sDebug(`Overwriting existing IoT Rule ${ruleName}`);
            return _this.aws.request('Iot', 'replaceTopicRule', params, stage, region);
          } else {
            SUtils.sDebug(`Creating new IoT Rule ${ruleName}`);
            return _this.aws.request('Iot', 'createTopicRule', params, stage, region);
          }

        })
        .catch(function(error) {
          SUtils.sDebug(`Error creating or overwriting IoT Rule: ${error}`);
        })
        .then(function (data) {
          SUtils.sDebug(`Adding lambda permission with statement ID: ${statementId}`);
          let params = {
            FunctionName: lambdaArn,
            StatementId: statementId,
            Action: 'lambda:InvokeFunction',
            Principal: 'iot.amazonaws.com',
            SourceArn: 'arn:aws:iot:::' + 'rule/'+ruleName,
            Qualifier: stage
          };
          return _this.aws.request('Lambda', 'addPermission', params, stage, region)
        })
        .then(function(data) {
          var params = {};
          return _this.aws.request('Iot', 'describeEndpoint', params, stage, region)
        })
        .then(function(data) {
          SCli.log('IoT Endpoint: "'  + data.endpointAddress + '"');
        })
        .then(function(data) {
          SUtils.sDebug(`Created the Iot action and linked ${ruleName} to lambda ${lambdaArn}`);
          return BbPromise.resolve(data);
        })
    }
  }
  return( EventIotRule );
};
