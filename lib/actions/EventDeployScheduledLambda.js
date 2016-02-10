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
      let event = _this.S.state.getEvents({paths: [_this.evt.options.path]})[0],
        populatedEvent = event.getPopulated({stage: _this.evt.options.stage, region: _this.evt.options.region}),
        pathName = _this.evt.options.path.replace(/\//g, '-').replace('#', '-'),
        awsAccountId = _this.S.state.meta.get().stages[_this.evt.options.stage].regions[_this.evt.options.region].variables.iamRoleArnLambda.split('::')[1].split(':')[0],
        lambdaArn = "arn:aws:lambda:" + _this.evt.options.region + ":" + awsAccountId + ":function:" + _this.S.getProject().getName() + "-" + _this.evt.options.path.split('/')[0] + "-" + _this.evt.options.path.split('/')[1] + "-" + _this.evt.options.path.split('/')[2].split('#')[0] + ":" + _this.evt.options.stage;

      populatedEvent.config.enabled = populatedEvent.config.enabled ? 'ENABLED' : 'DISABLED';

      let awsConfig = {
        region: _this.evt.options.region,
        accessKeyId: _this.S.config.awsAdminKeyId,
        secretAccessKey: _this.S.config.awsAdminSecretKey
      };

      _this.CloudWatchEvents = require('../utils/aws/CloudWatchEvents')(awsConfig);

      var params = {
        Name: pathName,
        ScheduleExpression: populatedEvent.config.schedule,
        State: populatedEvent.config.enabled
      };

      return _this.CloudWatchEvents.putRuleAsync(params)
        .then(function (data) {

          SUtils.sDebug(`Put CloudWatchEvents Rule ${pathName}`);

          let params = {
            Rule: pathName,
            Targets: [
              {
                Arn: lambdaArn,
                Id: pathName
              }
            ]
          };
          return _this.CloudWatchEvents.putTargetsAsync(params);
        })
        .then(function (data) {
          SUtils.sDebug(`Set lambda ${lambdaArn} as target for rule ${pathName} for lambda ${pathName}`);

          return BbPromise.resolve(data);
        });
    }
  }

  return ( EventDeployScheduledLambda );
};