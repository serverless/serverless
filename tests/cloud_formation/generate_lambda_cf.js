var testUtils = require('../test_utils'),
    path = require('path'),
    Promise = require('bluebird');

var chai = require('chai'),
    chaiAsPromised = require('chai-as-promised'),
    assert = chai.assert,
    expect = chai.expect,
    mock = require('mock-fs');

chai.should();
chai.expect();
chai.use(chaiAsPromised);

var generateLambda = require('../../lib/cloud_formation/generate_lambda_cf.js');

describe('Test "generate lambda"', function() {

  after(function() {
    mock.restore();
  })

  var projName = 'testLambda',
      region   = 'us-east-1',
      stage    = 'test';
  var options = { projName: projName, region: region, stage: stage }

  var lambdaCfTemplate = {"AWSTemplateFormatVersion":"2010-09-09","Description":"The AWS CloudFormation template for this JAWS projects lambdas","Parameters":{"aaLambdaRoleArn":{"Type":"String","Default":""}},"Resources":{"lTemplate":{"Type":"AWS::Lambda::Function","Properties":{"Code":{"S3Bucket":"","S3Key":""},"Description":"","Handler":"","MemorySize":1024,"Role":{"Ref":"aaLambdaRoleArn"},"Runtime":"","Timeout":6}}}};

  var awsmTemplate = function() { return {"lambda":{"envVars":[],"deploy":true,"package":{"optimize":{"builder":"browserify","minify":true,"ignore":[],"exclude":["aws-sdk"],"includePaths":[]},"excludePatterns":[]},"cloudFormation":{"Description":"","Handler":"aws_modules/test/test/handler.handler","MemorySize":1024,"Runtime":"nodejs","Timeout":6}},"apiGateway":{"deploy":false,"cloudFormation":{"Type":"AWS","Path":"test/test","Method":"GET","AuthorizationType":"none","ApiKeyRequired":false,"RequestTemplates":{},"RequestParameters":{},"Responses":{"400":{"statusCode":"400"},"default":{"statusCode":"200","responseParameters":{},"responseModels":{},"responseTemplates":{"application/json":""}}}}}} }


  describe('generate lambda', function() {
    mock({ 'test1AwsmPath.json': JSON.stringify(awsmTemplate()) });
    options.taggedLambdaPkgs = [{ lambdaName: 'test1', awsmPath: 'test1AwsmPath.json' }];
    options.lambdaRoleArn = 'role1234';

    var stackTemplate = null;
    var subject = function() { return generateLambda.generateLambdaCf(stackTemplate, options, lambdaCfTemplate) }

    it('generates the lambda cloudformation format', function() {
      subject().should.eventually.have.property('Resources');
      subject().should.eventually.have.property('Parameters');
    })

    it('populates the lamda role ARN', function() {
      subject().should.eventually.have.property('Parameters')
        .with.property('aaLambdaRoleArn')
        .with.property('Default')
        .equal(options.lambdaRoleArn)
    })

    context('given no stackTemplate', function() {
      stackTemplate = null;

      it('generates the lambda cf function without a merge', function() {
        subject().should.eventually.have.property('Resources')
          .with.property('test1')
          .with.property('Type').equal('AWS::Lambda::Function');
      })
    })

    context('with an event source', function() {
      var template = awsmTemplate();
      template.eventSource = {
         "test1Kinesis": {
           "type": "kinesis",
           "cloudFormation": {
             "EventSourceArn": "arn:aws:kinesis:abcd:1234:events-staging",
             "StartingPosition": "TRIM_HORIZON"
           }
         }
       }

      mock({ 'test1AwsmPath.json': JSON.stringify(template) });

      it('creates the cf event source mapping', function() {
        subject().should.eventually.have.property('Resources')
          .with.property('test1')
          .with.property('Type').equal('AWS::Lambda::Function');

        subject().should.eventually.have.property('Resources')
          .with.property('estest1Kinesis')
          .with.property('Type').equal('AWS::Lambda::EventSourceMapping');

        subject().should.eventually.have.property('Resources')
          .with.property('estest1Kinesis')
          .with.property('DependsOn').equal('test1');
      })

    })
  })

})
