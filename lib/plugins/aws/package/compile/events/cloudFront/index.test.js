'use strict';

const chai = require('chai');
const sandbox = require('sinon');
const AwsProvider = require('../../../../provider/awsProvider');
const AwsCompileCloudFrontEvents = require('./index');
const Serverless = require('../../../../../../Serverless');

chai.use(require('sinon-chai'));

const { expect } = chai;

describe('AwsCompileCloudFrontEvents', () => {
  let serverless;
  let awsCompileCloudFrontEvents;
  let options;

  beforeEach(() => {
    options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    serverless = new Serverless();
    serverless.processedInput = {
      commands: [],
    };
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
              Statement: [
                {
                  Effect: 'Allow',
                  Principal: {
                    Service: ['lambda.amazonaws.com'],
                  },
                  Action: ['sts:AssumeRole'],
                },
              ],
            },
            Policies: [
              {
                PolicyDocument: {
                  Statement: [],
                },
              },
            ],
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
    serverless.setProvider('aws', new AwsProvider(serverless, options));
    serverless.cli = { log: sandbox.spy() };
    awsCompileCloudFrontEvents = new AwsCompileCloudFrontEvents(serverless, options);
  });

  describe('#constructor()', () => {
    it('should set the provider variable to an instance of AwsProvider', () =>
      expect(awsCompileCloudFrontEvents.provider).to.be.instanceof(AwsProvider));

    it('should use "before:remove:remove" hook to log a message before removing the service', () => {
      serverless.processedInput.commands = ['remove'];
      serverless.service.functions = {
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
      const awsCompileCloudFrontEventsRemoval = new AwsCompileCloudFrontEvents(serverless, options);

      awsCompileCloudFrontEventsRemoval.hooks['before:remove:remove']();
      expect(awsCompileCloudFrontEventsRemoval.serverless.cli.log).to.have.been.calledOnce;
      expect(awsCompileCloudFrontEventsRemoval.serverless.cli.log.args[0][0]).to.include(
        'remove your Lambda@Edge functions'
      );
    });
  });

  describe('#logRemoveReminder()', () => {
    it('should not log an info message if the users wants to remove the stack without a cloudFront event', () => {
      serverless.processedInput.commands = ['remove'];
      const awsCompileCloudFrontEventsRemoval = new AwsCompileCloudFrontEvents(serverless, options);

      expect(awsCompileCloudFrontEventsRemoval.serverless.cli.log).not.to.have.been.calledOnce;
    });

    it('should not throw if function has no events', () => {
      serverless.processedInput.commands = ['remove'];
      serverless.service.functions = {
        first: {},
      };

      expect(() => new AwsCompileCloudFrontEvents(serverless, options)).not.throw(Error);
    });
  });

  describe('#validate()', () => {
    it('should throw if memorySize is greater than 128 for viewer-request or viewer-response functions', () => {
      awsCompileCloudFrontEvents.serverless.service.functions = {
        first: {
          memorySize: 129,
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

      expect(() => {
        awsCompileCloudFrontEvents.validate();
      }).to.throw(Error, 'greater than 128');

      awsCompileCloudFrontEvents.serverless.service.functions = {
        first: {
          memorySize: 129,
          events: [
            {
              cloudFront: {
                eventType: 'viewer-response',
                origin: 's3://bucketname.s3.amazonaws.com/files',
              },
            },
          ],
        },
      };

      expect(() => {
        awsCompileCloudFrontEvents.validate();
      }).to.throw(Error, 'greater than 128');
    });

    it('should throw if timeout is greater than 5 for viewer-request or viewer response functions', () => {
      awsCompileCloudFrontEvents.serverless.service.functions = {
        first: {
          timeout: 6,
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

      expect(() => {
        awsCompileCloudFrontEvents.validate();
      }).to.throw(Error, 'greater than 5');
      awsCompileCloudFrontEvents.serverless.service.functions = {
        first: {
          timeout: 6,
          events: [
            {
              cloudFront: {
                eventType: 'viewer-response',
                origin: 's3://bucketname.s3.amazonaws.com/files',
              },
            },
          ],
        },
      };

      expect(() => {
        awsCompileCloudFrontEvents.validate();
      }).to.throw(Error, 'greater than 5');
    });

    it('should throw if memorySize is greater than 3008 for origin-request or origin-response functions', () => {
      awsCompileCloudFrontEvents.serverless.service.functions = {
        first: {
          memorySize: 3009,
          events: [
            {
              cloudFront: {
                eventType: 'origin-request',
                origin: 's3://bucketname.s3.amazonaws.com/files',
              },
            },
          ],
        },
      };

      expect(() => {
        awsCompileCloudFrontEvents.validate();
      }).to.throw(Error, 'greater than 3008');

      awsCompileCloudFrontEvents.serverless.service.functions = {
        first: {
          memorySize: 3009,
          events: [
            {
              cloudFront: {
                eventType: 'origin-response',
                origin: 's3://bucketname.s3.amazonaws.com/files',
              },
            },
          ],
        },
      };

      expect(() => {
        awsCompileCloudFrontEvents.validate();
      }).to.throw(Error, 'greater than 3008');
    });

    it('should throw if timeout is greater than 30 for origin-request or origin response functions', () => {
      awsCompileCloudFrontEvents.serverless.service.functions = {
        first: {
          timeout: 31,
          events: [
            {
              cloudFront: {
                eventType: 'origin-request',
                origin: 's3://bucketname.s3.amazonaws.com/files',
              },
            },
          ],
        },
      };

      expect(() => {
        awsCompileCloudFrontEvents.validate();
      }).to.throw(Error, 'greater than 30');
      awsCompileCloudFrontEvents.serverless.service.functions = {
        first: {
          timeout: 31,
          events: [
            {
              cloudFront: {
                eventType: 'origin-response',
                origin: 's3://bucketname.s3.amazonaws.com/files',
              },
            },
          ],
        },
      };

      expect(() => {
        awsCompileCloudFrontEvents.validate();
      }).to.throw(Error, 'greater than 30');
    });
  });

  describe('#prepareFunctions()', () => {
    it('should enable function versioning and set the necessary default configs for functions', () => {
      awsCompileCloudFrontEvents.serverless.service.provider.versionFunctions = false;
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

      awsCompileCloudFrontEvents.prepareFunctions();

      expect(awsCompileCloudFrontEvents.serverless.service.functions).to.eql({
        first: {
          events: [
            {
              cloudFront: {
                eventType: 'viewer-request',
                origin: 's3://bucketname.s3.amazonaws.com/files',
              },
            },
          ],
          memorySize: 128,
          timeout: 5,
          versionFunction: true,
        },
      });
    });

    it('should retain the memorySize and timeout properties if given', () => {
      awsCompileCloudFrontEvents.serverless.service.provider.versionFunctions = false;
      awsCompileCloudFrontEvents.serverless.service.functions = {
        first: {
          memorySize: 64,
          timeout: 1,
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

      awsCompileCloudFrontEvents.prepareFunctions();

      expect(awsCompileCloudFrontEvents.serverless.service.functions).to.eql({
        first: {
          events: [
            {
              cloudFront: {
                eventType: 'viewer-request',
                origin: 's3://bucketname.s3.amazonaws.com/files',
              },
            },
          ],
          memorySize: 64,
          timeout: 1,
          versionFunction: true,
        },
      });
    });
  });

  describe('#compileCloudFrontEvents()', () => {
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

      expect(() => awsCompileCloudFrontEvents.compileCloudFrontEvents()).to.throw(Error);

      awsCompileCloudFrontEvents.serverless.service.functions = {
        first: {
          events: [
            {
              cloudFront: 'some',
            },
          ],
        },
      };

      expect(() => awsCompileCloudFrontEvents.compileCloudFrontEvents()).to.throw(Error);
    });

    it('should throw an error if the region is not us-east-1', () => {
      options.region = 'eu-central-1';
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
      awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources = {
        FirstLambdaFunction: {
          Type: 'AWS::Lambda::Function',
          Properties: {
            FunctionName: 'first',
          },
        },
        FirstLambdaVersion: {
          Type: 'AWS::Lambda::Version',
          Properties: {
            FunctionName: { Ref: 'FirstLambdaFunction' },
          },
        },
        IamRoleLambdaExecution: {
          Type: 'AWS::IAM::Role',
          Properties: {
            AssumeRolePolicyDocument: {
              Version: '2012-10-17',
              Statement: [
                {
                  Effect: 'Allow',
                  Principal: {
                    Service: ['lambda.amazonaws.com'],
                  },
                  Action: ['sts:AssumeRole'],
                },
              ],
            },
            Policies: [
              {
                PolicyName: {
                  'Fn::Join': ['-', ['dev', 'first', 'lambda']],
                },
                PolicyDocument: {
                  Version: '2012-10-17',
                  Statement: [],
                },
              },
            ],
            Path: '/',
            RoleName: {
              'Fn::Join': [
                '-',
                [
                  'first',
                  'dev',
                  {
                    Ref: 'AWS::Region',
                  },
                  'lambdaRole',
                ],
              ],
            },
          },
        },
      };

      expect(() => awsCompileCloudFrontEvents.compileCloudFrontEvents()).to.throw(
        /to the us-east-1 region/
      );
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
      awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources = {
        FirstLambdaFunction: {
          Type: 'AWS::Lambda::Function',
          Properties: {
            FunctionName: 'first',
          },
        },
        FirstLambdaVersion: {
          Type: 'AWS::Lambda::Version',
          Properties: {
            FunctionName: { Ref: 'FirstLambdaFunction' },
          },
        },
        IamRoleLambdaExecution: {
          Type: 'AWS::IAM::Role',
          Properties: {
            AssumeRolePolicyDocument: {
              Version: '2012-10-17',
              Statement: [
                {
                  Effect: 'Allow',
                  Principal: {
                    Service: ['lambda.amazonaws.com'],
                  },
                  Action: ['sts:AssumeRole'],
                },
              ],
            },
            Policies: [
              {
                PolicyName: {
                  'Fn::Join': ['-', ['dev', 'first', 'lambda']],
                },
                PolicyDocument: {
                  Version: '2012-10-17',
                  Statement: [],
                },
              },
            ],
            Path: '/',
            RoleName: {
              'Fn::Join': [
                '-',
                [
                  'first',
                  'dev',
                  {
                    Ref: 'AWS::Region',
                  },
                  'lambdaRole',
                ],
              ],
            },
          },
        },
      };

      awsCompileCloudFrontEvents.compileCloudFrontEvents();

      expect(
        awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.FirstLambdaFunction.DeletionPolicy
      ).to.equal('Retain');

      expect(
        awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.IamRoleLambdaExecution.Properties.AssumeRolePolicyDocument.Statement[0]
      ).to.eql({
        Effect: 'Allow',
        Principal: {
          Service: ['lambda.amazonaws.com', 'edgelambda.amazonaws.com'],
        },
        Action: ['sts:AssumeRole'],
      });
      expect(
        awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.IamRoleLambdaExecution.Properties.Policies[0].PolicyDocument.Statement[0]
      ).to.eql({
        Effect: 'Allow',
        Action: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
        Resource: [{ 'Fn::Sub': 'arn:${AWS::Partition}:logs:*:*:*' }],
      });
      expect(
        awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CloudFrontDistribution.Type
      ).to.equal('AWS::CloudFront::Distribution');

      expect(
        awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CloudFrontDistribution.Properties.DistributionConfig.Enabled
      ).to.equal(true);

      expect(
        awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CloudFrontDistribution.Properties.DistributionConfig.DefaultCacheBehavior
          .ViewerProtocolPolicy
      ).to.equal('allow-all');

      expect(
        awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CloudFrontDistribution.Properties.DistributionConfig.DefaultCacheBehavior
          .TargetOriginId
      ).to.equal('s3/bucketname.s3.amazonaws.com/files');

      expect(
        awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CloudFrontDistribution.Properties.DistributionConfig.DefaultCacheBehavior
          .ForwardedValues
      ).to.eql({ QueryString: false });

      expect(
        awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CloudFrontDistribution.Properties.DistributionConfig.DefaultCacheBehavior
          .LambdaFunctionAssociations[0]
      ).to.eql({
        EventType: 'viewer-request',
        LambdaFunctionARN: {
          Ref: 'FirstLambdaVersion',
        },
      });

      expect(
        awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CloudFrontDistribution.Properties.DistributionConfig.Origins[0]
      ).to.eql({
        Id: 's3/bucketname.s3.amazonaws.com/files',
        DomainName: 'bucketname.s3.amazonaws.com',
        OriginPath: '/files',
        S3OriginConfig: {},
      });
    });

    it('should not create cloudfront distribution when no cloudFront events are given', () => {
      awsCompileCloudFrontEvents.serverless.service.functions = {
        first: {
          name: 'first',
        },
        second: {
          name: 'second',
          events: [
            {
              http: 'GET /',
            },
          ],
        },
      };

      awsCompileCloudFrontEvents.compileCloudFrontEvents();

      expect(
        awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources
      ).to.not.have.any.keys('CloudFrontDistribution');
    });

    it('should create different origins for different domains with the same path', () => {
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
        second: {
          name: 'second',
          events: [
            {
              cloudFront: {
                eventType: 'viewer-request',
                origin: 's3://anotherbucket.s3.amazonaws.com/files',
                pathPattern: '/another*',
              },
            },
          ],
        },
      };

      awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources = {
        FirstLambdaFunction: {
          Type: 'AWS::Lambda::Function',
          Properties: {
            FunctionName: 'first',
          },
        },
        SecondLambdaFunction: {
          Type: 'AWS::Lambda::Function',
          Properties: {
            FunctionName: 'second',
          },
        },
      };

      awsCompileCloudFrontEvents.compileCloudFrontEvents();

      expect(
        awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CloudFrontDistribution.Properties.DistributionConfig.Origins[0]
      ).to.eql({
        Id: 's3/bucketname.s3.amazonaws.com/files',
        DomainName: 'bucketname.s3.amazonaws.com',
        OriginPath: '/files',
        S3OriginConfig: {},
      });

      expect(
        awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CloudFrontDistribution.Properties.DistributionConfig.Origins[1]
      ).to.eql({
        Id: 's3/anotherbucket.s3.amazonaws.com/files',
        DomainName: 'anotherbucket.s3.amazonaws.com',
        OriginPath: '/files',
        S3OriginConfig: {},
      });

      expect(
        awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CloudFrontDistribution.Properties.DistributionConfig.Origins.length
      ).to.equal(2);
    });

    it('should create different origins for the same domains with the same path but different protocols', () => {
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
        second: {
          name: 'second',
          events: [
            {
              cloudFront: {
                eventType: 'viewer-request',
                origin: 'http://bucketname.s3.amazonaws.com/files',
                pathPattern: '/another*',
              },
            },
          ],
        },
      };

      awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources = {
        FirstLambdaFunction: {
          Type: 'AWS::Lambda::Function',
          Properties: {
            FunctionName: 'first',
          },
        },
        SecondLambdaFunction: {
          Type: 'AWS::Lambda::Function',
          Properties: {
            FunctionName: 'second',
          },
        },
      };

      awsCompileCloudFrontEvents.compileCloudFrontEvents();

      expect(
        awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CloudFrontDistribution.Properties.DistributionConfig.Origins[0]
      ).to.eql({
        Id: 's3/bucketname.s3.amazonaws.com/files',
        DomainName: 'bucketname.s3.amazonaws.com',
        OriginPath: '/files',
        S3OriginConfig: {},
      });

      expect(
        awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CloudFrontDistribution.Properties.DistributionConfig.Origins[1]
      ).to.eql({
        Id: 'custom/bucketname.s3.amazonaws.com/files',
        DomainName: 'bucketname.s3.amazonaws.com',
        OriginPath: '/files',
        CustomOriginConfig: {
          OriginProtocolPolicy: 'match-viewer',
        },
      });

      expect(
        awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CloudFrontDistribution.Properties.DistributionConfig.Origins.length
      ).to.equal(2);
    });

    it('should create different origins with different ids for different domains in the same function', () => {
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
            {
              cloudFront: {
                eventType: 'viewer-request',
                origin: 's3://anotherbucket.s3.amazonaws.com/files',
                pathPattern: '/another*',
              },
            },
          ],
        },
      };

      awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources = {
        FirstLambdaFunction: {
          Type: 'AWS::Lambda::Function',
          Properties: {
            FunctionName: 'first',
          },
        },
      };

      awsCompileCloudFrontEvents.compileCloudFrontEvents();

      expect(
        awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CloudFrontDistribution.Properties.DistributionConfig.Origins[0]
      ).to.eql({
        Id: 's3/bucketname.s3.amazonaws.com/files',
        DomainName: 'bucketname.s3.amazonaws.com',
        OriginPath: '/files',
        S3OriginConfig: {},
      });

      expect(
        awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CloudFrontDistribution.Properties.DistributionConfig.Origins[1]
      ).to.eql({
        Id: 's3/anotherbucket.s3.amazonaws.com/files',
        DomainName: 'anotherbucket.s3.amazonaws.com',
        OriginPath: '/files',
        S3OriginConfig: {},
      });

      expect(
        awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CloudFrontDistribution.Properties.DistributionConfig.Origins.length
      ).to.equal(2);
    });

    it('should use previous created origin for the same params', () => {
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
        second: {
          name: 'second',
          events: [
            {
              cloudFront: {
                eventType: 'origin-request',
                origin: 's3://bucketname.s3.amazonaws.com/files',
              },
            },
          ],
        },
      };

      awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources = {
        FirstLambdaFunction: {
          Type: 'AWS::Lambda::Function',
          Properties: {
            FunctionName: 'first',
          },
        },
        SecondLambdaFunction: {
          Type: 'AWS::Lambda::Function',
          Properties: {
            FunctionName: 'second',
          },
        },
      };

      awsCompileCloudFrontEvents.compileCloudFrontEvents();

      expect(
        awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CloudFrontDistribution.Properties.DistributionConfig.Origins[0]
      ).to.eql({
        Id: 's3/bucketname.s3.amazonaws.com/files',
        DomainName: 'bucketname.s3.amazonaws.com',
        OriginPath: '/files',
        S3OriginConfig: {},
      });

      expect(
        awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CloudFrontDistribution.Properties.DistributionConfig.Origins.length
      ).to.equal(1);
    });

    it('should create origins with all values given as an object', () => {
      awsCompileCloudFrontEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              cloudFront: {
                eventType: 'viewer-request',
                origin: {
                  DomainName: 'amazonaws.com',
                  Id: 'id-to-overwrite',
                  CustomOriginConfig: {
                    OriginKeepaliveTimeout: 1,
                    OriginReadTimeout: 2,
                    OriginProtocolPolicy: 'http-only',
                  },
                },
              },
            },
          ],
        },
      };

      awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources = {
        FirstLambdaFunction: {
          Type: 'AWS::Lambda::Function',
          Properties: {
            FunctionName: 'first',
          },
        },
      };

      awsCompileCloudFrontEvents.compileCloudFrontEvents();

      expect(
        awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CloudFrontDistribution.Properties.DistributionConfig.Origins[0]
      ).to.eql({
        Id: 'custom/amazonaws.com',
        DomainName: 'amazonaws.com',
        CustomOriginConfig: {
          OriginKeepaliveTimeout: 1,
          OriginReadTimeout: 2,
          OriginProtocolPolicy: 'http-only',
        },
      });
    });

    it('should throw if more than one cloudfront event with different origins were defined as a default', () => {
      awsCompileCloudFrontEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              cloudFront: {
                eventType: 'viewer-request',
                origin: 's3://bucketname.s3.amazonaws.com/files',
                isDefaultOrigin: true,
              },
            },
          ],
        },
        second: {
          name: 'second',
          events: [
            {
              cloudFront: {
                eventType: 'viewer-request',
                origin: 's3://anotherbucket.s3.amazonaws.com/files',
                isDefaultOrigin: true,
              },
            },
          ],
        },
      };

      awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources = {
        FirstLambdaFunction: {
          Type: 'AWS::Lambda::Function',
          Properties: {
            FunctionName: 'first',
          },
        },
        SecondLambdaFunction: {
          Type: 'AWS::Lambda::Function',
          Properties: {
            FunctionName: 'second',
          },
        },
      };

      expect(() => {
        awsCompileCloudFrontEvents.compileCloudFrontEvents();
      }).to.throw(Error, 'Found more than one cloudfront event with "isDefaultOrigin" defined');
    });

    it('should use behavior without PathPattern as a DefaultCacheBehavior', () => {
      awsCompileCloudFrontEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              cloudFront: {
                eventType: 'viewer-request',
                origin: 's3://bucketname.s3.amazonaws.com/files',
                pathPattern: '/files/*',
              },
            },
          ],
        },
        second: {
          name: 'second',
          events: [
            {
              cloudFront: {
                eventType: 'viewer-request',
                origin: 's3://anotherbucket.s3.amazonaws.com/files',
              },
            },
          ],
        },
      };

      awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources = {
        FirstLambdaFunction: {
          Type: 'AWS::Lambda::Function',
          Properties: {
            FunctionName: 'first',
          },
        },
        FirstLambdaVersion: {
          Type: 'AWS::Lambda::Version',
          Properties: {
            FunctionName: { Ref: 'FirstLambdaFunction' },
          },
        },
        SecondLambdaFunction: {
          Type: 'AWS::Lambda::Function',
          Properties: {
            FunctionName: 'second',
          },
        },
        SecondLambdaVersion: {
          Type: 'AWS::Lambda::Version',
          Properties: {
            FunctionName: { Ref: 'SecondLambdaFunction' },
          },
        },
      };

      awsCompileCloudFrontEvents.compileCloudFrontEvents();

      expect(
        awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CloudFrontDistribution.Properties.DistributionConfig.DefaultCacheBehavior
      ).to.eql({
        TargetOriginId: 's3/anotherbucket.s3.amazonaws.com/files',
        ViewerProtocolPolicy: 'allow-all',
        ForwardedValues: {
          QueryString: false,
        },
        LambdaFunctionAssociations: [
          {
            EventType: 'viewer-request',
            LambdaFunctionARN: {
              Ref: 'SecondLambdaVersion',
            },
          },
        ],
      });

      expect(
        awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CloudFrontDistribution.Properties.DistributionConfig.CacheBehaviors[0]
      ).to.eql({
        TargetOriginId: 's3/bucketname.s3.amazonaws.com/files',
        ViewerProtocolPolicy: 'allow-all',
        ForwardedValues: {
          QueryString: false,
        },
        PathPattern: '/files/*',
        LambdaFunctionAssociations: [
          {
            EventType: 'viewer-request',
            LambdaFunctionARN: {
              Ref: 'FirstLambdaVersion',
            },
          },
        ],
      });

      expect(
        awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CloudFrontDistribution.Properties.DistributionConfig.CacheBehaviors.length
      ).to.equal(1);
    });

    it('should create DefaultCacheBehavior if non behavior without PathPattern were defined', () => {
      awsCompileCloudFrontEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              cloudFront: {
                eventType: 'viewer-request',
                origin: 's3://bucketname.s3.amazonaws.com/files',
                pathPattern: '/files/*',
              },
            },
          ],
        },
      };

      awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources = {
        FirstLambdaFunction: {
          Type: 'AWS::Lambda::Function',
          Properties: {
            FunctionName: 'first',
          },
        },
        FirstLambdaVersion: {
          Type: 'AWS::Lambda::Version',
          Properties: {
            FunctionName: { Ref: 'FirstLambdaFunction' },
          },
        },
      };

      awsCompileCloudFrontEvents.compileCloudFrontEvents();

      expect(
        awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CloudFrontDistribution.Properties.DistributionConfig.DefaultCacheBehavior
      ).to.eql({
        TargetOriginId: 's3/bucketname.s3.amazonaws.com/files',
        ViewerProtocolPolicy: 'allow-all',
        ForwardedValues: {
          QueryString: false,
        },
      });

      expect(
        awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CloudFrontDistribution.Properties.DistributionConfig.CacheBehaviors[0]
      ).to.eql({
        TargetOriginId: 's3/bucketname.s3.amazonaws.com/files',
        ViewerProtocolPolicy: 'allow-all',
        ForwardedValues: {
          QueryString: false,
        },
        PathPattern: '/files/*',
        LambdaFunctionAssociations: [
          {
            EventType: 'viewer-request',
            LambdaFunctionARN: {
              Ref: 'FirstLambdaVersion',
            },
          },
        ],
      });

      expect(
        awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CloudFrontDistribution.Properties.DistributionConfig.CacheBehaviors.length
      ).to.equal(1);
    });

    it('should create DefaultCacheBehavior if non behavior without PathPattern were defined but isDefaultOrigin flag was set', () => {
      awsCompileCloudFrontEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              cloudFront: {
                eventType: 'viewer-request',
                origin: 's3://bucketname.s3.amazonaws.com/files',
                pathPattern: '/files/*',
              },
            },
          ],
        },
        second: {
          name: 'second',
          events: [
            {
              cloudFront: {
                eventType: 'viewer-request',
                origin: 's3://anotherbucket.s3.amazonaws.com/files',
                pathPattern: '/anotherfiles/*',
                isDefaultOrigin: true,
              },
            },
          ],
        },
      };

      awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources = {
        FirstLambdaFunction: {
          Type: 'AWS::Lambda::Function',
          Properties: {
            FunctionName: 'first',
          },
        },
        FirstLambdaVersion: {
          Type: 'AWS::Lambda::Version',
          Properties: {
            FunctionName: { Ref: 'FirstLambdaFunction' },
          },
        },
        SecondLambdaFunction: {
          Type: 'AWS::Lambda::Function',
          Properties: {
            FunctionName: 'second',
          },
        },
        SecondLambdaVersion: {
          Type: 'AWS::Lambda::Version',
          Properties: {
            FunctionName: { Ref: 'SecondLambdaFunction' },
          },
        },
      };

      awsCompileCloudFrontEvents.compileCloudFrontEvents();

      expect(
        awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CloudFrontDistribution.Properties.DistributionConfig.DefaultCacheBehavior
      ).to.eql({
        TargetOriginId: 's3/anotherbucket.s3.amazonaws.com/files',
        ViewerProtocolPolicy: 'allow-all',
        ForwardedValues: {
          QueryString: false,
        },
      });

      expect(
        awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CloudFrontDistribution.Properties.DistributionConfig.CacheBehaviors[0]
      ).to.eql({
        TargetOriginId: 's3/bucketname.s3.amazonaws.com/files',
        ViewerProtocolPolicy: 'allow-all',
        ForwardedValues: {
          QueryString: false,
        },
        PathPattern: '/files/*',
        LambdaFunctionAssociations: [
          {
            EventType: 'viewer-request',
            LambdaFunctionARN: {
              Ref: 'FirstLambdaVersion',
            },
          },
        ],
      });

      expect(
        awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CloudFrontDistribution.Properties.DistributionConfig.CacheBehaviors[1]
      ).to.eql({
        TargetOriginId: 's3/anotherbucket.s3.amazonaws.com/files',
        ViewerProtocolPolicy: 'allow-all',
        ForwardedValues: {
          QueryString: false,
        },
        PathPattern: '/anotherfiles/*',
        LambdaFunctionAssociations: [
          {
            EventType: 'viewer-request',
            LambdaFunctionARN: {
              Ref: 'SecondLambdaVersion',
            },
          },
        ],
      });

      expect(
        awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CloudFrontDistribution.Properties.DistributionConfig.CacheBehaviors.length
      ).to.equal(2);
    });

    it('should throw if non of the cloudfront event with different origins were defined as a default', () => {
      awsCompileCloudFrontEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              cloudFront: {
                eventType: 'viewer-request',
                origin: 's3://bucketname.s3.amazonaws.com/files',
                pathPattern: '/files/*',
              },
            },
          ],
        },
        second: {
          name: 'second',
          events: [
            {
              cloudFront: {
                eventType: 'viewer-request',
                origin: 's3://anotherbucket.s3.amazonaws.com/files',
                pathPattern: '/anotherfiles/*',
              },
            },
          ],
        },
      };

      awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources = {
        FirstLambdaFunction: {
          Type: 'AWS::Lambda::Function',
          Properties: {
            FunctionName: 'first',
          },
        },
        FirstLambdaVersion: {
          Type: 'AWS::Lambda::Version',
          Properties: {
            FunctionName: { Ref: 'FirstLambdaFunction' },
          },
        },
        SecondLambdaFunction: {
          Type: 'AWS::Lambda::Function',
          Properties: {
            FunctionName: 'second',
          },
        },
        SecondLambdaVersion: {
          Type: 'AWS::Lambda::Version',
          Properties: {
            FunctionName: { Ref: 'SecondLambdaFunction' },
          },
        },
      };

      expect(() => {
        awsCompileCloudFrontEvents.compileCloudFrontEvents();
      }).to.throw(
        Error,
        'Found more than one origin but none of the cloudfront event has "isDefaultOrigin" defined'
      );
    });

    it('should use previous created behavior for the same params and different event types', () => {
      awsCompileCloudFrontEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              cloudFront: {
                eventType: 'viewer-request',
                origin: 's3://bucketname.s3.amazonaws.com/',
              },
            },
          ],
        },
        second: {
          name: 'second',
          events: [
            {
              cloudFront: {
                eventType: 'origin-request',
                origin: 's3://bucketname.s3.amazonaws.com/',
              },
            },
          ],
        },
      };

      awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources = {
        FirstLambdaFunction: {
          Type: 'AWS::Lambda::Function',
          Properties: {
            FunctionName: 'first',
          },
        },
        FirstLambdaVersion: {
          Type: 'AWS::Lambda::Version',
          Properties: {
            FunctionName: { Ref: 'FirstLambdaFunction' },
          },
        },
        SecondLambdaFunction: {
          Type: 'AWS::Lambda::Function',
          Properties: {
            FunctionName: 'second',
          },
        },
        SecondLambdaVersion: {
          Type: 'AWS::Lambda::Version',
          Properties: {
            FunctionName: { Ref: 'SecondLambdaFunction' },
          },
        },
      };

      awsCompileCloudFrontEvents.compileCloudFrontEvents();

      expect(
        awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CloudFrontDistribution.Properties.DistributionConfig.DefaultCacheBehavior
      ).to.eql({
        TargetOriginId: 's3/bucketname.s3.amazonaws.com',
        ViewerProtocolPolicy: 'allow-all',
        ForwardedValues: {
          QueryString: false,
        },
        LambdaFunctionAssociations: [
          {
            EventType: 'viewer-request',
            LambdaFunctionARN: {
              Ref: 'FirstLambdaVersion',
            },
          },
          {
            EventType: 'origin-request',
            LambdaFunctionARN: {
              Ref: 'SecondLambdaVersion',
            },
          },
        ],
      });

      expect(
        awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CloudFrontDistribution.Properties.DistributionConfig
      ).to.not.have.any.keys('CacheBehaviors');
    });

    it('should create behavior with all values given as an object', () => {
      awsCompileCloudFrontEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              cloudFront: {
                eventType: 'viewer-request',
                origin: 's3://bucketname.s3.amazonaws.com/files',
                behavior: {
                  ForwardedValues: {
                    QueryString: true,
                    Headers: ['*'],
                  },
                  ViewerProtocolPolicy: 'https-only',
                  AllowedMethods: ['GET', 'HEAD', 'OPTIONS'],
                  CachedMethods: ['GET', 'HEAD', 'OPTIONS'],
                },
              },
            },
          ],
        },
      };

      awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources = {
        FirstLambdaFunction: {
          Type: 'AWS::Lambda::Function',
          Properties: {
            FunctionName: 'first',
          },
        },
        FirstLambdaVersion: {
          Type: 'AWS::Lambda::Version',
          Properties: {
            FunctionName: { Ref: 'FirstLambdaFunction' },
          },
        },
      };

      awsCompileCloudFrontEvents.compileCloudFrontEvents();

      expect(
        awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CloudFrontDistribution.Properties.DistributionConfig.DefaultCacheBehavior
      ).to.eql({
        TargetOriginId: 's3/bucketname.s3.amazonaws.com/files',
        ViewerProtocolPolicy: 'https-only',
        ForwardedValues: {
          QueryString: true,
          Headers: ['*'],
        },
        AllowedMethods: ['GET', 'HEAD', 'OPTIONS'],
        CachedMethods: ['GET', 'HEAD', 'OPTIONS'],
        LambdaFunctionAssociations: [
          {
            EventType: 'viewer-request',
            LambdaFunctionARN: {
              Ref: 'FirstLambdaVersion',
            },
          },
        ],
      });
    });

    it('should throw if more than one behavior with the same PathPattern', () => {
      awsCompileCloudFrontEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              cloudFront: {
                eventType: 'viewer-request',
                origin: 's3://bucketname.s3.amazonaws.com/files',
                pathPattern: '/files/*',
              },
            },
          ],
        },
        second: {
          name: 'second',
          events: [
            {
              cloudFront: {
                eventType: 'origin-request',
                origin: 's3://anotherbucket.s3.amazonaws.com/files',
                pathPattern: '/files/*',
              },
            },
          ],
        },
      };

      awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources = {
        FirstLambdaFunction: {
          Type: 'AWS::Lambda::Function',
          Properties: {
            FunctionName: 'first',
          },
        },
        FirstLambdaVersion: {
          Type: 'AWS::Lambda::Version',
          Properties: {
            FunctionName: { Ref: 'FirstLambdaFunction' },
          },
        },
        SecondLambdaFunction: {
          Type: 'AWS::Lambda::Function',
          Properties: {
            FunctionName: 'second',
          },
        },
        SecondLambdaVersion: {
          Type: 'AWS::Lambda::Version',
          Properties: {
            FunctionName: { Ref: 'SecondLambdaFunction' },
          },
        },
      };

      expect(() => {
        awsCompileCloudFrontEvents.compileCloudFrontEvents();
      }).to.throw(Error, 'Found more than one behavior with the same PathPattern');
    });

    it('should throw if some of the event type in any behavior is not unique', () => {
      awsCompileCloudFrontEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              cloudFront: {
                eventType: 'viewer-request',
                origin: 's3://bucketname.s3.amazonaws.com/files',
                pathPattern: '/files/*',
              },
            },
          ],
        },
        second: {
          name: 'second',
          events: [
            {
              cloudFront: {
                eventType: 'viewer-request',
                origin: 's3://bucketname.s3.amazonaws.com/files',
                pathPattern: '/files/*',
              },
            },
          ],
        },
      };

      awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources = {
        FirstLambdaFunction: {
          Type: 'AWS::Lambda::Function',
          Properties: {
            FunctionName: 'first',
          },
        },
        FirstLambdaVersion: {
          Type: 'AWS::Lambda::Version',
          Properties: {
            FunctionName: { Ref: 'FirstLambdaFunction' },
          },
        },
        SecondLambdaFunction: {
          Type: 'AWS::Lambda::Function',
          Properties: {
            FunctionName: 'second',
          },
        },
        SecondLambdaVersion: {
          Type: 'AWS::Lambda::Version',
          Properties: {
            FunctionName: { Ref: 'SecondLambdaFunction' },
          },
        },
      };

      expect(() => {
        awsCompileCloudFrontEvents.compileCloudFrontEvents();
      }).to.throw(
        Error,
        'The event type of a function association must be unique in the cache behavior'
      );
    });
  });
});
