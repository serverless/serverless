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
      EventSourceArn:    'arn:aws:dynamodb:us-east-1:552750238299:table/jaws-users/stream/2015-12-15T15:15:13.175',
      StartingPosition: 'LATEST'
    };


    return _this.Lambda.createEventSourceMappingPromised(params)
      .then(function(data) {
        console.log('hiii')
        console.log(data)
        return evt;
      })
      .catch(function(e) {
        console.log('error')
        console.log(e)
        return evt;
      })

  }

}

module.exports = CreateEventSourceLambdaNodejs;
