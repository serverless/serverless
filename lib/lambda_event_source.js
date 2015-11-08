var JawsError = require('./jaws-error'),
    JawsCli = require('./utils/cli'),
    Promise = require('bluebird'),
    fs = require('fs'),
    os = require('os'),
    path = require('path'),
    chalk = require('chalk'),
    AWSUtils = require('./utils/aws'),
    uuid = require('node-uuid'),
    _ = require('lodash'),
    utils = require('./utils/index');

var snsHandler = function(arn, options) {
  var statement = {
    Action: 'lambda:InvokeFunction',
    FunctionName: options.functionName,
    Principal: 'sns.amazonaws.com',
    StatementId: uuid.v4(),
    SourceArn: arn
  };

  return AWSUtils.lambdaAddPermission(options.profile, options.region, statement)
           .then(AWSUtils.snsSubscribe(options.profile, options.region, options.lambdaArn, arn));
}

var getHandler = function(type, arn, options) {
  switch (type) {
    case "sns":
      return snsHandler(arn, options);
    default:
      console.log("cannot handle lambda event source: " + type);
      return Promise.resolve();
  }
}


module.exports.applyLambdaEventSource = function(awsmLambdas, stage, region, profile, projectJson) {
  return AWSUtils.cfListStackResources(
      profile,
      region,
      stage + '-' + projectJson.name + '-l',
      undefined
  ).then(function(resources) {
    var processable = [];

    _.forEach(awsmLambdas, function(lambda) {
      var awsm      = utils.readAndParseJsonSync(lambda.awsmPath);
      var resource  = _.first(_.select(resources.StackResourceSummaries, function(r) { return r.LogicalResourceId === lambda.lambdaName }));
      var accountId = _.select(projectJson.stages[stage], function(data) { return data.region === region })[0].iamRoleArnLambda.replace('arn:aws:iam::', '').split(':')[0];
      var functionName = resource.PhysicalResourceId;
      var lambdaArn = "arn:aws:lambda:" + region + ":" + accountId + ":function:" + functionName;

      if (awsm.eventSource && resource) {
        _.forEach(awsm.eventSource, function(source, k) {
          processable.push(getHandler(source.type, source.cloudFormation.EventSourceArn, { region: region, profile: profile,
            lambdaArn: lambdaArn, functionName: functionName }));
        })
      }
    });

    return Promise.all(processable).then(console.log);
  })

}
