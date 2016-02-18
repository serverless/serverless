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
        SError    = require(path.join(serverlessPath, 'Error')),
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
      let event          = _this.S.getProject().getEvent( _this.evt.options.path ),
          populatedEvent = event.getPopulated({stage: _this.evt.options.stage, region: _this.evt.options.region}),
          functionName   = _this.S.getProject().getFunction( _this.evt.options.path.split('#')[0] ).getDeployedName(_this.evt.options),
          ruleName       = functionName + '-' + event.name,
          awsAccountId   = _this.S.state.meta.get().stages[_this.evt.options.stage].regions[_this.evt.options.region].variables.iamRoleArnLambda.split('::')[1].split(':')[0],
          lambdaArn      = 'arn:aws:lambda:' + _this.evt.options.region + ':' + awsAccountId + ':function:' + functionName,
          stage          = _this.evt.options.stage;

      populatedEvent.config.enabled = populatedEvent.config.enabled ? 'ENABLED' : 'DISABLED';

      _this.aws = _this.S.getProvider('aws');

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
          return _this.aws.request('CloudWatchEvents', 'putTargets', params, _this.evt.options.stage, _this.evt.options.region)
            .then(function(data){
              return BbPromise.resolve(data);
            });
        });
    }
  }

  return ( EventDeployScheduledLambda );
};