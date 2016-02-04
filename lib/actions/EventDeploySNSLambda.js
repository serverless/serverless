'use strict';

/**
 */

module.exports = function(SPlugin, serverlessPath) {

  const path     = require('path'),
    SError       = require(path.join(serverlessPath, 'ServerlessError')),
    SUtils       = require(path.join(serverlessPath, 'utils/index')),
    BbPromise    = require('bluebird');


  class EventDeploySNSLambda extends SPlugin {

    constructor(S, config) {
      super(S, config);
    }

    static getName() {
      return 'serverless.core.' + EventDeploySNSLambda.name;
    }

    registerActions() {

      this.S.addAction(this.eventDeploySNSLambda.bind(this), {
        handler:       'eventDeploySNSLambda',
        description:   'Deploy an SNS event source. Subscribes the function to an SNS topic.'
      });

      return BbPromise.resolve();
    }

    /**
     * Code Package Lambda
     */

    eventDeploySNSLambda(evt) {
      let _this     = this;
      _this.evt     = evt;

      // Validate required properties
      if (!_this.evt.options.stage || !_this.evt.options.region || !_this.evt.options.path) {
        return BbPromise.reject(new SError(`Missing stage, region or path.`));
      }

      let event          = _this.S.state.getEvents({ paths: [_this.evt.options.path] })[0],
          populatedEvent = event.getPopulated({stage: _this.evt.options.stage, region: _this.evt.options.region}),
          regionVars     = _this.S.state.getMeta().stages[_this.evt.options.stage].regions[_this.evt.options.region].variables,
          eventVar       = 'eventID:' + event._config.sPath,
          awsAccountId   = _this.S.state.meta.get().stages[_this.evt.options.stage].regions[_this.evt.options.region].variables.iamRoleArnLambda.split('::')[1].split(':')[0],
          lambdaArn      = "arn:aws:lambda:" + _this.evt.options.region + ":" + awsAccountId + ":function:" + _this.S.state.getProject().name + "-" + _this.evt.options.path.split('/')[0] + "-" + _this.evt.options.path.split('/')[1] + "-" + _this.evt.options.path.split('/')[2].split('#')[0];

      // if we're already subscribed, resolve.
      if (regionVars[eventVar]) return BbPromise.resolve();

      let awsConfig  = {
        region:          _this.evt.options.region,
        accessKeyId:     _this.S.config.awsAdminKeyId,
        secretAccessKey: _this.S.config.awsAdminSecretKey
      };

      _this.SNS = require('../utils/aws/SNS')(awsConfig);

      let params = {
        Protocol: 'lambda',
        TopicArn: populatedEvent.config.topicArn,
        Endpoint: lambdaArn
      };

      return _this.SNS.subscribePromised(params)
        .then(function(data) {
          console.log(1)
          console.log(data)
          // confirm subscription
          let params = {
            Token: data.ResponseMetadata.RequestId,
            TopicArn: populatedEvent.config.topicArn,
            AuthenticateOnUnsubscribe: 'false'
          };
          return _this.SNS.confirmSubscriptionPromised(params);
        })
        .then(function(data){
          console.log(2)
          console.log(data)

          // save UUID
          //regionVars[eventVar] = data.UUID;
          //_this.S.state.save();

          return BbPromise.resolve(data);
        });
    }
  }


  return( EventDeploySNSLambda );
};
