'use strict';

/**
 * Action: CodeEventDeployLambda
 */

module.exports  = function(SPlugin, serverlessPath) {
  const path    = require('path'),
    SError      = require(path.join(serverlessPath, 'ServerlessError')),
    SUtils      = require(path.join(serverlessPath, 'utils/index')),
    async       = require('async'),
    BbPromise   = require('bluebird');

  class CodeEventDeployLambda extends SPlugin {

    constructor(S, config) {
      super(S, config);
    }

    static getName() {
      return 'serverless.core.' + CodeEventDeployLambda.name;
    }

    registerActions() {

      this.S.addAction(this.codeEventDeployLambda.bind(this), {
        handler: 'codeEventDeployLambda',
        description: 'Creates an event source for a lambda function.'
      });

      return BbPromise.resolve();
    }

    /**
     * Create Event Source for a Lambda Function
     */

    codeEventDeployLambda(evt) {

      let _this = this;

      if (!evt.function.events || !evt.function.events[0].eventSourceArn) return evt;

      // Load AWS Service Instances
      let awsConfig = {
        region: evt.region.region,
        accessKeyId: _this.S._awsAdminKeyId,
        secretAccessKey: _this.S._awsAdminSecretKey,
      };

      _this.Lambda = require('../utils/aws/Lambda')(awsConfig);

      return new BbPromise(function (resolve, reject) {

        let deployedEvents = [];

        async.eachLimit(evt.function.events, 5, function (event, cb) {

          let params = {
            FunctionName: _this.Lambda.sGetLambdaName(_this.S.data.project.get('name'), evt.function.name),
            EventSourceArn: event.eventSourceArn,
            StartingPosition: event.startingPosition,
            BatchSize: event.batchSize,
            Enabled: event.enabled
          };

          return _this.Lambda.createEventSourceMappingPromised(params)
            .then(function (data) {

              SUtils.sDebug(`Created event source ${event.eventSourceArn} for lambda ${evt.function.name}`);

              params.UUID = data.UUID;
              deployedEvents.push(params)

              return cb();
            })
            .catch(function (e) {
              if (e.code === 'ResourceConflictException') {

                SUtils.sDebug(`Event source ${event.eventSourceArn} already exists for lambda ${evt.function.name}`);

                return cb();
              } else {
                reject(new SError(`Error setting lambda event source: ` + e));
              }
            })

        }, function () {
          evt.function.events = deployedEvents;
          return resolve(evt);
        });
      });


    }

  }
  return( CodeEventDeployLambda );
};