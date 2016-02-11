'use strict';

/**
 * EventDeployScheduledLambda:
 *     Deploys a Schedule based event source. Allows for scheduling lambda functions.
 *
 * Options:
 *     - stage: stage to deploy event to
 *     - region: region to deploy event to
 *     - path: event path
 */

module.exports = function (SPlugin, serverlessPath) {

  const path      = require('path'),
        SError    = require(path.join(serverlessPath, 'ServerlessError')),
        SUtils    = require(path.join(serverlessPath, 'utils/index')),
        BbPromise = require('bluebird');


  class EventDeployScheduledLambda extends SPlugin {

    constructor(S, config) {
      super(S, config);
    }

    static getName() {
      return 'serverless.core.' + EventDeployScheduledLambda.name;
    }

    registerActions() {

      this.S.addAction(this.eventDeployScheduledLambda.bind(this), {
        handler: 'eventDeployScheduledLambda',
        description: 'Deploy a schedule based event source'
      });

      return BbPromise.resolve();
    }

    /**
     * Event Deploy Scheduled Lambda
     */

    eventDeployScheduledLambda(evt) {
      let _this = this;
      _this.evt = evt;

      if (!_this.evt.options.stage || !_this.evt.options.region || !_this.evt.options.path) {
        return BbPromise.reject(new SError(`Missing stage, region or path.`));
      }
      let event          = _this.S.state.getEvents({paths: [_this.evt.options.path]})[0],
          populatedEvent = event.getPopulated({stage: _this.evt.options.stage, region: _this.evt.options.region}),
          functionName   = _this.S.getProject().getFunction( _this.evt.options.path.split('#')[0] ).getDeployedName(_this.evt.options),
          ruleName       = functionName + '-' + event.name,
          awsAccountId   = _this.S.state.meta.get().stages[_this.evt.options.stage].regions[_this.evt.options.region].variables.iamRoleArnLambda.split('::')[1].split(':')[0],
          lambdaArn      = 'arn:aws:lambda:' + _this.evt.options.region + ':' + awsAccountId + ':function:' + functionName,
          stage          = _this.evt.options.stage;

      populatedEvent.config.enabled = populatedEvent.config.enabled ? 'ENABLED' : 'DISABLED';

      let awsConfig = {
        region: _this.evt.options.region,
        accessKeyId: _this.S.config.awsAdminKeyId,
        secretAccessKey: _this.S.config.awsAdminSecretKey
      };

      _this.CloudWatchEvents = require('../utils/aws/CloudWatchEvents')(awsConfig);
      _this.Lambda = require('../utils/aws/Lambda')(awsConfig);

      SUtils.sDebug(`Putting CloudWatchEvents Rule ${ruleName}`);

      var params = {
        Name: ruleName,
        ScheduleExpression: populatedEvent.config.schedule,
        State: populatedEvent.config.enabled
      };

      return _this.CloudWatchEvents.putRuleAsync(params)

        .then(function (data) {
          // First remove permissions so we can set them again
          let params = {
            FunctionName: lambdaArn,
            StatementId: 's_events_' + ruleName + "_" + stage,
            Qualifier: _this.evt.options.stage
          };
          return _this.Lambda.removePermissionPromised(params)
            .then(function(data) {
               SUtils.sDebug(
                    '"'
                    + _this.evt.options.stage + ' - '
                    + _this.evt.options.region
                    + ' - ' + ruleName + '": '
                    + 'removed existing lambda access policy statement');
            })
            .catch(function(error) {})
        })
        .then(function (data) {

          SUtils.sDebug(`Adding Permissions for Event Rule ${ruleName}`);

          let params = {
            FunctionName: lambdaArn,
            StatementId: 's_events_' + ruleName + "_" + stage,
            Action: 'lambda:InvokeFunction',
            Principal: 'events.amazonaws.com',
            Qualifier: _this.evt.options.stage
          };
          return _this.Lambda.addPermissionPromised(params);
        })
        .then(function (data) {

          SUtils.sDebug(`Setting lambda ${lambdaArn}:${stage} as target for rule ${ruleName} for lambda ${functionName}`);

          let params = {
            Rule: ruleName,
            Targets: [
              {
                Arn: lambdaArn + ":" + stage,
                Id: functionName
              }
            ]
          };
          return _this.CloudWatchEvents.putTargetsAsync(params)
            .then(function(data){
              return BbPromise.resolve(data);
            });
        });
    }
  }

  return ( EventDeployScheduledLambda );
};

/*
 aws lambda add-permission \
 --function-name serverless-v193k-js-fun \
 --qualifier dev \
 --region us-east-1 \
 --statement-id qwertyjmb \
 --action "lambda:InvokeFunction" \
 --principal events.amazonaws.com \
 --source-arn arn:aws:events:us-east-1:552750238299:rule/serverless-v193k-js-fun-schedule \
 --source-account 552750238299 \
 --profile default
 */