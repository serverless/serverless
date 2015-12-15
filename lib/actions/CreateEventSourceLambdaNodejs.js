'use strict';

/**
 * Action: FunctionRunLambdaNodeJs
 */

const SPlugin = require('../ServerlessPlugin'),
  SError      = require('../ServerlessError'),
  SUtils      = require('../utils/index'),
  SCli        = require('../utils/cli'),
  BbPromise   = require('bluebird'),
  path        = require('path'),
  chalk       = require('chalk'),
  context     = require('../utils/context');


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

    // Load AWS Service Instances
    let awsConfig = {
      region:          evt.region.region,
      accessKeyId:     _this.S._awsAdminKeyId,
      secretAccessKey: _this.S._awsAdminSecretKey,
    };

    _this.Lambda     = require('../utils/aws/Lambda')(awsConfig);

    let params = {
      FunctionName: _this.Lambda.sGetLambdaName(_this.S._projectJson, evt.function),
      EventSourceArn:    evt.function.eventSource,
      StartingPosition: 'LATEST'
    };


    return _this.Lambda.createEventSourceMappingPromised(params)
      .then(function(data) {
        SCli.log('Created Event Source for Lambda: ' + evt.function.name);

        evt.function.EventSourceArn  = data.EventSourceArn;
        evt.function.EventSourceUUID = data.UUID;
        return evt;
      })
      .catch(function(e) {
        console.log('error')
        if (e.code === 'ResourceConflictException') {
          SCli.log('Event source already exists: ' + evt.function.name);
          return evt;
        } else {
          throw new SError(`Error setting lambda event source: ` + e);
        }
      })

  }

}

module.exports = CreateEventSourceLambdaNodejs;
