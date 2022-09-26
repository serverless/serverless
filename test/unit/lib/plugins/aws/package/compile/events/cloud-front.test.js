'use strict';

const chai = require('chai');
const AwsProvider = require('../../../../../../../../lib/plugins/aws/provider');
const AwsCompileCloudFrontEvents = require('../../../../../../../../lib/plugins/aws/package/compile/events/cloud-front');
const Serverless = require('../../../../../../../../lib/serverless');
const runServerless = require('../../../../../../../utils/run-serverless');

chai.use(require('sinon-chai'));
chai.use(require('chai-as-promised'));

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
    serverless = new Serverless({ commands: [], options: {} });
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
    awsCompileCloudFrontEvents = new AwsCompileCloudFrontEvents(serverless, options);
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

    it('should throw if memorySize is greater than 10240 for origin-request or origin-response functions', () => {
      awsCompileCloudFrontEvents.serverless.service.functions = {
        first: {
          memorySize: 10241,
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
      }).to.throw(Error, 'greater than 10240');

      awsCompileCloudFrontEvents.serverless.service.functions = {
        first: {
          memorySize: 10241,
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
      }).to.throw(Error, 'greater than 10240');
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
      awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources =
        {
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
      awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources =
        {
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

      awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources =
        {
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

      awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources =
        {
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

      awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources =
        {
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

      awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources =
        {
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

      awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources =
        {
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

    it('should correctly deep merge arrays with objects', () => {
      awsCompileCloudFrontEvents.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              cloudFront: {
                eventType: 'viewer-request',
                origin: {
                  DomainName: 'bucketname.s3.amazonaws.com',
                  OriginPath: '/app*',
                  S3OriginConfig: {
                    OriginAccessIdentity: {
                      'Fn::Join': [
                        '',
                        ['origin-access-identity/cloudfront/', { Ref: 'CloudFrontOAI' }],
                      ],
                    },
                  },
                },
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
                origin: {
                  DomainName: 'bucketname.s3.amazonaws.com',
                  OriginPath: '/app*',
                  S3OriginConfig: {
                    OriginAccessIdentity: {
                      'Fn::Join': [
                        '',
                        ['origin-access-identity/cloudfront/', { Ref: 'CloudFrontOAI' }],
                      ],
                    },
                  },
                },
              },
            },
          ],
        },
      };

      awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources =
        {
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
        Id: 's3/bucketname.s3.amazonaws.com/app*',
        DomainName: 'bucketname.s3.amazonaws.com',
        OriginPath: '/app*',
        S3OriginConfig: {
          OriginAccessIdentity: {
            'Fn::Join': ['', ['origin-access-identity/cloudfront/', { Ref: 'CloudFrontOAI' }]],
          },
        },
      });

      expect(
        awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CloudFrontDistribution.Properties.DistributionConfig.Origins.length
      ).to.equal(1);
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

      awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources =
        {
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

      awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources =
        {
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
        CachePolicyId: '658327ea-f89d-4fab-a63d-7e88639e58f6',
        TargetOriginId: 's3/anotherbucket.s3.amazonaws.com/files',
        ViewerProtocolPolicy: 'allow-all',
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
        CachePolicyId: '658327ea-f89d-4fab-a63d-7e88639e58f6',
        TargetOriginId: 's3/bucketname.s3.amazonaws.com/files',
        ViewerProtocolPolicy: 'allow-all',
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

      awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources =
        {
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
        CachePolicyId: '658327ea-f89d-4fab-a63d-7e88639e58f6',
        TargetOriginId: 's3/bucketname.s3.amazonaws.com/files',
        ViewerProtocolPolicy: 'allow-all',
      });

      expect(
        awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CloudFrontDistribution.Properties.DistributionConfig.CacheBehaviors[0]
      ).to.eql({
        CachePolicyId: '658327ea-f89d-4fab-a63d-7e88639e58f6',
        TargetOriginId: 's3/bucketname.s3.amazonaws.com/files',
        ViewerProtocolPolicy: 'allow-all',
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

      awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources =
        {
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
        CachePolicyId: '658327ea-f89d-4fab-a63d-7e88639e58f6',
        TargetOriginId: 's3/anotherbucket.s3.amazonaws.com/files',
        ViewerProtocolPolicy: 'allow-all',
      });

      expect(
        awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.CloudFrontDistribution.Properties.DistributionConfig.CacheBehaviors[0]
      ).to.eql({
        CachePolicyId: '658327ea-f89d-4fab-a63d-7e88639e58f6',
        TargetOriginId: 's3/bucketname.s3.amazonaws.com/files',
        ViewerProtocolPolicy: 'allow-all',
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
        CachePolicyId: '658327ea-f89d-4fab-a63d-7e88639e58f6',
        TargetOriginId: 's3/anotherbucket.s3.amazonaws.com/files',
        ViewerProtocolPolicy: 'allow-all',
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

      awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources =
        {
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

      awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources =
        {
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
        CachePolicyId: '658327ea-f89d-4fab-a63d-7e88639e58f6',
        TargetOriginId: 's3/bucketname.s3.amazonaws.com',
        ViewerProtocolPolicy: 'allow-all',
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

      awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources =
        {
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

      awsCompileCloudFrontEvents.serverless.service.provider.compiledCloudFormationTemplate.Resources =
        {
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

describe('test/unit/lib/plugins/aws/package/compile/events/cloudFront.test.js', () => {
  describe.skip('TODO: Removal notice', () => {
    it('should show preconfigured notice on "sls remove" if service has cloudFront event', async () => {
      // Replaces
      // https://github.com/serverless/serverless/blob/85e480b5771d5deeb45ae5eb586723c26cf61a90/lib/plugins/aws/package/compile/events/cloudFront/index.test.js#L88-L109

      // Inspect result.stdoutData
      await runServerless({
        fixture: 'function',
        command: 'remove',
        lastLifecycleHookName: 'before:remove:remove',
      });
    });

    it('should not show preconfigured notice on "sls remove" if service doesn\'t have cloudFront event', async () => {
      // Replaces
      // https://github.com/serverless/serverless/blob/85e480b5771d5deeb45ae5eb586723c26cf61a90/lib/plugins/aws/package/compile/events/cloudFront/index.test.js#L113-L118

      // Inspect result.stdoutData
      await runServerless({
        fixture: 'function',
        command: 'remove',
        lastLifecycleHookName: 'before:remove:remove',
      });
    });
  });

  describe('Validation', () => {
    it.skip('TODO: should throw if function `memorySize` is greater than 128 for `functions[].events.cloudfront.evenType: "viewer-request"`', async () => {
      // Replaces
      // https://github.com/serverless/serverless/blob/85e480b5771d5deeb45ae5eb586723c26cf61a90/lib/plugins/aws/package/compile/events/cloudFront/index.test.js#L131-L167

      return expect(
        runServerless({ fixture: 'function', command: 'package' })
      ).to.eventually.be.rejected.and.have.property('code', 'TODO');
      // Ensure ServerlessError is thrown and that it has some meaningful code
      // Then test like here:
      // https://github.com/serverless/serverless/blob/85e480b5771d5deeb45ae5eb586723c26cf61a90/lib/plugins/aws/package/compile/events/httpApi/index.test.js#L455-L458
    });

    it.skip('TODO: should throw if function `timeout` is greater than 5 for for `functions[].events.cloudfront.evenType: "viewer-request"', async () => {
      // Replaces
      // https://github.com/serverless/serverless/blob/85e480b5771d5deeb45ae5eb586723c26cf61a90/lib/plugins/aws/package/compile/events/cloudFront/index.test.js#L169-L204

      return expect(
        runServerless({ fixture: 'function', command: 'package' })
      ).to.eventually.be.rejected.and.have.property('code', 'TODO');
    });

    it.skip('TODO: should throw if function `memorySize` is greater than 3008 for `functions[].events.cloudfront.evenType: "origin-request"`', async () => {
      // Replaces partially
      // https://github.com/serverless/serverless/blob/85e480b5771d5deeb45ae5eb586723c26cf61a90/lib/plugins/aws/package/compile/events/cloudFront/index.test.js#L206-L242

      return expect(
        runServerless({ fixture: 'function', command: 'package' })
      ).to.eventually.be.rejected.and.have.property('code', 'TODO');
    });

    it.skip('TODO: should throw if function `memorySize` is greater than 3008 for `functions[].events.cloudfront.evenType: "origin-response"`', async () => {
      // Replaces partially
      // https://github.com/serverless/serverless/blob/85e480b5771d5deeb45ae5eb586723c26cf61a90/lib/plugins/aws/package/compile/events/cloudFront/index.test.js#L206-L242

      return expect(
        runServerless({ fixture: 'function', command: 'package' })
      ).to.eventually.be.rejected.and.have.property('code', 'TODO');
    });

    it.skip('TODO: should throw if function `timeout` is greater than 30 for `functions[].events.cloudfront.evenType: "origin-request"`', async () => {
      // Replaces partially
      // https://github.com/serverless/serverless/blob/85e480b5771d5deeb45ae5eb586723c26cf61a90/lib/plugins/aws/package/compile/events/cloudFront/index.test.js#L244-L280

      return expect(
        runServerless({ fixture: 'function', command: 'package' })
      ).to.eventually.be.rejected.and.have.property('code', 'TODO');
    });

    it.skip('TODO: should throw if function `timeout` is greater than 30 for `functions[].events.cloudfront.evenType: "origin-response"`', async () => {
      // Replaces partially
      // https://github.com/serverless/serverless/blob/85e480b5771d5deeb45ae5eb586723c26cf61a90/lib/plugins/aws/package/compile/events/cloudFront/index.test.js#L244-L280

      return expect(
        runServerless({ fixture: 'function', command: 'package' })
      ).to.eventually.be.rejected.and.have.property('code', 'TODO');
    });

    it.skip('TODO: should throw an error if the region is not us-east-1', async () => {
      // Replaces
      // https://github.com/serverless/serverless/blob/85e480b5771d5deeb45ae5eb586723c26cf61a90/lib/plugins/aws/package/compile/events/cloudFront/index.test.js#L355-L430

      return expect(
        runServerless({ fixture: 'function', command: 'package' })
      ).to.eventually.be.rejected.and.have.property('code', 'TODO');
    });

    it.skip('TODO: should throw if more than one cloudfront event with different origins were defined as a default', async () => {
      // Replaces
      // https://github.com/serverless/serverless/blob/85e480b5771d5deeb45ae5eb586723c26cf61a90/lib/plugins/aws/package/compile/events/cloudFront/index.test.js#L988-L1034

      return expect(
        runServerless({ fixture: 'function', command: 'package' })
      ).to.eventually.be.rejected.and.have.property('code', 'TODO');
    });

    it.skip('TODO: should throw if none of the cloudfront events with different origins were defined as a default', async () => {
      // Replaces
      // https://github.com/serverless/serverless/blob/85e480b5771d5deeb45ae5eb586723c26cf61a90/lib/plugins/aws/package/compile/events/cloudFront/index.test.js#L1308-L1369

      return expect(
        runServerless({ fixture: 'function', command: 'package' })
      ).to.eventually.be.rejected.and.have.property('code', 'TODO');
    });

    it('Should throw if lambda config refers a non-existing cache policy by name', () => {
      return expect(
        runServerless({
          fixture: 'function',
          command: 'package',
          configExt: {
            functions: {
              basic: {
                handler: 'myLambdaAtEdge.handler',
                events: [
                  {
                    cloudFront: {
                      origin: 's3://bucketname.s3.amazonaws.com/files',
                      eventType: 'viewer-response',
                      cachePolicy: {
                        name: 'not-existing-cache-policy',
                      },
                    },
                  },
                ],
              },
            },
          },
        })
      ).to.eventually.be.rejected.and.have.property('code', 'UNRECOGNIZED_CLOUDFRONT_CACHE_POLICY');
    });

    it('Should not throw if lambda config includes AllowedMethods or CachedMethods behavior values and cache policy reference', async () => {
      const cachePolicyId = '08627262-05a9-4f76-9ded-b50ca2e3a84f';
      await runServerless({
        fixture: 'function',
        command: 'package',
        configExt: {
          functions: {
            basic: {
              handler: 'myLambdaAtEdge.handler',
              events: [
                {
                  cloudFront: {
                    origin: 's3://bucketname.s3.amazonaws.com/files',
                    eventType: 'viewer-response',
                    behavior: {
                      AllowedMethods: ['GET', 'HEAD', 'OPTIONS'],
                      CachedMethods: ['GET', 'HEAD', 'OPTIONS'],
                    },
                    cachePolicy: {
                      id: cachePolicyId,
                    },
                  },
                },
              ],
            },
          },
        },
      });
    });
  });

  describe.skip('TODO: Alternative cases', () => {
    it('should not create cloudfront distribution when no cloudFront events are given', async () => {
      // Replaces
      // https://github.com/serverless/serverless/blob/85e480b5771d5deeb45ae5eb586723c26cf61a90/lib/plugins/aws/package/compile/events/cloudFront/index.test.js#L572-L593

      await runServerless({ fixture: 'function', command: 'package' });
    });

    it('should create DefaultCacheBehavior if there are no events without PathPattern configured', async () => {
      // Replaces
      // https://github.com/serverless/serverless/blob/85e480b5771d5deeb45ae5eb586723c26cf61a90/lib/plugins/aws/package/compile/events/cloudFront/index.test.js#L1133-L1197

      await runServerless({ fixture: 'function', command: 'package' });
    });

    it('should throw if more than one origin with the same PathPattern', async () => {
      // Replaces
      // https://github.com/serverless/serverless/blob/85e480b5771d5deeb45ae5eb586723c26cf61a90/lib/plugins/aws/package/compile/events/cloudFront/index.test.js#L1519-L1577

      await runServerless({ fixture: 'function', command: 'package' });
    });

    it('should throw if more than one origin with the same event type', async () => {
      // Replaces
      // https://github.com/serverless/serverless/blob/85e480b5771d5deeb45ae5eb586723c26cf61a90/lib/plugins/aws/package/compile/events/cloudFront/index.test.js#L1579-L1640

      await runServerless({ fixture: 'function', command: 'package' });
    });
  });

  describe('Resource generation', () => {
    let cfResources;
    let naming;
    let serviceName;

    const stage = 'custom-stage';
    const cachePolicyName = 'allInCache';
    const cachePolicyId = '08627262-05a9-4f76-9ded-b50ca2e3a84f';
    const cachePolicyId2 = '4135ea2d-6df8-44a3-9df3-4b5a84be39ad';
    const cachePolicyConfig = {
      DefaultTTL: 60,
      MinTTL: 30,
      MaxTTL: 3600,
      ParametersInCacheKeyAndForwardedToOrigin: {
        CookiesConfig: {
          CookieBehavior: 'whitelist',
          Cookies: ['my-public-cookie'],
        },
        EnableAcceptEncodingBrotli: true,
        EnableAcceptEncodingGzip: true,
        HeadersConfig: {
          HeaderBehavior: 'whitelist',
          Headers: ['authorization', 'content-type'],
        },
        QueryStringsConfig: {
          QueryStringBehavior: 'allExcept',
          QueryStrings: ['not-cached-query-string'],
        },
      },
    };

    const getAssociatedCacheBehavior = (pathPattern) =>
      cfResources.CloudFrontDistribution.Properties.DistributionConfig.CacheBehaviors.find(
        (cacheBehavior) => cacheBehavior.PathPattern === pathPattern
      );

    before(async () => {
      const {
        awsNaming,
        cfTemplate,
        fixtureData: {
          serviceConfig: { service },
        },
      } = await runServerless({
        fixture: 'function',
        command: 'package',
        options: { stage },
        configExt: {
          provider: {
            cloudFront: {
              cachePolicies: {
                [cachePolicyName]: cachePolicyConfig,
              },
            },
            environment: { HELLO_PROVIDER: 'WORLD' },
            vpc: {
              securityGroupIds: ['sg-98f38XXX'],
              subnetIds: ['subnet-978ffXXX', 'subnet-5e59fXXX'],
            },
          },
          functions: {
            fnOriginRequest: {
              handler: 'index.handler',
              events: [
                {
                  cloudFront: {
                    eventType: 'origin-request',
                    origin: 'https://example.com',
                    pathPattern: 'noPolicy',
                  },
                },
              ],
              environment: { HELLO: 'WORLD' },
              vpc: {
                securityGroupIds: ['sg-98f38XXX'],
                subnetIds: ['subnet-978ffXXX', 'subnet-5e59fXXX'],
              },
            },
            fnOriginResponse: {
              handler: 'index.handler',
              events: [
                { cloudFront: { eventType: 'origin-response', origin: 'https://example.com' } },
              ],
            },
            fnCachePolicy: {
              handler: 'myLambdaAtEdge.handler',
              events: [
                {
                  cloudFront: {
                    origin: 's3://bucketname.s3.amazonaws.com',
                    eventType: 'viewer-response',
                    pathPattern: 'userConfiguredPolicy',
                    cachePolicy: {
                      name: cachePolicyName,
                    },
                  },
                },
              ],
            },
            fnCachePolicyManaged: {
              handler: 'myLambdaAtEdge.handler',
              events: [
                {
                  cloudFront: {
                    origin: 's3://bucketname.s3.amazonaws.com',
                    eventType: 'viewer-response',
                    pathPattern: 'managedPolicy',
                    cachePolicy: {
                      id: cachePolicyId,
                    },
                  },
                },
              ],
            },
            fnCachePolicyManagedSetViaBehavior: {
              handler: 'myLambdaAtEdge.handler',
              events: [
                {
                  cloudFront: {
                    origin: 's3://bucketname.s3.amazonaws.com',
                    eventType: 'viewer-response',
                    pathPattern: 'managedPolicySetViaBehavior',
                    behavior: {
                      CachePolicyId: cachePolicyId,
                    },
                  },
                },
              ],
            },
            fnCachePolicySetViaCachePolicyIdAndBehavior: {
              handler: 'myLambdaAtEdge.handler',
              events: [
                {
                  cloudFront: {
                    origin: 's3://bucketname.s3.amazonaws.com',
                    eventType: 'viewer-response',
                    pathPattern: 'policySetViaCachePolicyIdAndBehavior',
                    cachePolicy: {
                      id: cachePolicyId,
                    },
                    behavior: {
                      CachePolicyId: cachePolicyId2,
                    },
                  },
                },
              ],
            },
            fnCachePolicySetViaCachePolicyNameAndBehavior: {
              handler: 'myLambdaAtEdge.handler',
              events: [
                {
                  cloudFront: {
                    origin: 's3://bucketname.s3.amazonaws.com',
                    eventType: 'viewer-response',
                    pathPattern: 'policySetViaCachePolicyNameAndBehavior',
                    cachePolicy: {
                      name: cachePolicyName,
                    },
                    behavior: {
                      CachePolicyId: cachePolicyId2,
                    },
                  },
                },
              ],
            },
            fnLegacyCacheSettings: {
              handler: 'myLambdaAtEdge.handler',
              events: [
                {
                  cloudFront: {
                    origin: 's3://bucketname.s3.amazonaws.com',
                    eventType: 'viewer-response',
                    pathPattern: 'legacyCacheSettings',
                    behavior: {
                      MaxTTL: 0,
                      MinTTL: 0,
                      DefaultTTL: 0,
                      ForwardedValues: {
                        QueryString: true,
                        Cookies: {
                          Forward: 'none',
                        },
                      },
                    },
                  },
                },
              ],
            },
          },
        },
      });
      cfResources = cfTemplate.Resources;
      naming = awsNaming;
      serviceName = service;
    });

    it.skip('TODO: should configure needed resources', () => {
      // Replaces
      // https://github.com/serverless/serverless/blob/85e480b5771d5deeb45ae5eb586723c26cf61a90/lib/plugins/aws/package/compile/events/cloudFront/index.test.js#L432-L570
    });

    it('should configure distribution config comment', () => {
      const distributionConfig =
        cfResources[naming.getCloudFrontDistributionLogicalId()].Properties.DistributionConfig;
      expect(distributionConfig.Comment).to.equal(`${serviceName} ${stage}`);
    });

    it.skip('TODO: should ensure that triggered functions are versioned', () => {
      // Replaces partially
      // https://github.com/serverless/serverless/blob/85e480b5771d5deeb45ae5eb586723c26cf61a90/lib/plugins/aws/package/compile/events/cloudFront/index.test.js#L283-L315
    });
    it.skip('TODO: should ensure that triggered functions have 128MB as default `memorySize`', () => {
      // Replaces partially
      // https://github.com/serverless/serverless/blob/85e480b5771d5deeb45ae5eb586723c26cf61a90/lib/plugins/aws/package/compile/events/cloudFront/index.test.js#L283-L315
      // https://github.com/serverless/serverless/blob/85e480b5771d5deeb45ae5eb586723c26cf61a90/lib/plugins/aws/package/compile/events/cloudFront/index.test.js#L317-L352
    });

    it.skip('TODO: should ensure that triggered functions have 5s for default `timeout`', () => {
      // Replaces partially
      // https://github.com/serverless/serverless/blob/85e480b5771d5deeb45ae5eb586723c26cf61a90/lib/plugins/aws/package/compile/events/cloudFront/index.test.js#L283-L315
      // https://github.com/serverless/serverless/blob/85e480b5771d5deeb45ae5eb586723c26cf61a90/lib/plugins/aws/package/compile/events/cloudFront/index.test.js#L317-L352
    });

    it.skip('TODO: should create different origins for different domains with the same path', () => {
      // Replaces
      // https://github.com/serverless/serverless/blob/85e480b5771d5deeb45ae5eb586723c26cf61a90/lib/plugins/aws/package/compile/events/cloudFront/index.test.js#L595-L663
    });

    it.skip('TODO: should create different origins for the same domains with the same path but different protocols', () => {
      // Replaces
      // https://github.com/serverless/serverless/blob/85e480b5771d5deeb45ae5eb586723c26cf61a90/lib/plugins/aws/package/compile/events/cloudFront/index.test.js#L665-L735
    });

    it.skip('TODO: should create different origins with different ids for different domains in the same function', () => {
      // Replaces
      // https://github.com/serverless/serverless/blob/85e480b5771d5deeb45ae5eb586723c26cf61a90/lib/plugins/aws/package/compile/events/cloudFront/index.test.js#L737-L794
    });

    it.skip('TODO: should use previous created origin for the same params', () => {
      // Replaces
      // https://github.com/serverless/serverless/blob/85e480b5771d5deeb45ae5eb586723c26cf61a90/lib/plugins/aws/package/compile/events/cloudFront/index.test.js#L796-L853
    });

    it.skip('TODO: should support origin customization', () => {
      // Replaces
      // https://github.com/serverless/serverless/blob/85e480b5771d5deeb45ae5eb586723c26cf61a90/lib/plugins/aws/package/compile/events/cloudFront/index.test.js#L855-L901
      // https://github.com/serverless/serverless/blob/85e480b5771d5deeb45ae5eb586723c26cf61a90/lib/plugins/aws/package/compile/events/cloudFront/index.test.js#L903-L986
    });

    it.skip('TODO: should assign a DefaultCacheBehavior behavior to event without PathPattern', () => {
      // Replaces
      // https://github.com/serverless/serverless/blob/85e480b5771d5deeb45ae5eb586723c26cf61a90/lib/plugins/aws/package/compile/events/cloudFront/index.test.js#L1036-L1131
      // https://github.com/serverless/serverless/blob/85e480b5771d5deeb45ae5eb586723c26cf61a90/lib/plugins/aws/package/compile/events/cloudFront/index.test.js#L1371-L1453
    });

    it.skip('TODO: should create DefaultCacheBehavior if there are no events without PathPattern configured and isDefaultOrigin flag was set', async () => {
      // Replaces
      // https://github.com/serverless/serverless/blob/85e480b5771d5deeb45ae5eb586723c26cf61a90/lib/plugins/aws/package/compile/events/cloudFront/index.test.js#L1199-L1306
    });

    it.skip('TODO: should support behavior customization', () => {
      // Replaces
      // https://github.com/serverless/serverless/blob/85e480b5771d5deeb45ae5eb586723c26cf61a90/lib/plugins/aws/package/compile/events/cloudFront/index.test.js#L1455-L1517
    });

    it('should ignore environment variables if provided in function properties', () => {
      const edgeResolvedName = naming.getLambdaLogicalId('fnOriginRequest');
      expect(cfResources[edgeResolvedName].Properties).not.to.contain.keys('Environment');
    });
    it('Should ignore VPC config if provided in function properties', () => {
      const edgeResolvedName = naming.getLambdaLogicalId('fnOriginRequest');
      expect(cfResources[edgeResolvedName].Properties).not.to.contain.keys('VpcConfig');
    });
    it('should ignore provider environment variables', () => {
      const edgeResolvedName = naming.getLambdaLogicalId('fnOriginResponse');
      expect(cfResources[edgeResolvedName].Properties).not.to.contain.keys('Environment');
    });
    it('should ignore provider VPC config', () => {
      const edgeResolvedName = naming.getLambdaLogicalId('fnOriginResponse');
      const otherResolvedName = naming.getLambdaLogicalId('basic');
      expect(cfResources[edgeResolvedName].Properties).not.to.contain.keys('VpcConfig');
      expect(cfResources[otherResolvedName].Properties).to.contain.keys('VpcConfig');
    });

    it('should create cache policies listed in provider.cloudFront.cachePolicies property', () => {
      const cachePolicyLogicalId = naming.getCloudFrontCachePolicyLogicalId(cachePolicyName);
      const cachePolicyConfigProperties =
        cfResources[cachePolicyLogicalId].Properties.CachePolicyConfig;
      expect(cachePolicyConfigProperties).to.deep.eq({
        Name: `${serviceName}-${stage}-${cachePolicyName}`,
        ...cachePolicyConfig,
      });
    });

    it('should attach a cache policy to a cloudfront behavior when specified by name in lambda config', () => {
      const cachePolicyLogicalId = naming.getCloudFrontCachePolicyLogicalId(cachePolicyName);
      expect(getAssociatedCacheBehavior('userConfiguredPolicy').CachePolicyId).to.deep.eq({
        Ref: cachePolicyLogicalId,
      });
    });

    it('Should attach a cache policy to a cloudfront behavior when specified by id in lambda config', () => {
      expect(getAssociatedCacheBehavior('managedPolicy').CachePolicyId).to.eq(cachePolicyId);
    });

    it('Should attach a cache policy to a cloudfront behavior when specified by id via `behavior.CachePolicyId` in lambda config', () => {
      expect(getAssociatedCacheBehavior('managedPolicySetViaBehavior').CachePolicyId).to.eq(
        cachePolicyId
      );
    });

    it('Should attach a cache policy specified via `cachePolicy.id` to a cloudfront behavior when specified via both of `cachePolicy.id` and `behavior.CachePolicyId` in lambda config', () => {
      expect(
        getAssociatedCacheBehavior('policySetViaCachePolicyIdAndBehavior').CachePolicyId
      ).to.eq(cachePolicyId);
    });

    it('Should attach a cache policy specified via `cachePolicy.name` to a cloudfront behavior when specified via both of `cachePolicy.name` and `behavior.CachePolicyId` in lambda config', () => {
      const cachePolicyLogicalId = naming.getCloudFrontCachePolicyLogicalId(cachePolicyName);
      expect(
        getAssociatedCacheBehavior('policySetViaCachePolicyNameAndBehavior').CachePolicyId
      ).to.deep.eq({
        Ref: cachePolicyLogicalId,
      });
    });

    it('Should attach a default cache policy when none are provided', () => {
      // Default Managed-CachingOptimized Cache Policy id
      const defaultCachePolicyId = '658327ea-f89d-4fab-a63d-7e88639e58f6';
      expect(getAssociatedCacheBehavior('noPolicy').CachePolicyId).to.eq(defaultCachePolicyId);
    });

    it('Should use legacy cache settings', () => {
      expect(getAssociatedCacheBehavior('legacyCacheSettings')).not.to.contain.keys(
        'CachePolicyId'
      );
      expect(getAssociatedCacheBehavior('legacyCacheSettings')).to.contain.keys(
        'MinTTL',
        'MaxTTL',
        'DefaultTTL',
        'ForwardedValues'
      );
    });
  });
});
