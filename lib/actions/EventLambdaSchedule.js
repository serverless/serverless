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

      let func           = S.getProject().getFunction( _this.evt.options.funcName ),
          event          = func.getEvent( _this.evt.options.name ),
          stage          = _this.evt.options.stage,
          region         = _this.evt.options.region,
          populatedEvent = event.toObjectPopulated({ stage, region }),
          functionName   = event.getFunction().getDeployedName(_this.evt.options),
          ruleName       = S.getProject().getName() + '-' + populatedEvent.name,
          awsAccountId   = _this.aws.getAccountId(stage, region),
          lambdaArn      = 'arn:aws:lambda:' + region + ':' + awsAccountId + ':function:' + functionName;


      SUtils.sDebug(`Putting CloudWatchEvents Rule ${ruleName}`);

      // The rule itself is always enabled. However, the triggers might not
      const params = {
        Name: ruleName,
        Description: _this.evt.options.description,
        ScheduleExpression: populatedEvent.config.schedule,
        State: 'ENABLED'
      };
      return _this.aws.request('CloudWatchEvents', 'putRule', params, stage, region)
        .then(function () {
          // First remove permissions so we can set them again
          const params = {
            FunctionName: lambdaArn,
            StatementId: 's_events_' + ruleName + '_' + functionName + '_' + stage,
            Qualifier: stage
          };
          return _this.aws.request('Lambda', 'removePermission', params, stage, region)
            .then(function() {
               SUtils.sDebug(`${stage} - ${region} - ${ruleName}: removed existing lambda access policy statement`);
            })
            .catch(function(error) {})
        })
        .then(function () {

          SUtils.sDebug(`Adding Permissions for Event Rule ${ruleName}`);

          const params = {
            FunctionName: lambdaArn,
            StatementId: 's_events_' + ruleName + '_' + functionName + '_' + stage,
            Action: populatedEvent.config.enabled ? 'lambda:InvokeFunction' : 'lambda:DisableInvokeFunction',
            Principal: 'events.amazonaws.com',
            SourceArn: 'arn:aws:events:' + region + ':' + awsAccountId + ':rule/' + ruleName,
            Qualifier: stage
          };
          return _this.aws.request('Lambda', 'addPermission', params, stage, region)
            .then(function() {
               SUtils.sDebug(`${stage} - ${region} - ${ruleName}: added lambda access policy statement`);
            });
        })
        .then(function () {

          if (populatedEvent.config.enabled) {
            SUtils.sDebug(`Setting lambda ${lambdaArn}:${stage} as target for rule ${ruleName} for lambda ${functionName}`);

            const params = {
              Rule: ruleName,
              Targets: [
                {
                  Arn: lambdaArn + ':' + stage,
                  Id: functionName + '_' + stage,
                  InputPath: _this.evt.options.inputPath
                }
              ]
            };

            if (populatedEvent.config.input) {
              params.Targets[0].Input = JSON.stringify(populatedEvent.config.input);
            }

            return _this.aws.request('CloudWatchEvents', 'putTargets', params, stage, region)
              .then(function() {
                SUtils.sDebug(`${stage} - ${region} - ${ruleName}: created target "${functionName}:${stage}"`);
              });
          }
          else {
            SUtils.sDebug(`Removing lambda ${lambdaArn}:${stage} as target for rule ${ruleName} for lambda ${functionName}`);

            const params = {
              Rule: ruleName,
              Ids: [ functionName + '_' + stage ]
            };
            return _this.aws.request('CloudWatchEvents', 'removeTargets', params, stage, region)
              .then(function() {
                 SUtils.sDebug(`${stage} - ${region} - ${ruleName}: removed existing target "${functionName}:${stage}"`);
              })
              .catch(function(error) {})
          }

        });
    }
  }

  return ( EventLambdaSchedule );
};
