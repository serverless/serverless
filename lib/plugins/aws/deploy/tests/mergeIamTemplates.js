'use strict';

const path = require('path');
const expect = require('chai').expect;

const Serverless = require('../../../../Serverless');
const AwsDeploy = require('../');

describe('#mergeIamTemplates()', () => {
  let awsDeploy;
  let serverless;

  beforeEach(() => {
    serverless = new Serverless();
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    awsDeploy = new AwsDeploy(serverless, options);
    awsDeploy.serverless.cli = new serverless.classes.CLI();
    awsDeploy.serverless.service.provider.compiledCloudFormationTemplate = {
      Resources: {},
    };
  });


  it('should merge the IamRoleLambdaExecution template into the CloudFormation template', () => {
    const IamRoleLambdaExecutionTemplate = awsDeploy.serverless.utils.readFileSync(
      path.join(
        __dirname,
        '..',
        'lib',
        'iam-role-lambda-execution-template.json'
      )
    );

    return awsDeploy.mergeIamTemplates()
      .then(() => {
        expect(awsDeploy.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.IamRoleLambdaExecution
        ).to.deep.equal(IamRoleLambdaExecutionTemplate.IamRoleLambdaExecution);
      });
  });

  it('should merge IamPolicyLambdaExecution template into the CloudFormation template', () =>
    awsDeploy.mergeIamTemplates()
      .then(() => {
        // we check for the type here because a deep equality check will error out due to
        // the updates which are made after the merge (they are tested in a separate test)
        expect(awsDeploy.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.IamPolicyLambdaExecution.Type
        ).to.deep.equal('AWS::IAM::Policy');
      })
  );

  it('should update the necessary variables for the IamPolicyLambdaExecution', () =>
    awsDeploy.mergeIamTemplates()
      .then(() => {
        expect(awsDeploy.serverless.service.provider.compiledCloudFormationTemplate
          .Resources
          .IamPolicyLambdaExecution
          .Properties
          .PolicyName
        ).to.equal(
          `${
            awsDeploy.options.stage
            }-${
            awsDeploy.serverless.service.service
            }-lambda`
        );

        expect(awsDeploy.serverless.service.provider.compiledCloudFormationTemplate
          .Resources
          .IamPolicyLambdaExecution
          .Properties
          .PolicyDocument
          .Statement[0]
          .Resource
        ).to.equal(`arn:aws:logs:${awsDeploy.options.region}:*:*`);
      })
  );

  it('should add custom IAM policy statements', () => {
    awsDeploy.serverless.service.provider.name = 'aws';
    awsDeploy.serverless.service.provider.iamRoleStatements = [
      {
        Effect: 'Allow',
        Action: [
          'something:SomethingElse',
        ],
        Resource: 'some:aws:arn:xxx:*:*',
      },
    ];


    return awsDeploy.mergeIamTemplates()
      .then(() => {
        expect(awsDeploy.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.IamPolicyLambdaExecution.Properties.PolicyDocument.Statement[1]
        ).to.deep.equal(awsDeploy.serverless.service.provider.iamRoleStatements[0]);
      });
  });

  it('should not add IamPolicyLambdaExecution if arn is provided', () => {
    awsDeploy.serverless.service.provider.iamRoleARN = 'some:aws:arn:xxx:*:*';

    return awsDeploy.mergeIamTemplates()
      .then(() => expect(
          awsDeploy.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.IamPolicyLambdaExecution
        ).to.not.exist);
  });


  it('should not add IamRole if arn is provided', () => {
    awsDeploy.serverless.service.provider.iamRoleARN = 'some:aws:arn:xxx:*:*';

    return awsDeploy.configureStack()
      .then(() => expect(
          awsDeploy.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.IamRoleLambdaExecution
        ).to.not.exist);
  });
});
