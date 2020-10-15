'use strict';

/* eslint-disable no-unused-expressions */

const sinon = require('sinon');
const chai = require('chai');
const proxyquire = require('proxyquire').noCallThru();
const AwsProvider = require('../../../../provider/awsProvider');
const Serverless = require('../../../../../../Serverless');
const runServerless = require('../../../../../../../test/utils/run-serverless');

const { expect } = chai;
chai.use(require('sinon-chai'));
chai.use(require('chai-as-promised'));

describe('AwsCompileS3Events', () => {
  let serverless;
  let awsCompileS3Events;
  let addCustomResourceToServiceStub;

  beforeEach(() => {
    addCustomResourceToServiceStub = sinon.stub().resolves();
    const AwsCompileS3Events = proxyquire('./index', {
      '../../../../customResources': {
        addCustomResourceToService: addCustomResourceToServiceStub,
      },
    });
    serverless = new Serverless();
    serverless.service.provider.compiledCloudFormationTemplate = { Resources: {} };
    serverless.setProvider('aws', new AwsProvider(serverless));
    awsCompileS3Events = new AwsCompileS3Events(serverless);
    awsCompileS3Events.serverless.service.service = 'new-service';
    awsCompileS3Events.serverless.configSchemaHandler = {
      schema: {
        definitions: {
          awsS3BucketName: {
            pattern: '',
          },
        },
      },
    };
  });

  describe('#constructor()', () => {
    it('should set the provider variable to an instance of AwsProvider', () =>
      expect(awsCompileS3Events.provider).to.be.instanceof(AwsProvider));
  });

  describe('#newS3Buckets()', () => {
    it('should create corresponding resources when S3 events are given', () => {
      awsCompileS3Events.serverless.service.functions = {
        first: {
          events: [
            {
              s3: 'first-function-bucket-one',
            },
            {
              s3: {
                bucket: 'first-function-bucket-two',
                event: 's3:ObjectCreated:Put',
                rules: [{ prefix: 'subfolder/' }],
              },
            },
          ],
        },
      };

      awsCompileS3Events.newS3Buckets();

      expect(
        awsCompileS3Events.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .S3BucketFirstfunctionbucketone.Type
      ).to.equal('AWS::S3::Bucket');
      expect(
        awsCompileS3Events.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .S3BucketFirstfunctionbuckettwo.Type
      ).to.equal('AWS::S3::Bucket');
      expect(
        awsCompileS3Events.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstLambdaPermissionFirstfunctionbucketoneS3.Type
      ).to.equal('AWS::Lambda::Permission');
      expect(
        awsCompileS3Events.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstLambdaPermissionFirstfunctionbuckettwoS3.Type
      ).to.equal('AWS::Lambda::Permission');
      expect(
        awsCompileS3Events.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .S3BucketFirstfunctionbuckettwo.Properties.NotificationConfiguration
          .LambdaConfigurations[0].Filter
      ).to.deep.equal({
        S3Key: { Rules: [{ Name: 'prefix', Value: 'subfolder/' }] },
      });
    });

    it('should create single bucket resource when the same bucket referenced repeatedly', () => {
      awsCompileS3Events.serverless.service.functions = {
        first: {
          events: [
            {
              s3: 'first-function-bucket-one',
            },
            {
              s3: {
                bucket: 'first-function-bucket-one',
                event: 's3:ObjectCreated:Put',
                rules: [{ prefix: 'subfolder/' }],
              },
            },
          ],
        },
      };

      awsCompileS3Events.newS3Buckets();

      expect(
        awsCompileS3Events.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .S3BucketFirstfunctionbucketone.Type
      ).to.equal('AWS::S3::Bucket');
      expect(
        awsCompileS3Events.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .S3BucketFirstfunctionbucketone.Properties.NotificationConfiguration.LambdaConfigurations
          .length
      ).to.equal(2);
      expect(
        awsCompileS3Events.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstLambdaPermissionFirstfunctionbucketoneS3.Type
      ).to.equal('AWS::Lambda::Permission');
    });

    it('should add the permission resource logical id to the buckets DependsOn array', () => {
      awsCompileS3Events.serverless.service.functions = {
        first: {
          events: [
            {
              s3: 'first-function-bucket-one',
            },
            {
              s3: {
                bucket: 'first-function-bucket-two',
              },
            },
          ],
        },
      };

      awsCompileS3Events.newS3Buckets();

      expect(
        awsCompileS3Events.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .S3BucketFirstfunctionbucketone.Type
      ).to.equal('AWS::S3::Bucket');
      expect(
        awsCompileS3Events.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .S3BucketFirstfunctionbuckettwo.Type
      ).to.equal('AWS::S3::Bucket');
      expect(
        awsCompileS3Events.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstLambdaPermissionFirstfunctionbucketoneS3.Type
      ).to.equal('AWS::Lambda::Permission');
      expect(
        awsCompileS3Events.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstLambdaPermissionFirstfunctionbuckettwoS3.Type
      ).to.equal('AWS::Lambda::Permission');
      expect(
        awsCompileS3Events.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .S3BucketFirstfunctionbucketone.DependsOn
      ).to.deep.equal(['FirstLambdaPermissionFirstfunctionbucketoneS3']);
      expect(
        awsCompileS3Events.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .S3BucketFirstfunctionbuckettwo.DependsOn
      ).to.deep.equal(['FirstLambdaPermissionFirstfunctionbuckettwoS3']);
    });

    it('should not create corresponding resources when S3 events are not given', () => {
      awsCompileS3Events.serverless.service.functions = {
        first: {
          events: [],
        },
      };

      awsCompileS3Events.newS3Buckets();

      expect(
        awsCompileS3Events.serverless.service.provider.compiledCloudFormationTemplate.Resources
      ).to.deep.equal({});
    });

    it('should generate a valid bucket name from provider.s3 entry', () => {
      awsCompileS3Events.serverless.service.provider.s3 = {
        bucketone: {},
      };
      awsCompileS3Events.serverless.service.functions = {
        first: {
          events: [
            {
              s3: {
                bucket: 'bucketone',
              },
            },
          ],
        },
      };

      awsCompileS3Events.newS3Buckets();

      expect(
        awsCompileS3Events.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .S3BucketBucketone.Properties.BucketName
      ).to.equal('bucketone');
    });

    it('should use logical id from provider s3 specification if exists', () => {
      awsCompileS3Events.serverless.service.provider.s3 = {
        bucketOne: 1,
      };
      awsCompileS3Events.serverless.service.functions = {
        first: {
          events: [
            {
              s3: 'bucketone',
            },
          ],
        },
      };

      awsCompileS3Events.newS3Buckets();

      expect(
        awsCompileS3Events.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .S3BucketBucketone.Type
      ).to.equal('AWS::S3::Bucket');
      expect(
        awsCompileS3Events.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .FirstLambdaPermissionBucketoneS3.Type
      ).to.equal('AWS::Lambda::Permission');
      expect(
        awsCompileS3Events.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .S3BucketBucketone.DependsOn
      ).to.deep.equal(['FirstLambdaPermissionBucketoneS3']);
    });

    it('should use name from provider s3 specification if exists', () => {
      awsCompileS3Events.serverless.service.provider.s3 = {
        bucketOne: {
          name: 'my-awesome-bucket',
        },
      };
      awsCompileS3Events.serverless.service.functions = {
        first: {
          events: [
            {
              s3: 'bucketOne',
            },
          ],
        },
      };

      awsCompileS3Events.newS3Buckets();

      expect(
        awsCompileS3Events.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .S3BucketBucketOne.Properties.BucketName
      ).to.equal('my-awesome-bucket');
    });

    it('should use bucketName over name property', () => {
      awsCompileS3Events.serverless.service.provider.s3 = {
        bucketOne: {
          name: 'not-used',
          bucketName: 'my-awesome-bucket',
        },
      };
      awsCompileS3Events.serverless.service.functions = {
        first: {
          events: [
            {
              s3: 'bucketOne',
            },
          ],
        },
      };

      awsCompileS3Events.newS3Buckets();

      expect(
        awsCompileS3Events.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .S3BucketBucketOne.Properties.BucketName
      ).to.equal('my-awesome-bucket');
    });

    it('should merge notification configuration', () => {
      awsCompileS3Events.serverless.service.provider.s3 = {
        bucketone: {
          notificationConfiguration: {
            QueueConfigurations: [1, 2, 3],
          },
        },
      };
      awsCompileS3Events.serverless.service.functions = {
        first: {
          events: [
            {
              s3: {
                bucket: 'bucketone',
              },
            },
          ],
        },
      };

      awsCompileS3Events.newS3Buckets();

      expect(
        awsCompileS3Events.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .S3BucketBucketone.Properties.NotificationConfiguration
      ).to.deep.equal({
        LambdaConfigurations: [
          {
            Event: 's3:ObjectCreated:*',
            Function: {
              'Fn::GetAtt': ['FirstLambdaFunction', 'Arn'],
            },
          },
        ],
        QueueConfigurations: [1, 2, 3],
      });
    });

    it('should convert camel case properties to pascal case', () => {
      awsCompileS3Events.serverless.service.provider.s3 = {
        bucketone: {
          tags: [1, 2, 3],
        },
      };
      awsCompileS3Events.serverless.service.functions = {
        first: {
          events: [
            {
              s3: {
                bucket: 'bucketone',
              },
            },
          ],
        },
      };

      awsCompileS3Events.newS3Buckets();

      expect(
        awsCompileS3Events.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .S3BucketBucketone.Properties.Tags
      ).to.deep.equal([1, 2, 3]);
    });
  });

  describe('#existingS3Buckets()', () => {
    it('should create the necessary resources for the most minimal configuration', () => {
      awsCompileS3Events.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              s3: {
                bucket: 'existing-s3-bucket',
                existing: true,
              },
            },
          ],
        },
      };

      return expect(awsCompileS3Events.existingS3Buckets()).to.be.fulfilled.then(() => {
        const {
          Resources,
        } = awsCompileS3Events.serverless.service.provider.compiledCloudFormationTemplate;

        expect(addCustomResourceToServiceStub).to.have.been.calledOnce;
        expect(addCustomResourceToServiceStub.args[0][1]).to.equal('s3');
        expect(addCustomResourceToServiceStub.args[0][2]).to.deep.equal([
          {
            Action: ['s3:PutBucketNotification', 's3:GetBucketNotification'],
            Effect: 'Allow',
            Resource: {
              'Fn::Join': [
                ':',
                [
                  'arn',
                  {
                    Ref: 'AWS::Partition',
                  },
                  's3',
                  '',
                  '',
                  'existing-s3-bucket',
                ],
              ],
            },
          },
          {
            Action: ['lambda:AddPermission', 'lambda:RemovePermission'],
            Effect: 'Allow',
            Resource: {
              'Fn::Join': [
                ':',
                [
                  'arn',
                  {
                    Ref: 'AWS::Partition',
                  },
                  'lambda',
                  {
                    Ref: 'AWS::Region',
                  },
                  {
                    Ref: 'AWS::AccountId',
                  },
                  'function',
                  '*',
                ],
              ],
            },
          },
        ]);
        expect(Resources.FirstCustomS31).to.deep.equal({
          Type: 'Custom::S3',
          Version: 1,
          DependsOn: ['FirstLambdaFunction', 'CustomDashresourceDashexistingDashs3LambdaFunction'],
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': ['CustomDashresourceDashexistingDashs3LambdaFunction', 'Arn'],
            },
            FunctionName: 'first',
            BucketName: 'existing-s3-bucket',
            BucketConfigs: [{ Event: 's3:ObjectCreated:*', Rules: [] }],
          },
        });
      });
    });

    it('should create the necessary resources for a service using different config parameters', () => {
      awsCompileS3Events.serverless.service.functions = {
        first: {
          name: 'second',
          events: [
            {
              s3: {
                bucket: 'existing-s3-bucket',
                event: 's3:ObjectCreated:Put',
                rules: [{ prefix: 'uploads' }, { suffix: '.jpg' }],
                existing: true,
              },
            },
          ],
        },
      };

      return expect(awsCompileS3Events.existingS3Buckets()).to.be.fulfilled.then(() => {
        const {
          Resources,
        } = awsCompileS3Events.serverless.service.provider.compiledCloudFormationTemplate;

        expect(addCustomResourceToServiceStub).to.have.been.calledOnce;
        expect(addCustomResourceToServiceStub.args[0][1]).to.equal('s3');
        expect(addCustomResourceToServiceStub.args[0][2]).to.deep.equal([
          {
            Action: ['s3:PutBucketNotification', 's3:GetBucketNotification'],
            Effect: 'Allow',
            Resource: {
              'Fn::Join': [
                ':',
                [
                  'arn',
                  {
                    Ref: 'AWS::Partition',
                  },
                  's3',
                  '',
                  '',
                  'existing-s3-bucket',
                ],
              ],
            },
          },
          {
            Action: ['lambda:AddPermission', 'lambda:RemovePermission'],
            Effect: 'Allow',
            Resource: {
              'Fn::Join': [
                ':',
                [
                  'arn',
                  {
                    Ref: 'AWS::Partition',
                  },
                  'lambda',
                  {
                    Ref: 'AWS::Region',
                  },
                  {
                    Ref: 'AWS::AccountId',
                  },
                  'function',
                  '*',
                ],
              ],
            },
          },
        ]);
        expect(Resources.FirstCustomS31).to.deep.equal({
          Type: 'Custom::S3',
          Version: 1,
          DependsOn: ['FirstLambdaFunction', 'CustomDashresourceDashexistingDashs3LambdaFunction'],
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': ['CustomDashresourceDashexistingDashs3LambdaFunction', 'Arn'],
            },
            FunctionName: 'second',
            BucketName: 'existing-s3-bucket',
            BucketConfigs: [
              {
                Event: 's3:ObjectCreated:Put',
                Rules: [{ Prefix: 'uploads' }, { Suffix: '.jpg' }],
              },
            ],
          },
        });
      });
    });

    it('should create the necessary resources for a service using multiple event definitions', () => {
      awsCompileS3Events.serverless.service.functions = {
        first: {
          name: 'second',
          events: [
            {
              s3: {
                bucket: 'existing-s3-bucket',
                event: 's3:ObjectCreated:Put',
                rules: [{ prefix: 'uploads' }, { suffix: '.jpg' }],
                existing: true,
              },
            },
            {
              s3: {
                bucket: 'existing-s3-bucket',
                event: 's3:ObjectRemoved:Delete',
                rules: [{ prefix: 'downloads' }, { suffix: '.txt' }],
                existing: true,
              },
            },
            {
              s3: {
                bucket: 'existing-s3-bucket',
                event: 's3:ObjectRestore:Post',
                rules: [{ prefix: 'avatars' }, { suffix: '.png' }],
                existing: true,
              },
            },
          ],
        },
      };

      return expect(awsCompileS3Events.existingS3Buckets()).to.be.fulfilled.then(() => {
        const {
          Resources,
        } = awsCompileS3Events.serverless.service.provider.compiledCloudFormationTemplate;

        expect(addCustomResourceToServiceStub).to.have.been.calledOnce;
        expect(addCustomResourceToServiceStub.args[0][1]).to.equal('s3');
        expect(addCustomResourceToServiceStub.args[0][2]).to.deep.equal([
          {
            Action: ['s3:PutBucketNotification', 's3:GetBucketNotification'],
            Effect: 'Allow',
            Resource: {
              'Fn::Join': [
                ':',
                [
                  'arn',
                  {
                    Ref: 'AWS::Partition',
                  },
                  's3',
                  '',
                  '',
                  'existing-s3-bucket',
                ],
              ],
            },
          },
          {
            Action: ['lambda:AddPermission', 'lambda:RemovePermission'],
            Effect: 'Allow',
            Resource: {
              'Fn::Join': [
                ':',
                [
                  'arn',
                  {
                    Ref: 'AWS::Partition',
                  },
                  'lambda',
                  {
                    Ref: 'AWS::Region',
                  },
                  {
                    Ref: 'AWS::AccountId',
                  },
                  'function',
                  '*',
                ],
              ],
            },
          },
        ]);
        expect(Resources.FirstCustomS31).to.deep.equal({
          Type: 'Custom::S3',
          Version: 1,
          DependsOn: ['FirstLambdaFunction', 'CustomDashresourceDashexistingDashs3LambdaFunction'],
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': ['CustomDashresourceDashexistingDashs3LambdaFunction', 'Arn'],
            },
            FunctionName: 'second',
            BucketName: 'existing-s3-bucket',
            BucketConfigs: [
              {
                Event: 's3:ObjectCreated:Put',

                Rules: [{ Prefix: 'uploads' }, { Suffix: '.jpg' }],
              },
              {
                Event: 's3:ObjectRemoved:Delete',
                Rules: [{ Prefix: 'downloads' }, { Suffix: '.txt' }],
              },
              {
                Event: 's3:ObjectRestore:Post',

                Rules: [{ Prefix: 'avatars' }, { Suffix: '.png' }],
              },
            ],
          },
        });
      });
    });

    it('should create a valid policy for an S3 bucket using !ImportValue', () => {
      awsCompileS3Events.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              s3: {
                bucket: { 'Fn::ImportValue': 'existing-s3-bucket' },

                existing: true,
              },
            },
          ],
        },
      };

      return expect(awsCompileS3Events.existingS3Buckets()).to.be.fulfilled.then(() => {
        expect(addCustomResourceToServiceStub).to.have.been.calledOnce;
        expect(addCustomResourceToServiceStub.args[0][2][0].Resource).to.deep.equal({
          'Fn::Join': [
            ':',
            [
              'arn',
              {
                Ref: 'AWS::Partition',
              },
              's3',
              '',
              '',
              { 'Fn::ImportValue': 'existing-s3-bucket' },
            ],
          ],
        });
      });
    });

    it('should create DependsOn clauses when one bucket is used in more than 1 custom resources', () => {
      awsCompileS3Events.serverless.service.functions = {
        first: {
          name: 'first',
          events: [
            {
              s3: {
                bucket: 'existing-s3-bucket',
                event: 's3:ObjectCreated:*',
                rules: [{ prefix: 'uploads' }, { suffix: '.jpg' }],
                existing: true,
              },
            },
            {
              s3: {
                bucket: 'existing-s3-bucket',
                event: 's3:ObjectCreated:*',
                rules: [{ prefix: 'uploads' }, { suffix: '.jpeg' }],
                existing: true,
              },
            },
            {
              s3: {
                bucket: 'existing-s3-bucket',
                event: 's3:ObjectCreated:*',
                rules: [{ prefix: 'uploads' }, { suffix: '.png' }],
                existing: true,
              },
            },
          ],
        },
        second: {
          name: 'second',
          events: [
            {
              s3: {
                bucket: 'existing-s3-bucket',
                event: 's3:ObjectRemoved:*',
                rules: [{ prefix: 'uploads' }, { suffix: '.jpg' }],
                existing: true,
              },
            },
            {
              s3: {
                bucket: 'existing-s3-bucket',
                event: 's3:ObjectRemoved:*',
                rules: [{ prefix: 'uploads' }, { suffix: '.jpeg' }],
                existing: true,
              },
            },
            {
              s3: {
                bucket: 'existing-s3-bucket',
                event: 's3:ObjectRemoved:*',
                rules: [{ prefix: 'uploads' }, { suffix: '.png' }],
                existing: true,
              },
            },
          ],
        },
      };

      return expect(awsCompileS3Events.existingS3Buckets()).to.be.fulfilled.then(() => {
        const {
          Resources,
        } = awsCompileS3Events.serverless.service.provider.compiledCloudFormationTemplate;

        expect(Object.keys(Resources)).to.have.length(2);
        expect(Resources.FirstCustomS31).to.deep.equal({
          Type: 'Custom::S3',
          Version: 1,
          DependsOn: ['FirstLambdaFunction', 'CustomDashresourceDashexistingDashs3LambdaFunction'],
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': ['CustomDashresourceDashexistingDashs3LambdaFunction', 'Arn'],
            },
            FunctionName: 'first',
            BucketName: 'existing-s3-bucket',
            BucketConfigs: [
              {
                Event: 's3:ObjectCreated:*',

                Rules: [{ Prefix: 'uploads' }, { Suffix: '.jpg' }],
              },
              {
                Event: 's3:ObjectCreated:*',
                Rules: [{ Prefix: 'uploads' }, { Suffix: '.jpeg' }],
              },
              {
                Event: 's3:ObjectCreated:*',
                Rules: [{ Prefix: 'uploads' }, { Suffix: '.png' }],
              },
            ],
          },
        });
        expect(Resources.SecondCustomS31).to.deep.equal({
          Type: 'Custom::S3',
          Version: 1,
          DependsOn: [
            'SecondLambdaFunction',
            'CustomDashresourceDashexistingDashs3LambdaFunction',
            'FirstCustomS31',
          ],
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': ['CustomDashresourceDashexistingDashs3LambdaFunction', 'Arn'],
            },
            FunctionName: 'second',
            BucketName: 'existing-s3-bucket',
            BucketConfigs: [
              {
                Event: 's3:ObjectRemoved:*',

                Rules: [{ Prefix: 'uploads' }, { Suffix: '.jpg' }],
              },
              {
                Event: 's3:ObjectRemoved:*',
                Rules: [{ Prefix: 'uploads' }, { Suffix: '.jpeg' }],
              },
              {
                Event: 's3:ObjectRemoved:*',
                Rules: [{ Prefix: 'uploads' }, { Suffix: '.png' }],
              },
            ],
          },
        });
      });
    });

    it('should throw if more than 1 S3 bucket is configured per function', () => {
      awsCompileS3Events.serverless.service.functions = {
        first: {
          name: 'second',
          events: [
            {
              s3: {
                bucket: 'existing-s3-bucket',
                existing: true,
              },
            },
            {
              s3: {
                bucket: 'existing-s3-bucket-2',
                existing: true,
              },
            },
          ],
        },
      };

      return expect(() => awsCompileS3Events.existingS3Buckets()).to.throw('Only one S3 Bucket');
    });

    it('should create lambda permissions policy with wild card', async () => {
      const { cfTemplate } = await runServerless({
        fixture: 's3',
        cliArgs: ['package'],
      });

      const expectedResource = [
        'arn',
        {
          Ref: 'AWS::Partition',
        },
        'lambda',
        {
          Ref: 'AWS::Region',
        },
        {
          Ref: 'AWS::AccountId',
        },
        'function',
        '*',
      ];

      const lambdaPermissionsPolicies = cfTemplate.Resources.IamRoleCustomResourcesLambdaExecution.Properties.Policies[
        '0'
      ].PolicyDocument.Statement.filter(x => x.Action[0].includes('AddPermission'));

      expect(lambdaPermissionsPolicies).to.have.length(1);

      const actualResource = lambdaPermissionsPolicies[0].Resource['Fn::Join'][1];

      expect(actualResource).to.deep.equal(expectedResource);
    });
  });
});
