'use strict';

const path = require('path');
const expect = require('chai').expect;

const Serverless = require('../../../../Serverless');
const AwsDeploy = require('../');

describe('#mergeIamTemplates()', () => {
  let awsDeploy;
  let serverless;
  const functionName = 'test';

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
    awsDeploy.serverless.service.service = 'new-service';
    awsDeploy.serverless.service.functions = {
      [functionName]: {
        name: 'test',
        artifact: 'test.zip',
        handler: 'handler.hello',
      },
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

  it('should merge IamPolicyLambdaExecution template into the CloudFormation template',
    () => awsDeploy.mergeIamTemplates()
      .then(() => {
        // we check for the type here because a deep equality check will error out due to
        // the updates which are made after the merge (they are tested in a separate test)
        expect(awsDeploy.serverless.service.provider.compiledCloudFormationTemplate
          .Resources.IamPolicyLambdaExecution.Type
        ).to.deep.equal('AWS::IAM::Policy');
      })
  );

  it('should update the necessary variables for the IamPolicyLambdaExecution',
    () => awsDeploy.mergeIamTemplates()
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
          .Resources.IamPolicyLambdaExecution.Properties.PolicyDocument.Statement[2]
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

  it('should add a CloudWatch LogGroup resource', () => {
    awsDeploy.serverless.service.provider.cf_logs = true;
    const normalizedName = `${functionName[0].toUpperCase()}${functionName.substr(1)}LogGroup`;
    return awsDeploy.mergeIamTemplates().then(() => {
      expect(awsDeploy.serverless.service.provider.compiledCloudFormationTemplate
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
  });

  it('should update IamPolicyLambdaExecution with a logging resource for the function', () => {
    awsDeploy.serverless.service.provider.cf_logs = true;
    const service = awsDeploy.serverless.service; // avoid 100 char lines below
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
    return awsDeploy.mergeIamTemplates().then(() => {
      expect(awsDeploy.serverless.service.provider.compiledCloudFormationTemplate
        .Resources[normalizedNames[0]]
      ).to.deep.equal(
        {
          Type: 'AWS::Logs::LogGroup',
          Properties: {
            LogGroupName: `/aws/lambda/${service.functions.func0.name}`,
          },
        }
      );
      expect(awsDeploy.serverless.service.provider.compiledCloudFormationTemplate
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
  });

  it('should update IamPolicyLambdaExecution with a logging resource for the function', () => {
    awsDeploy.serverless.service.provider.cf_logs = true;
    const normalizedName = `${functionName[0].toUpperCase()}${functionName.substr(1)}LogGroup`;
    return awsDeploy.mergeIamTemplates().then(() => {
      expect(awsDeploy.serverless.service.provider.compiledCloudFormationTemplate
        .Resources
        .IamPolicyLambdaExecution
        .Properties
        .PolicyDocument
        .Statement[0]
        .Resource
      ).to.deep.equal([{ 'Fn::GetAtt': [normalizedName, 'Arn'] }]);
      expect(awsDeploy.serverless.service.provider.compiledCloudFormationTemplate
        .Resources
        .IamPolicyLambdaExecution
        .Properties
        .PolicyDocument
        .Statement[1]
        .Resource
      ).to.deep.equal([{ 'Fn::Join': [':', [{ 'Fn::GetAtt': [normalizedName, 'Arn'] }, '*']] }]);
    });
  });

  it('should update IamPolicyLambdaExecution with each function\'s logging resources', () => {
    awsDeploy.serverless.service.provider.cf_logs = true;
    const service = awsDeploy.serverless.service; // avoid 100 char lines below
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
    return awsDeploy.mergeIamTemplates().then(() => {
      expect(awsDeploy.serverless.service.provider.compiledCloudFormationTemplate
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
      expect(awsDeploy.serverless.service.provider.compiledCloudFormationTemplate
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
  });
});
