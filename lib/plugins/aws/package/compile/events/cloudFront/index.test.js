'use strict';

const expect = require('chai').expect;
const AwsProvider = require('../../../../provider/awsProvider');
const AwsCompileCloudFrontEvents = require('./index');
const Serverless = require('../../../../../../Serverless');

describe('AwsCompileCloudFrontEvents', () => {
  let serverless;
  let awsCompileCloudFrontEvents;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.service.environment = {
      vars: {},
      stages: {
        dev: {
          vars: {},
          regions: {
            'us-east-1': {
              vars: {},
            },
          },
        },
      },
    };

    serverless.service.resources = {};
    serverless.service.provider.compiledCloudFormationTemplate = {
      Resources: {
        IamRoleLambdaExecution: {
          Properties: {
            AssumeRolePolicyDocument: {
              Statement: [],
            },
          },
        },
        FirstLambdaVersion: {
          Type: 'AWS::Lambda::Version',
          DeletionPolicy: 'Retain',
          Properties: {
            FunctionName: {
              Ref: 'FirstLambdaFunction',
            },
          },
        },
      },
    };

    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    serverless.setProvider('aws', new AwsProvider(serverless, options));
    awsCompileCloudFrontEvents = new AwsCompileCloudFrontEvents(serverless, options);
  });

  describe('#constructor()', () => {
    it('should set the provider variable to an instance of AwsProvider', () =>
      expect(awsCompileCloudFrontEvents.provider).to.be.instanceof(AwsProvider));
  });

  describe('#awsCompileCloudFrontEvents()', () => {
    it('should throw an error if cloudFront event type is not an object', () => {
      awsCompileCloudFrontEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cloudFront: 42,
            },
          ],
        },
      };

      expect(() => awsCompileCloudFrontEvents.compileCognitoUserPoolEvents()).to.throw(Error);

      awsCompileCloudFrontEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cloudFront: [42],
            },
          ],
        },
      };

      expect(() => awsCompileCloudFrontEvents.compileCloudWatchLogEvents()).to.throw(Error);
    });

    it('should create corresponding resources when cloudFront events are given', () => {
      awsCompileCloudFrontEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              cloudFront: {
                eventType: 'viewer-request',
                origin: 's3://bucketname.s3.amazonaws.com/files',
              },
            },
          ],
        },
      };

      awsCompileCloudFrontEvents.compileCloudFrontEvents();

      expect(awsCompileCloudFrontEvents.serverless.service.provider
        .compiledCloudFormationTemplate.Resources
        .IamRoleLambdaExecution.Properties.AssumeRolePolicyDocument.Statement[0]
      ).to.eql({
        Effect: 'Allow',
        Principal: {
          Service: [
            'edgelambda.amazonaws.com',
          ],
        },
        Action: [
          'sts:AssumeRole',
        ],
      });

      expect(awsCompileCloudFrontEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources
        .CloudFrontDistribution.Type
      ).to.equal('AWS::CloudFront::Distribution');

      expect(awsCompileCloudFrontEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources
        .CloudFrontDistribution.Properties.DistributionConfig
        .Enabled
      ).to.equal(true);

      expect(awsCompileCloudFrontEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources
        .CloudFrontDistribution.Properties.DistributionConfig
        .DefaultCacheBehavior.ViewerProtocolPolicy
      ).to.equal('allow-all');

      expect(awsCompileCloudFrontEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources
        .CloudFrontDistribution.Properties.DistributionConfig
        .DefaultCacheBehavior.TargetOriginId
      ).to.equal('First');

      expect(awsCompileCloudFrontEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources
        .CloudFrontDistribution.Properties.DistributionConfig
        .DefaultCacheBehavior.ForwardedValues
      ).to.eql({ QueryString: false });

      expect(awsCompileCloudFrontEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources
        .CloudFrontDistribution.Properties.DistributionConfig
        .DefaultCacheBehavior.LambdaFunctionAssociations[0]
      ).to.eql({
        EventType: 'viewer-request',
        LambdaFunctionARN: {
          Ref: 'FirstLambdaVersion',
        } });

      expect(awsCompileCloudFrontEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources
        .CloudFrontDistribution.Properties.DistributionConfig
        .Origins[0]
      ).to.eql({
        Id: 'First',
        DomainName: 'bucketname.s3.amazonaws.com',
        OriginPath: '/files',
        S3OriginConfig: {},
      });
    });

    it('should contain function version even with versionFunction is set to false', () => {
      awsCompileCloudFrontEvents.serverless.service.provider.versionFunctions = false;
      awsCompileCloudFrontEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              cloudFront: {
                eventType: 'viewer-request',
                origin: 's3://bucketname.s3.amazonaws.com/files',
              },
            },
          ],
        },
      };

      awsCompileCloudFrontEvents.compileCloudFrontEvents();

      expect(awsCompileCloudFrontEvents.serverless.service.provider
        .compiledCloudFormationTemplate.Resources.FirstLambdaVersion
      ).to.eql({
        Type: 'AWS::Lambda::Version',
        DeletionPolicy: 'Retain',
        Properties: {
          FunctionName: {
            Ref: 'FirstLambdaFunction',
          } },
      });
    });
  });
});
