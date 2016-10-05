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

  beforeEach(() => {
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    serverless = new Serverless(options);
    awsSdk = new AwsSdk(serverless, options);
    awsSdk.serverless.cli = new serverless.classes.CLI();
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

  it('should merge the role template into the CloudFormation template', () => {
    const roleTemplate = awsSdk.serverless.utils.readFileSync(
      path.join(
        __dirname,
        '..',
        'lib',
        'iam-role-lambda-execution-template.json'
      )
    );
    roleTemplate[awsSdk.sdk.naming.getLogicalRoleName()].Properties
      .Path = awsSdk.sdk.naming.getRolePath();
    roleTemplate[awsSdk.sdk.naming.getLogicalRoleName()].Properties
      .RoleName = awsSdk.sdk.naming.getRoleName();


    return awsSdk.configureStack()
      .then(() => {
        expect(awsSdk.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[awsSdk.sdk.naming.getLogicalRoleName()]
        ).to.deep.equal(roleTemplate[awsSdk.sdk.naming.getLogicalRoleName()]);
      });
  });

  it('should merge policy template into the CloudFormation template', () =>
    awsSdk.configureStack()
      .then(() => {
        // we check for the type here because a deep equality check will error out due to
        // the updates which are made after the merge (they are tested in a separate test)
        expect(awsSdk.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[awsSdk.sdk.naming.getLogicalPolicyName()].Type
        ).to.deep.equal('AWS::IAM::Policy');
      })
  );

  it('should update the necessary variables for the policy', () =>
    awsSdk.configureStack()
      .then(() => {
        expect(awsSdk.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[awsSdk.sdk.naming.getLogicalPolicyName()]
          .Properties
          .PolicyName
        ).to.eql(awsSdk.sdk.naming.getPolicyName());

        expect(awsSdk.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[awsSdk.sdk.naming.getLogicalPolicyName()]
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
          .Resources[awsSdk.sdk.naming.getLogicalPolicyName()]
          .Properties.PolicyDocument.Statement[1]
        ).to.deep.equal(awsSdk.serverless.service.provider.iamRoleStatements[0]);
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
            .Outputs[awsSdk.sdk.naming.getLogicalDeploymentBucketOutputVariableName()].Value
        ).to.equal(bucketName);
        // eslint-disable-next-line no-unused-expressions
        expect(
          awsSdk.serverless.service.provider.compiledCloudFormationTemplate
            .Resources[awsSdk.sdk.naming.getLogicalDeploymentBucketName()]
        ).to.not.exist;
      });
  });

  it('should not add default policy', () => {
    awsSdk.serverless.service.provider.iamRoleARN = 'some:aws:arn:xxx:*:*';

    return awsSdk.configureStack()
      .then(() => expect(
          awsSdk.serverless.service.provider.compiledCloudFormationTemplate
            .Resources[awsSdk.sdk.naming.getLogicalPolicyName()]
        ).to.not.exist);
  });


  it('should not add default role', () => {
    awsSdk.serverless.service.provider.iamRoleARN = 'some:aws:arn:xxx:*:*';

    return awsSdk.configureStack()
      .then(() => expect(
          awsSdk.serverless.service.provider.compiledCloudFormationTemplate
            .Resources[awsSdk.sdk.naming.getLogicalRoleName()]
        ).to.not.exist);
  });
});
