'use strict';

const sinon = require('sinon');
const BbPromise = require('bluebird');
const path = require('path');
const expect = require('chai').expect;

const Serverless = require('../../../../Serverless');
const AwsSdk = require('../');

describe('#configureStack', () => {
  let awsSdk;
  let serverless;
  const functionName = 'test';

  beforeEach(() => {
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    serverless = new Serverless(options);
    awsSdk = new AwsSdk(serverless, options);
    awsSdk.serverless.cli = new serverless.classes.CLI();
    awsSdk.serverless.service.service = 'new-service';
    awsSdk.serverless.service.package.artifactDirectoryName = 'somedir';
    awsSdk.serverless.service.package.artifact = 'artifact.zip';
    awsSdk.serverless.service.functions = {
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
      .stub(awsSdk.sdk, 'request').returns(
        BbPromise.resolve({ LocationConstraint: awsSdk.options.region })
      );

    awsSdk.serverless.service.provider.deploymentBucket = bucketName;
    return awsSdk.configureStack()
      .then(() => {
        expect(getBucketLocationStub.args[0][0]).to.equal('S3');
        expect(getBucketLocationStub.args[0][1]).to.equal('getBucketLocation');
        expect(getBucketLocationStub.args[0][2].Bucket).to.equal(bucketName);
      });
  });

  it('should reject an S3 bucket in the wrong region', () => {
    const bucketName = 'com.serverless.deploys';

    const createStackStub = sinon
      .stub(awsSdk.sdk, 'request').returns(
        BbPromise.resolve({ LocationConstraint: 'us-west-1' })
      );

    awsSdk.serverless.service.provider.deploymentBucket = 'com.serverless.deploys';
    return awsSdk.configureStack()
      .catch((err) => {
        expect(createStackStub.args[0][0]).to.equal('S3');
        expect(createStackStub.args[0][1]).to.equal('getBucketLocation');
        expect(createStackStub.args[0][2].Bucket).to.equal(bucketName);
        expect(err.message).to.contain('not in the same region');
      })
      .then(() => {});
  });


  it('should merge the IamRoleLambdaExecution template into the CloudFormation template', () => {
    const IamRoleLambdaExecutionTemplate = awsSdk.serverless.utils.readFileSync(
      path.join(
        __dirname,
        '..',
        'lib',
        'iam-role-lambda-execution-template.json'
      )
    );

    return awsSdk.configureStack()
      .then(() => {
        expect(awsSdk.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.IamRoleLambdaExecution
        ).to.deep.equal(IamRoleLambdaExecutionTemplate.IamRoleLambdaExecution);
      });
  });

  it('should merge IamPolicyLambdaExecution template into the CloudFormation template', () =>
    awsSdk.configureStack()
      .then(() => {
        // we check for the type here because a deep equality check will error out due to
        // the updates which are made after the merge (they are tested in a separate test)
        expect(awsSdk.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.IamPolicyLambdaExecution.Type
        ).to.deep.equal('AWS::IAM::Policy');
      })
  );

  it('should update the necessary variables for the IamPolicyLambdaExecution', () =>
    awsSdk.configureStack()
      .then(() => {
        expect(awsSdk.serverless.service.provider.compiledCloudFormationTemplate
          .Resources
          .IamPolicyLambdaExecution
          .Properties
          .PolicyName
        ).to.equal(
          `${
            awsSdk.options.stage
            }-${
            awsSdk.serverless.service.service
            }-lambda`
        );

        expect(awsSdk.serverless.service.provider.compiledCloudFormationTemplate
          .Resources
          .IamPolicyLambdaExecution
          .Properties
          .PolicyDocument
          .Statement[0]
          .Resource
        ).to.equal(`arn:aws:logs:${awsSdk.options.region}:*:*`);
      })
  );

  it('should add custom IAM policy statements', () => {
    awsSdk.serverless.service.provider.name = 'aws';
    awsSdk.serverless.service.provider.iamRoleStatements = [
      {
        Effect: 'Allow',
        Action: [
          'something:SomethingElse',
        ],
        Resource: 'some:aws:arn:xxx:*:*',
      },
    ];


    return awsSdk.configureStack()
      .then(() => {
        expect(awsSdk.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.IamPolicyLambdaExecution.Properties.PolicyDocument.Statement[1]
        ).to.deep.equal(awsSdk.serverless.service.provider.iamRoleStatements[0]);
      });
  });

  it('should not add the default role and policy if provider has an ARN role', () => {
    awsSdk.serverless.service.provider.name = 'aws';
    awsSdk.serverless.service.provider.role = 'some:aws:arn:xxx:*:*';

    awsSdk.configureStack().then(() => {
      // eslint-disable-next-line no-unused-expressions
      expect(awsSdk.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.IamPolicyLambdaExecution
      ).to.be.undefined;
      // eslint-disable-next-line no-unused-expressions
      expect(awsSdk.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.IamRoleLambdaExecution
      ).to.be.undefined;
    });
  });

  it('should not add the default role and policy if all functions have an ARN role', () => {
    awsSdk.serverless.service.provider.name = 'aws';
    awsSdk.serverless.service.functions = {
      func0: {
        handler: 'func.function.handler',
        name: 'new-service-dev-func0',
        role: 'some:aws:arn:xx0:*:*',
      },
      func1: {
        handler: 'func.function.handler',
        name: 'new-service-dev-func1',
        role: 'some:aws:arn:xx1:*:*',
      },
    };

    awsSdk.configureStack().then(() => {
      // eslint-disable-next-line no-unused-expressions
      expect(awsSdk.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.IamPolicyLambdaExecution
      ).to.be.undefined;
      // eslint-disable-next-line no-unused-expressions
      expect(awsSdk.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.IamRoleLambdaExecution
      ).to.be.undefined;
    });
  });

  it('should not add default role/policy if all functions can has ARN role', () => {
    awsSdk.serverless.service.provider.name = 'aws';
    awsSdk.serverless.service.provider.role = 'some:aws:arn:xxx:*:*';
    awsSdk.serverless.service.functions = {
      func0: {
        handler: 'func.function.handler',
        name: 'new-service-dev-func0',
        // obtain role from provider
      },
      func1: {
        handler: 'func.function.handler',
        name: 'new-service-dev-func1',
        role: 'some:aws:arn:xx1:*:*',
      },
    };

    awsSdk.configureStack().then(() => {
      // eslint-disable-next-line no-unused-expressions
      expect(awsSdk.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.IamPolicyLambdaExecution
      ).to.be.undefined;
      // eslint-disable-next-line no-unused-expressions
      expect(awsSdk.serverless.service.provider.compiledCloudFormationTemplate
        .Resources.IamRoleLambdaExecution
      ).to.be.undefined;
    });
  });

  it('should use a custom bucket if specified', () => {
    const bucketName = 'com.serverless.deploys';

    awsSdk.serverless.service.provider.deploymentBucket = bucketName;

    const coreCloudFormationTemplate = awsSdk.serverless.utils.readFileSync(
      path.join(
        __dirname,
        '..',
        'lib',
        'core-cloudformation-template.json'
      )
    );
    awsSdk.serverless.service.provider
      .compiledCloudFormationTemplate = coreCloudFormationTemplate;

    sinon
      .stub(awsSdk.sdk, 'request')
      .returns(BbPromise.resolve({ LocationConstraint: awsSdk.options.region }));

    return awsSdk.configureStack()
      .then(() => {
        expect(
          awsSdk.serverless.service.provider.compiledCloudFormationTemplate
            .Outputs.ServerlessDeploymentBucketName.Value
        ).to.equal(bucketName);
        // eslint-disable-next-line no-unused-expressions
        expect(
          awsSdk.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.ServerlessDeploymentBucket
        ).to.not.exist;
      });
  });

  it('should not add IamPolicyLambdaExecution', () => {
    awsSdk.serverless.service.provider.role = 'some:aws:arn:xxx:*:*';

    return awsSdk.configureStack()
      .then(() => expect(
          awsSdk.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.IamPolicyLambdaExecution
        ).to.not.exist);
  });


  it('should not add IamRole', () => {
    awsSdk.serverless.service.provider.role = 'some:aws:arn:xxx:*:*';

    return awsSdk.configureStack()
      .then(() => expect(
          awsSdk.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.IamRoleLambdaExecution
        ).to.not.exist);
  });
});
