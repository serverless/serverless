'use strict';

const path = require('path');
const fse = require('fs-extra');
const expect = require('chai').expect;
const sinon = require('sinon');
const testUtils = require('../../../../../tests/utils');
const AwsPackage = require('../index');
const Serverless = require('../../../../Serverless');
const AwsProvider = require('../../provider/awsProvider');

describe('splitStack', () => {
  let serverless;
  let awsPackage;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.setProvider('aws', new AwsProvider(serverless));
    awsPackage = new AwsPackage(serverless, {});
    serverless.service = {
      package: {
        artifactDirectoryName: 'some-directory',
      },
      provider: {
        /* eslint-disable max-len */
        compiledCloudFormationTemplate: {
          Resources: {
            ServerlessDeploymentBucket: {
              Type: 'AWS::S3::Bucket',
            },
            Func1LogGroup: {
              Type: 'AWS::Logs::LogGroup',
              Properties: { LogGroupName: '/aws/lambda/service-dev-hello' },
            },
            IamRoleLambdaExecution: {
              Type: 'AWS::IAM::Role',
              Properties: {
                AssumeRolePolicyDocument: {
                  Version: '2012-10-17',
                  Statement: [
                    {
                      Effect: 'Allow',
                      Principal: { Service: ['lambda.amazonaws.com'] },
                      Action: ['sts:AssumeRole'],
                    },
                  ],
                },
                Policies: [
                  {
                    PolicyName: {
                      'Fn::Join': ['-', ['dev', 'service', 'lambda']],
                    },
                    PolicyDocument: {
                      Version: '2012-10-17',
                      Statement: [
                        {
                          Effect: 'Allow',
                          Action: ['logs:CreateLogStream'],
                          Resource: [{ 'Fn::Sub': 'arn:aws:logs:${AWS::Region}:${AWS::AccountId}:log-group:/aws/lambda/service-dev-func1:*' }],
                        },
                        {
                          Effect: 'Allow',
                          Action: ['logs:PutLogEvents'],
                          Resource: [{ 'Fn::Sub': 'arn:aws:logs:${AWS::Region}:${AWS::AccountId}:log-group:/aws/lambda/service-dev-func1:*:*' }],
                        },
                      ],
                    },
                  },
                ],
                Path: '/',
                RoleName: { 'Fn::Join': ['-', ['service', 'dev', 'us-east-1', 'lambdaRole']] },
              },
            },
            Func1LambdaFunction: {
              Type: 'AWS::Lambda::Function',
              Properties: {
                Code: {
                  S3Bucket: { Ref: 'ServerlessDeploymentBucket' },
                  S3Key: 'serverless/service/dev/1494405999466-2017-05-10T08:46:39.466Z/service.zip',
                },
                FunctionName: 'service-dev-func1',
                Handler: 'handler.func1',
                MemorySize: 1024,
                Role: { 'Fn::GetAtt': ['IamRoleLambdaExecution', 'Arn'] },
                Runtime: 'nodejs6.10',
                Timeout: 6,
              },
              DependsOn: ['Func1LogGroup', 'IamRoleLambdaExecution'],
            },
            Func1LambdaVersionNW4EsouaYTwudLQRlbUl7fVQR6WAYwqCfytC6fDOtI: {
              Type: 'AWS::Lambda::Version',
              DeletionPolicy: 'Retain',
              Properties: {
                FunctionName: {
                  Ref: 'Func1LambdaFunction',
                },
                CodeSha256: 'N+W4EsouaYTwudLQRlbUl7fVQR6WAYwqCfytC6fDOtI=',
              },
            },
            SNSTopicFoo: {
              Type: 'AWS::SNS::Topic',
              Properties: {
                TopicName: 'foo',
                DisplayName: '',
                Subscription: [
                  {
                    Endpoint: { 'Fn::GetAtt': ['Func1LambdaFunction', 'Arn'] },
                    Protocol: 'lambda',
                  },
                ],
              },
            },
            Func1LambdaPermissionFooSNS: {
              Type: 'AWS::Lambda::Permission',
              Properties: {
                FunctionName: {
                  'Fn::GetAtt': ['Func1LambdaFunction', 'Arn'],
                },
                Action: 'lambda:InvokeFunction',
                Principal: 'sns.amazonaws.com',
                SourceArn: {
                  'Fn::Join': ['', ['arn:aws:sns:', { Ref: 'AWS::Region' }, ':', { Ref: 'AWS::AccountId' }, ':', 'foo']],
                },
              },
            },
          },
          Outputs: {
            ServerlessDeploymentBucketName: {
              Value: {
                Ref: 'ServerlessDeploymentBucket',
              },
            },
            Func1LambdaFunctionQualifiedArn: {
              Description: 'Current Lambda function version',
              Value: {
                Ref: 'Func1LambdaVersionNW4EsouaYTwudLQRlbUl7fVQR6WAYwqCfytC6fDOtI',
              },
            },
          },
        },
        /* eslint-enable max-len */
        cloudFormationDependencyGraph: null,
        nestedStacks: [],
      },
    };
  });

  describe('#splitStack()', () => {
    let createDependencyGraphStub;
    let generateNestedStacksStub;
    let writeStacksToDiskStub;
    let updateCompiledCloudFormationTemplateStub;

    beforeEach(() => {
      createDependencyGraphStub = sinon
        .stub(awsPackage, 'createDependencyGraph').resolves();
      generateNestedStacksStub = sinon
        .stub(awsPackage, 'generateNestedStacks').resolves();
      writeStacksToDiskStub = sinon
        .stub(awsPackage, 'writeStacksToDisk').resolves();
      updateCompiledCloudFormationTemplateStub = sinon
        .stub(awsPackage, 'updateCompiledCloudFormationTemplate').resolves();
    });

    afterEach(() => {
      awsPackage.createDependencyGraph.restore();
      awsPackage.generateNestedStacks.restore();
      awsPackage.writeStacksToDisk.restore();
      awsPackage.updateCompiledCloudFormationTemplate.restore();
    });

    it('should resolve if useStackSplitting config variable is not set', () => awsPackage
      .splitStack().then(() => {
        expect(createDependencyGraphStub.calledOnce).to.equal(false);
        expect(generateNestedStacksStub.calledOnce).to.equal(false);
        expect(writeStacksToDiskStub.calledOnce).to.equal(false);
        expect(updateCompiledCloudFormationTemplateStub.calledOnce).to.equal(false);
      })
    );

    it('should run promise chain if useStackSplitting config variable is set', () => {
      awsPackage.serverless.service.provider.useStackSplitting = true;

      return awsPackage.splitStack().then(() => {
        expect(createDependencyGraphStub.calledOnce).to.equal(true);
        expect(generateNestedStacksStub.calledAfter(createDependencyGraphStub)).to.equal(true);
        expect(writeStacksToDiskStub.calledAfter(generateNestedStacksStub)).to.equal(true);
        expect(updateCompiledCloudFormationTemplateStub
          .calledAfter(writeStacksToDiskStub)).to.equal(true);
      });
    });
  });

  describe('#createDependencyGraph()', () => {
    it('should compute a valid dependency graph', () => {
      const expectedDepGraph = {
        nodes: {
          ServerlessDeploymentBucket: { type: 'resource' },
          Func1LogGroup: { type: 'resource' },
          IamRoleLambdaExecution: { type: 'resource' },
          Func1LambdaFunction: { type: 'resource' },
          Func1LambdaVersionNW4EsouaYTwudLQRlbUl7fVQR6WAYwqCfytC6fDOtI: { type: 'resource' },
          SNSTopicFoo: { type: 'resource' },
          Func1LambdaPermissionFooSNS: { type: 'resource' },
          ServerlessDeploymentBucketName: { type: 'output' },
          Func1LambdaFunctionQualifiedArn: { type: 'output' },
        },
        outgoingEdges: {
          ServerlessDeploymentBucket: [],
          Func1LogGroup: [],
          IamRoleLambdaExecution: [],
          Func1LambdaFunction: [
            'ServerlessDeploymentBucket',
            'IamRoleLambdaExecution',
            'Func1LogGroup',
          ],
          Func1LambdaVersionNW4EsouaYTwudLQRlbUl7fVQR6WAYwqCfytC6fDOtI: ['Func1LambdaFunction'],
          SNSTopicFoo: ['Func1LambdaFunction'],
          Func1LambdaPermissionFooSNS: ['Func1LambdaFunction'],
          ServerlessDeploymentBucketName: ['ServerlessDeploymentBucket'],
          Func1LambdaFunctionQualifiedArn: [
            'Func1LambdaVersionNW4EsouaYTwudLQRlbUl7fVQR6WAYwqCfytC6fDOtI',
          ],
        },
        incomingEdges: {
          ServerlessDeploymentBucket: [
            'Func1LambdaFunction',
            'ServerlessDeploymentBucketName',
          ],
          Func1LogGroup: ['Func1LambdaFunction'],
          IamRoleLambdaExecution: ['Func1LambdaFunction'],
          Func1LambdaFunction: [
            'Func1LambdaVersionNW4EsouaYTwudLQRlbUl7fVQR6WAYwqCfytC6fDOtI',
            'SNSTopicFoo',
            'Func1LambdaPermissionFooSNS',
          ],
          Func1LambdaVersionNW4EsouaYTwudLQRlbUl7fVQR6WAYwqCfytC6fDOtI: [
            'Func1LambdaFunctionQualifiedArn',
          ],
          SNSTopicFoo: [],
          Func1LambdaPermissionFooSNS: [],
          ServerlessDeploymentBucketName: [],
          Func1LambdaFunctionQualifiedArn: [],
        },
      };

      return awsPackage.createDependencyGraph().then(() => {
        const depGraph = awsPackage.serverless.service.provider.cloudFormationDependencyGraph;

        expect(depGraph.nodes).to.deep.equal(expectedDepGraph.nodes);
        expect(depGraph.outgoingEdges).to.deep.equal(expectedDepGraph.outgoingEdges);
        expect(depGraph.incomingEdges).to.deep.equal(expectedDepGraph.incomingEdges);
      });
    });
  });

  describe('#generateNestedStacks()', () => {
    beforeEach(() => {
      awsPackage.createDependencyGraph();
    });

    it('should generate and append the resources for the nested stacks', () => awsPackage
      .generateNestedStacks().then(() => {
        const nestedStacks = awsPackage.serverless.service.provider.nestedStacks;

        // stackTemplate
        const stackTemplateParameters = {
          ServerlessDeploymentBucket: {
            Type: 'String',
          },
          IamRoleLambdaExecution: {
            Type: 'String',
          },
        };
        const stackTemplate = nestedStacks[0].stackTemplate;
        expect(stackTemplate.Parameters).to.deep.equal(stackTemplateParameters);
        expect(Object.keys(stackTemplate.Resources).length).to.equal(5);
        expect(stackTemplate.Resources.Func1LambdaFunction).to.not.equal(undefined);
        expect(stackTemplate.Resources.Func1LambdaFunction.Properties.Code.S3Bucket.Ref)
          .to.equal('ServerlessDeploymentBucket');
        expect(stackTemplate.Resources.Func1LambdaFunction.Properties.Role.Ref)
          .to.equal('IamRoleLambdaExecution');
        expect(stackTemplate.Resources.Func1LambdaFunction.DependsOn)
          .to.deep.equal(['Func1LogGroup']);
        expect(stackTemplate.Resources.Func1LogGroup).to.not.equal(undefined);
        expect(stackTemplate.Resources.Func1LambdaVersionNW4EsouaYTwudLQRlbUl7fVQR6WAYwqCfytC6fDOtI)
          .to.not.equal(undefined);
        expect(stackTemplate.Resources.Func1LambdaVersionNW4EsouaYTwudLQRlbUl7fVQR6WAYwqCfytC6fDOtI
          .Properties.FunctionName.Ref).to.equal('Func1LambdaFunction');
        expect(stackTemplate.Resources.SNSTopicFoo).to.not.equal(undefined);
        expect(stackTemplate.Resources.SNSTopicFoo.Properties.Subscription[0].Endpoint)
          .to.deep.equal({ 'Fn::GetAtt': ['Func1LambdaFunction', 'Arn'] });
        expect(stackTemplate.Resources.Func1LambdaPermissionFooSNS).to.not.equal(undefined);
        expect(stackTemplate.Resources.Func1LambdaPermissionFooSNS.Properties.FunctionName)
          .to.deep.equal({ 'Fn::GetAtt': ['Func1LambdaFunction', 'Arn'] });
        expect(Object.keys(stackTemplate.Outputs).length).to.equal(1);
        expect(stackTemplate.Outputs.Func1LambdaFunctionQualifiedArn).to.not.equal(undefined);
        expect(stackTemplate.Outputs.Func1LambdaFunctionQualifiedArn.Value.Ref)
          .to.equal('Func1LambdaVersionNW4EsouaYTwudLQRlbUl7fVQR6WAYwqCfytC6fDOtI');

        // stackResource
        const stackResourceParameters = {
          ServerlessDeploymentBucket: {
            Ref: 'ServerlessDeploymentBucket',
          },
          IamRoleLambdaExecution: {
            'Fn::GetAtt': ['IamRoleLambdaExecution', 'Arn'],
          },
        };
        const statckResourceDependsOn = ['ServerlessDeploymentBucket', 'IamRoleLambdaExecution'];
        const stackResource = nestedStacks[0].stackResource;
        expect(Object.keys(stackResource).length).to.equal(1);
        expect(stackResource.NestedStack1).to.not.equal(undefined);
        expect(stackResource.NestedStack1.Properties.Parameters)
          .to.deep.equal(stackResourceParameters);
        expect(stackResource.NestedStack1.Properties.TemplateURL)
          .to.match(/cloudformation-template-nested-stack-1\.json/);
        expect(stackResource.NestedStack1.DependsOn).to.deep.equal(statckResourceDependsOn);
      })
    );
  });

  describe('#writeStacksToDisk()', () => {
    beforeEach(() => {
      awsPackage.createDependencyGraph();
      awsPackage.generateNestedStacks();
    });

    it('should write the generated nested stack templates to disk', () => {
      const tmpDirPath = testUtils.getTmpDirPath();
      const serverlessDirPath = path.join(tmpDirPath, '.serverless');
      const nestedStackFile1 = 'cloudformation-template-nested-stack-1.json';
      const nestedStackFile1Path = path.join(serverlessDirPath, nestedStackFile1);
      fse.mkdirsSync(serverlessDirPath);
      awsPackage.serverless.config.servicePath = tmpDirPath;

      return awsPackage.writeStacksToDisk().then(() => {
        const nestedStacks = awsPackage.serverless.service.provider.nestedStacks;
        const nestedStackFile1Content = fse.readJsonSync(nestedStackFile1Path);

        expect(nestedStackFile1Content).to.deep.equal(nestedStacks[0].stackTemplate);
      });
    });
  });

  describe('#updateCompiledCloudFormationTemplate()', () => {
    beforeEach(() => {
      awsPackage.createDependencyGraph();
      awsPackage.generateNestedStacks();
    });

    it('should update the in-memory compiled CloudFormation template', () => awsPackage
      .updateCompiledCloudFormationTemplate().then(() => {
        const compiledCfTemplate = awsPackage.serverless.service
          .provider.compiledCloudFormationTemplate;

        const nestedStackParameters = {
          ServerlessDeploymentBucket: {
            Ref: 'ServerlessDeploymentBucket',
          },
          IamRoleLambdaExecution: {
            'Fn::GetAtt': ['IamRoleLambdaExecution', 'Arn'],
          },
        };

        const nestedStackDependsOn = ['ServerlessDeploymentBucket', 'IamRoleLambdaExecution'];
        expect(Object.keys(compiledCfTemplate.Resources).length).to.equal(3);
        expect(compiledCfTemplate.Resources.ServerlessDeploymentBucket).to.not.equal(undefined);
        expect(compiledCfTemplate.Resources.IamRoleLambdaExecution).to.not.equal(undefined);
        expect(compiledCfTemplate.Resources.NestedStack1).to.not.equal(undefined);
        expect(compiledCfTemplate.Resources.NestedStack1.Properties.Parameters)
          .to.deep.equal(nestedStackParameters);
        expect(compiledCfTemplate.Resources.NestedStack1.Properties.TemplateURL)
          .to.match(/cloudformation-template-nested-stack-1\.json/);
        expect(compiledCfTemplate.Resources.NestedStack1.DependsOn)
          .to.deep.equal(nestedStackDependsOn);
        expect(Object.keys(compiledCfTemplate.Outputs).length).to.equal(1);
        expect(compiledCfTemplate.Outputs.ServerlessDeploymentBucketName).to.not.equal(undefined);
        expect(compiledCfTemplate.Outputs.ServerlessDeploymentBucketName.Value.Ref)
          .to.equal('ServerlessDeploymentBucket');
      })
    );
  });
});
