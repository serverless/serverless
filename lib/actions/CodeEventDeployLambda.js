'use strict';

/**
 * Action: FunctionRunLambdaNodeJs
 */


module.exports = function (SPlugin, serverlessPath) {

  const SPlugin = require('../ServerlessPlugin'),
    SError = require('../ServerlessError'),
    SCli = require('../utils/cli'),
    async = require('async'),
    path = require('path'),
    BbPromise = require('bluebird');


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

<<<<<<< f2c865837d1a5c70e8ea7b865681add64c8e783c
=======
    if (!evt.function.events[0].eventSourceArn) return evt;
>>>>>>> lowercase events obj

      /**
       * Create Event Source for a Lambda Function
       */


      codeEventDeployLambda(evt){
        let _this = this;
        if (!evt.function.event[0].EventSourceArn) return evt;

        // Load AWS Service Instances
        let awsConfig = {
          region: evt.region.region,
          accessKeyId: _this.S._awsAdminKeyId,
          secretAccessKey: _this.S._awsAdminSecretKey,
        };


<<<<<<< f2c865837d1a5c70e8ea7b865681add64c8e783c
        return new BbPromise(function (resolve, reject) {

=======
        // Create new evt object for concurrent operations
        let params = {
          FunctionName: _this.Lambda.sGetLambdaName(_this.S._projectJson, evt.function),
          EventSourceArn: event.eventSourceArn,
          StartingPosition: event.startingPosition,
          BatchSize: event.batchSize,
          Enabled: event.enabled
        };
>>>>>>> lowercase events obj

          async.eachLimit(evt.function.event, 5, function (event, cb) {

            // Create new evt object for concurrent operations
            let params = event;

            params.FunctionName = _this.Lambda.sGetLambdaName(_this.S._projectJson, evt.function);

            return _this.Lambda.createEventSourceMappingPromised(params)
              .then(function (data) {

                SCli.sDebug(`Created event source ${event.EventSourceArn} for lambda ${evt.function.name}`);

                evt.function.event.UUID = data.UUID;
                return cb();
              })
              .catch(function (e) {
                if (e.code === 'ResourceConflictException') {

                  SCli.sDebug(`Event source ${event.EventSourceArn} already exists for lambda ${evt.function.name}`);

                  return cb();
                } else {
                  throw new SError(`Error setting lambda event source: ` + e);
                }
              })

          }, function () {
            return resolve(evt);
          });
        });


      }


    }

    return(CodeEventDeployLambda);
  }
  ;

