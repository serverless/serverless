'use strict';

/**
 * EventLambdaSchedule:
 *     Deploys a Schedule based event source. Allows for scheduling lambda functions.
 *
 * Options:
 *     - stage: stage to deploy event to
 *     - region: region to deploy event to
 *     - path: event path
 */

module.exports = function (S) {

  const path      = require('path'),
        SUtils    = S.utils,
        SError    = require(S.getServerlessPath('Error')),
        BbPromise = require('bluebird');

  class EventLambdaSchedule extends S.classes.Plugin {

    static getName() {
      return 'serverless.core.' + this.name;
    }

    registerActions() {

      S.addAction(this.eventLambdaSchedule.bind(this), {
        handler: 'eventLambdaSchedule',
        description: 'Deploy a schedule based event source'
      });

      return BbPromise.resolve();
    }


    eventLambdaSchedule(evt) {
      let _this = this;
      _this.evt = evt;

      if (!_this.evt.options.stage || !_this.evt.options.region || !_this.evt.options.name) {
        return BbPromise.reject(new SError(`Missing stage, region or event name.`));
      }
      _this.aws = S.getProvider('aws');

      let event          = S.getProject().getEvent( _this.evt.options.name ),
          populatedEvent = event.toObjectPopulated({stage: _this.evt.options.stage, region: _this.evt.options.region}),
          functionName   = event.getFunction().getDeployedName(_this.evt.options),
          ruleName       = functionName + '-' + populatedEvent.name + '-' +  _this.evt.options.stage,
          awsAccountId   = _this.aws.getAccountId(_this.evt.options.stage, _this.evt.options.region),
          lambdaArn      = 'arn:aws:lambda:' + _this.evt.options.region + ':' + awsAccountId + ':function:' + functionName,
          stage          = _this.evt.options.stage;


      populatedEvent.config.enabled = populatedEvent.config.enabled ? 'ENABLED' : 'DISABLED';

      SUtils.sDebug(`Putting CloudWatchEvents Rule ${ruleName}`);

      var params = {
        Name: ruleName,
        ScheduleExpression: populatedEvent.config.schedule,
        State: populatedEvent.config.enabled
      };
      return _this.aws.request('CloudWatchEvents', 'putRule', params, _this.evt.options.stage, _this.evt.options.region)
        .then(function (data) {
          // First remove permissions so we can set them again
          let params = {
            FunctionName: lambdaArn,
            StatementId: 's_events_' + ruleName + "_" + stage,
            Qualifier: _this.evt.options.stage
          };
          return _this.aws.request('Lambda', 'removePermission', params, _this.evt.options.stage, _this.evt.options.region)
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
          return _this.aws.request('Lambda', 'addPermission', params, _this.evt.options.stage, _this.evt.options.region)
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

          if (populatedEvent.config.input) {
            params.Targets[0].Input = JSON.stringify(populatedEvent.config.input);
          }
          return _this.aws.request('CloudWatchEvents', 'putTargets', params, _this.evt.options.stage, _this.evt.options.region);
        });
    }
  }

  return ( EventLambdaSchedule );
};
