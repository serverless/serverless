'use strict';

const path = require('path');
const fs = require('fs');
const chai = require('chai');
const AwsProvider = require('../provider/awsProvider');
const Serverless = require('../../../Serverless');
const { createTmpDir } = require('../../../../tests/utils/fs');
const { addCustomResourceToService } = require('./index.js');

const expect = chai.expect;
chai.use(require('chai-as-promised'));

describe('#addCustomResourceToService()', () => {
  let tmpDirPath;
  let serverless;
  let provider;
  let context;
  const iamRoleStatements = [
    {
      Effect: 'Allow',
      Resource: 'arn:aws:lambda:*:*:function:custom-resource-func',
      Action: ['lambda:AddPermission', 'lambda:RemovePermission'],
    },
  ];

  beforeEach(() => {
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    tmpDirPath = createTmpDir();
    serverless = new Serverless();
    provider = new AwsProvider(serverless, options);
    serverless.setProvider('aws', provider);
    serverless.service.service = 'some-service';
    serverless.service.provider.compiledCloudFormationTemplate = {
      Resources: {},
    };
    serverless.config.servicePath = tmpDirPath;
    serverless.service.package.artifactDirectoryName = 'artifact-dir-name';
    context = {
      serverless,
      provider,
      options,
    };
  });

  describe('when using the custom S3 resouce', () => {
    it('should add the custom resource to the service', () => {
      return expect(
        addCustomResourceToService.call(context, 's3', iamRoleStatements)
      ).to.be.fulfilled.then(() => {
        const { Resources } = serverless.service.provider.compiledCloudFormationTemplate;
        const customResourcesZipFilePath = path.join(
          tmpDirPath,
          '.serverless',
          'custom-resources.zip'
        );

        expect(fs.existsSync(customResourcesZipFilePath)).to.equal(true);
        expect(Resources).to.deep.equal({
          CustomDashresourceDashexistingDashs3LambdaFunction: {
            Type: 'AWS::Lambda::Function',
            Properties: {
              Code: {
                S3Bucket: { Ref: 'ServerlessDeploymentBucket' },
                S3Key: 'artifact-dir-name/custom-resources.zip',
              },
              FunctionName: 'some-service-dev-custom-resource-existing-s3',
              Handler: 's3/handler.handler',
              MemorySize: 1024,
              Role: { 'Fn::GetAtt': ['IamRoleCustomResourcesLambdaExecution', 'Arn'] },
              Runtime: 'nodejs10.x',
              Timeout: 6,
            },
            DependsOn: ['IamRoleCustomResourcesLambdaExecution'],
          },
          IamRoleCustomResourcesLambdaExecution: {
            Type: 'AWS::IAM::Role',
            Properties: {
              AssumeRolePolicyDocument: {
                Statement: [
                  {
                    Action: ['sts:AssumeRole'],
                    Effect: 'Allow',
                    Principal: {
                      Service: ['lambda.amazonaws.com'],
                    },
                  },
                ],
                Version: '2012-10-17',
              },
              Policies: [
                {
                  PolicyDocument: {
                    Statement: [
                      {
                        Effect: 'Allow',
                        Resource: 'arn:aws:lambda:*:*:function:custom-resource-func',
                        Action: ['lambda:AddPermission', 'lambda:RemovePermission'],
                      },
                    ],
                    Version: '2012-10-17',
                  },
                  PolicyName: {
                    'Fn::Join': ['-', ['dev', 'some-service', 'custom-resources-lambda']],
                  },
                },
              ],
            },
          },
        });
      });
    });
  });
});
