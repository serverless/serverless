'use strict';

/**
 * EventCWLogs:
 *     Deploys an IoT Rule and grants permission to the lambda function.
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

  class EventCWLogs extends S.classes.Plugin {

    static getName() {
      return 'serverless.core.' + this.name;
    }

    registerActions() {

      S.addAction(this.eventCWLogs.bind(this), {
        handler:       'eventCWLogs',
        description:   'Deploy a CloudWatch Logs event source'
      });

      return BbPromise.resolve();
    }

    eventCWLogs(evt) {
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
          loggroup           = populatedEvent.config.loggroup,
          loggroupName       = loggroup.name,
          filterName        = loggroup.filterName ? loggroup.filterName : 'nofilter',
          filterPattern    = loggroup.filterPattern;
          //evtDisabled   = loggroup.disabled != null ? loggroup.disabled : false;

      let params = {
        FunctionName: lambdaArn,
        StatementId: statementId,
        Qualifier: stage
      };

      return _this.aws.request('Lambda', 'removePermission', params, stage, region)
        .then(function(data) {
          SUtils.sDebug(`Removed lambda permission with statement ID: ${statementId}`);
        })
        .catch(function(error) {
          SUtils.sDebug(`Error removing lambda permission: ${error}`);
        })
        .then(function(data) {
          var params = {
            limit:1,
            logGroupNamePrefix: loggroupName
          };
          SUtils.sDebug(`Checking for existing Cloudwatch Log Group: ${loggroupName}`);
          return _this.aws.request('CloudWatchLogs', 'describeLogGroups', params, stage, region)
        })
        .catch(function(error) {
          SUtils.sDebug(`Error getting Cloudwatch Log Group: ${error}`);
        })
        .then(function(data){
          if (data.logGroups.length == 0) {
            var params = {
              logGroupName: loggroupName
            };
            SUtils.sDebug(`Creating new Log Group ${loggroupName}`);
            return _this.aws.request('CloudWatchLogs', 'createLogGroup', params, stage, region);
          }
        })
        .catch(function(error) {
          SUtils.sDebug(`Error checking for Log Group: ${error}`);
        })
        .then(function (data) {
          SUtils.sDebug(`Adding lambda permission with statement ID: ${statementId}`);
          let params = {
            FunctionName: lambdaArn,
            StatementId: statementId,
            Action: 'lambda:InvokeFunction',
            Principal: 'logs.'+region+'.amazonaws.com',
            SourceArn: 'arn:aws:logs:' + region + ':' + awsAccountId + ':' + 'log-group:'+loggroupName+':*',
            Qualifier: stage
          };
          return _this.aws.request('Lambda', 'addPermission', params, stage, region)
        })
        .catch(function(error) {
          SUtils.sDebug(`Error adding lambda permission: ${error}`);
        })
        .then(function (data) {
          SUtils.sDebug(`Adding Subscription Filter`);
          let params = {
            destinationArn: lambdaArn,
            filterName: filterName,
            filterPattern: filterPattern,
            logGroupName: loggroupName
          };
          return _this.aws.request('CloudWatchLogs', 'putSubscriptionFilter', params, stage, region);
        })
        .catch(function(error) {
          SUtils.sDebug(`Error adding Subscription Filter: ${error}`);
        })
        .then(function(data) {
          SUtils.sDebug(`Created ${loggroupName} as event source to lambda ${lambdaArn}`);
          return BbPromise.resolve(data);
        })
    }
  }
  return( EventCWLogs );
};
