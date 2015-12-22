'use strict';

/**
 * Action: FunctionRunLambdaNodeJs
 */

const SPlugin = require('../ServerlessPlugin'),
  SError      = require('../ServerlessError'),
  SCli        = require('../utils/cli'),
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

    if (!evt.function.events[0].eventSourceArn) return evt;

    // Load AWS Service Instances
    let awsConfig = {
      region: evt.region.region,
      accessKeyId: _this.S._awsAdminKeyId,
      secretAccessKey: _this.S._awsAdminSecretKey,
    };

    _this.Lambda = require('../utils/aws/Lambda')(awsConfig);

    return new BbPromise(function (resolve, reject) {


      async.eachLimit(evt.function.events, 5, function (event, cb) {

        // Create new evt object for concurrent operations
        let params = {
          FunctionName: _this.Lambda.sGetLambdaName(_this.S._projectJson, evt.function),
          EventSourceArn: event.eventSourceArn,
          StartingPosition: event.startingPosition,
          BatchSize: event.batchSize,
          Enabled: event.enabled
        };

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

module.exports = CodeEventDeployLambda;