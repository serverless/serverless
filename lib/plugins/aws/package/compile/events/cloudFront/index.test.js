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
      console.log(JSON.stringify(serverless.service.provider.compiledCloudFormationTemplate, null, 2));

      expect(awsCompileCloudFrontEvents.serverless.service.provider
        .compiledCloudFormationTemplate.Resources
        .IamRoleLambdaExecution.Properties.AssumeRolePolicyDocument.Statement
      ).to.eql([
        {
          Effect: 'Allow',
          Principal: {
            Service: [
              'edgelambda.amazonaws.com',
            ],
          },
          Action: [
            'sts:AssumeRole',
          ],
        },
      ]);

      expect(awsCompileCloudFrontEvents.serverless.service
        .provider.compiledCloudFormationTemplate.Resources.CloudFrontDistribution.Type
      ).to.equal('AWS::CloudFront::Distribution');
    });
  });
});
