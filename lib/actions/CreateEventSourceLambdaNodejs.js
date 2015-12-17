'use strict';

/**
 * Action: FunctionRunLambdaNodeJs
 */

module.exports = function(SPlugin, serverlessPath) {
  const path = require('path'),
    SCli        = require(path.join(serverlessPath, 'utils/cli')),
    BbPromise   = require('bluebird');


  class CreateEventSourceLambdaNodejs extends SPlugin {

    constructor(S, config) {
      super(S, config);
    }

    static getName() {
      return 'serverless.core.' + CreateEventSourceLambdaNodejs.name;
    }

    registerActions() {

      this.S.addAction(this.createEventSourceLambdaNodejs.bind(this), {
        handler:       'createEventSourceLambdaNodejs',
        description:   'Creates an event source for a lambda function.'
      });

      return BbPromise.resolve();
    }

    /**
     * Create Event Source for a Lambda Function
     */

    createEventSourceLambdaNodejs(evt) {

      let _this = this;

      if (!evt.function.eventSourceArn) return evt;

      // Load AWS Service Instances
      let awsConfig = {
        region:          evt.region.region,
        accessKeyId:     _this.S._awsAdminKeyId,
        secretAccessKey: _this.S._awsAdminSecretKey,
      };

      _this.Lambda = require('../utils/aws/Lambda')(awsConfig);

      let params = {
        FunctionName: _this.Lambda.sGetLambdaName(_this.S._projectJson, evt.function),
        EventSourceArn:    evt.function.eventSourceArn,
        StartingPosition: 'LATEST'
      };


      return _this.Lambda.createEventSourceMappingPromised(params)
        .then(function(data) {

          SCli.log('Created event source for lambda: ' + evt.function.name);

          evt.function.EventSourceUUID = data.UUID;
          return evt;
        })
        .catch(function(e) {
          if (e.code === 'ResourceConflictException') {

            SCli.log('Event source already exists for lambda: ' + evt.function.name);

            return evt;
          } else {
            return evt;
            //throw new SError(`Error setting lambda event source: ` + e);
          }
        })

    }

  }

  return( CreateEventSourceLambdaNodejs );
};
