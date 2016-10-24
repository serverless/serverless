'use strict';

const sinon = require('sinon');
const BbPromise = require('bluebird');
const path = require('path');
const expect = require('chai').expect;
const AwsProvider = require('../../provider/awsProvider');
const Serverless = require('../../../../Serverless');
const validate = require('../../lib/validate');
const configureStack = require('../lib/configureStack');

describe('#configureStack', () => {
  let serverless;
  const awsPlugin = {};
  const functionName = 'test';

  beforeEach(() => {
    serverless = new Serverless();
    awsPlugin.serverless = serverless;
    awsPlugin.provider = new AwsProvider(serverless);
    awsPlugin.options = {
      stage: 'dev',
      region: 'us-east-1',
    };

    Object.assign(awsPlugin, configureStack, validate);

    awsPlugin.serverless.cli = new serverless.classes.CLI();

    awsPlugin.serverless.service.provider.compiledCloudFormationTemplate = {
      Resources: {},
      Outputs: {},
    };
    awsPlugin.serverless.service.service = 'new-service';
    awsPlugin.serverless.service.functions = {
      [functionName]: {
        name: 'test',
        artifact: 'test.zip',
        handler: 'handler.hello',
      },
    };
  });

  it('should validate the region for the given S3 bucket', () => {
    const bucketName = 'com.serverless.deploys';

    const getBucketLocationStub = sinon
      .stub(awsPlugin.provider, 'request').returns(
        BbPromise.resolve({ LocationConstraint: awsPlugin.options.region })
      );

    awsPlugin.serverless.service.provider.deploymentBucket = bucketName;
    return awsPlugin.configureStack()
      .then(() => {
        expect(getBucketLocationStub.args[0][0]).to.equal('S3');
        expect(getBucketLocationStub.args[0][1]).to.equal('getBucketLocation');
        expect(getBucketLocationStub.args[0][2].Bucket).to.equal(bucketName);
      });
  });

  it('should reject an S3 bucket in the wrong region', () => {
    const bucketName = 'com.serverless.deploys';

    const createStackStub = sinon
      .stub(awsPlugin.provider, 'request').returns(
        BbPromise.resolve({ LocationConstraint: 'us-west-1' })
      );

    awsPlugin.serverless.service.provider.deploymentBucket = 'com.serverless.deploys';
    return awsPlugin.configureStack()
      .catch((err) => {
        expect(createStackStub.args[0][0]).to.equal('S3');
        expect(createStackStub.args[0][1]).to.equal('getBucketLocation');
        expect(createStackStub.args[0][2].Bucket).to.equal(bucketName);
        expect(err.message).to.contain('not in the same region');
      })
      .then(() => {});
  });

  it('should merge the IamRoleLambdaExecution template into the CloudFormation template', () => {
    const IamRoleLambdaExecutionTemplate = awsPlugin.serverless.utils.readFileSync(
      path.join(
        __dirname,
        '..',
        'lib',
        'iam-role-lambda-execution-template.json'
      )
    );

    return awsPlugin.configureStack()
      .then(() => {
        expect(awsPlugin.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.IamRoleLambdaExecution
        ).to.deep.equal(IamRoleLambdaExecutionTemplate.IamRoleLambdaExecution);
      });
  });

  it('should merge IamPolicyLambdaExecution template into the CloudFormation template', () =>
    awsPlugin.configureStack()
      .then(() => {
        // we check for the type here because a deep equality check will error out due to
        // the updates which are made after the merge (they are tested in a separate test)
        expect(awsPlugin.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.IamPolicyLambdaExecution.Type
        ).to.deep.equal('AWS::IAM::Policy');
      })
  );

  it('should update the necessary variables for the IamPolicyLambdaExecution', () =>
    awsPlugin.configureStack()
      .then(() => {
        expect(awsPlugin.serverless.service.provider.compiledCloudFormationTemplate
          .Resources
          .IamPolicyLambdaExecution
          .Properties
          .PolicyName
        ).to.equal(
          `${
            awsPlugin.options.stage
            }-${
            awsPlugin.serverless.service.service
            }-lambda`
        );
      })
  );

  it('should add a CloudWatch LogGroup resource', () => {
    const normalizedName = `${functionName[0].toUpperCase()}${functionName.substr(1)}LogGroup`;
    awsPlugin.configureStack();

    expect(awsPlugin.serverless.service.provider.compiledCloudFormationTemplate
      .Resources[normalizedName]
    ).to.deep.equal(
      {
        Type: 'AWS::Logs::LogGroup',
        Properties: {
          LogGroupName: `/aws/lambda/${functionName}`,
        },
      }
    );
  });

  it('should update IamPolicyLambdaExecution with a logging resource for the function', () => {
    const service = awsPlugin.serverless.service; // avoid 100 char lines below
    service.functions = {
      func0: {
        handler: 'func.function.handler',
        name: 'func0',
      },
      func1: {
        handler: 'func.function.handler',
        name: 'func1',
      },
    };
    const f = service.functions; // avoid 100 char lines below
    const normalizedNames = [
      `${f.func0.name[0].toUpperCase()}${f.func0.name.substr(1)}LogGroup`,
      `${f.func1.name[0].toUpperCase()}${f.func1.name.substr(1)}LogGroup`,
    ];
    awsPlugin.configureStack();

    expect(awsPlugin.serverless.service.provider.compiledCloudFormationTemplate
      .Resources[normalizedNames[0]]
    ).to.deep.equal(
      {
        Type: 'AWS::Logs::LogGroup',
        Properties: {
          LogGroupName: `/aws/lambda/${service.functions.func0.name}`,
        },
      }
    );
    expect(awsPlugin.serverless.service.provider.compiledCloudFormationTemplate
      .Resources[normalizedNames[1]]
    ).to.deep.equal(
      {
        Type: 'AWS::Logs::LogGroup',
        Properties: {
          LogGroupName: `/aws/lambda/${service.functions.func1.name}`,
        },
      }
    );
  });

  it('should update IamPolicyLambdaExecution with a logging resource for the function', () => {
    const normalizedName = `${functionName[0].toUpperCase()}${functionName.substr(1)}LogGroup`;
    awsPlugin.configureStack();

    expect(awsPlugin.serverless.service.provider.compiledCloudFormationTemplate
      .Resources
      .IamPolicyLambdaExecution
      .Properties
      .PolicyDocument
      .Statement[0]
      .Resource
    ).to.deep.equal([{ 'Fn::GetAtt': [normalizedName, 'Arn'] }]);
    expect(awsPlugin.serverless.service.provider.compiledCloudFormationTemplate
      .Resources
      .IamPolicyLambdaExecution
      .Properties
      .PolicyDocument
      .Statement[1]
      .Resource
    ).to.deep.equal([{ 'Fn::Join': [':', [{ 'Fn::GetAtt': [normalizedName, 'Arn'] }, '*']] }]);
  });

  it('should update IamPolicyLambdaExecution with each function\'s logging resources', () => {
    const service = awsPlugin.serverless.service; // avoid 100 char lines below
    service.functions = {
      func0: {
        handler: 'func.function.handler',
        name: 'func0',
      },
      func1: {
        handler: 'func.function.handler',
        name: 'func1',
      },
    };
    const f = service.functions; // avoid 100 char lines below
    const normalizedNames = [
      `${f.func0.name[0].toUpperCase()}${f.func0.name.substr(1)}LogGroup`,
      `${f.func1.name[0].toUpperCase()}${f.func1.name.substr(1)}LogGroup`,
    ];
    awsPlugin.configureStack();

    expect(awsPlugin.serverless.service.provider.compiledCloudFormationTemplate
      .Resources
      .IamPolicyLambdaExecution
      .Properties
      .PolicyDocument
      .Statement[0]
      .Resource
    ).to.deep.equal(
      [
        { 'Fn::GetAtt': [normalizedNames[0], 'Arn'] },
        { 'Fn::GetAtt': [normalizedNames[1], 'Arn'] },
      ]
    );
    expect(awsPlugin.serverless.service.provider.compiledCloudFormationTemplate
      .Resources
      .IamPolicyLambdaExecution
      .Properties
      .PolicyDocument
      .Statement[1]
      .Resource
    ).to.deep.equal(
      [
        { 'Fn::Join': [':', [{ 'Fn::GetAtt': [normalizedNames[0], 'Arn'] }, '*']] },
        { 'Fn::Join': [':', [{ 'Fn::GetAtt': [normalizedNames[1], 'Arn'] }, '*']] },
      ]
    );
  });

  it('should add custom IAM policy statements', () => {
    awsPlugin.serverless.service.provider.name = 'aws';
    awsPlugin.serverless.service.provider.iamRoleStatements = [
      {
        Effect: 'Allow',
        Action: [
          'something:SomethingElse',
        ],
        Resource: 'some:aws:arn:xxx:*:*',
      },
    ];


    return awsPlugin.configureStack()
      .then(() => {
        expect(awsPlugin.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.IamPolicyLambdaExecution.Properties.PolicyDocument.Statement[2]
        ).to.deep.equal(awsPlugin.serverless.service.provider.iamRoleStatements[0]);
      });
  });


  it('should use a custom bucket if specified', () => {
    const bucketName = 'com.serverless.deploys';

    awsPlugin.serverless.service.provider.deploymentBucket = bucketName;

    const coreCloudFormationTemplate = awsPlugin.serverless.utils.readFileSync(
      path.join(
        __dirname,
        '..',
        'lib',
        'core-cloudformation-template.json'
      )
    );
    awsPlugin.serverless.service.provider
      .compiledCloudFormationTemplate = coreCloudFormationTemplate;

    sinon
      .stub(awsPlugin.provider, 'request')
      .returns(BbPromise.resolve({ LocationConstraint: '' }));

    return awsPlugin.configureStack()
      .then(() => {
        expect(
          awsPlugin.serverless.service.provider.compiledCloudFormationTemplate
            .Outputs.ServerlessDeploymentBucketName.Value
        ).to.equal(bucketName);
        // eslint-disable-next-line no-unused-expressions
        expect(
          awsPlugin.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.ServerlessDeploymentBucket
        ).to.not.exist;
      });
  });
});
