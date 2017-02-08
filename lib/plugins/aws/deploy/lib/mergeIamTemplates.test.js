'use strict';

const path = require('path');
const expect = require('chai').expect;

const Serverless = require('../../../../Serverless');
const AwsProvider = require('../../provider/awsProvider');
const AwsDeploy = require('../index');

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
    serverless.setProvider('aws', new AwsProvider(serverless));
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

  it('should not merge there are no functions', () => {
    awsDeploy.serverless.service.functions = {};

    return awsDeploy.mergeIamTemplates()
      .then(() => {
        const resources = awsDeploy.serverless.service.provider
          .compiledCloudFormationTemplate.Resources;

        expect(resources[awsDeploy.provider.naming.getRoleLogicalId()]).to.equal(undefined);
        expect(resources[awsDeploy.provider.naming.getPolicyLogicalId()]).to.equal(undefined);
      });
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
    IamRoleLambdaExecutionTemplate.Properties.Path = awsDeploy.provider.naming.getRolePath();
    IamRoleLambdaExecutionTemplate.Properties.RoleName = awsDeploy.provider.naming.getRoleName();

    return awsDeploy.mergeIamTemplates()
      .then(() => {
        expect(awsDeploy.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[awsDeploy.provider.naming.getRoleLogicalId()]
        ).to.deep.equal(
          IamRoleLambdaExecutionTemplate
        );
      });
  });

  it('should merge IamPolicyLambdaExecution template into the CloudFormation template',
    () => awsDeploy.mergeIamTemplates()
      .then(() => {
        // we check for the type here because a deep equality check will error out due to
        // the updates which are made after the merge (they are tested in a separate test)
        expect(awsDeploy.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[awsDeploy.provider.naming.getPolicyLogicalId()]
          .Type
        ).to.deep.equal('AWS::IAM::Policy');
      })
  );

  it('should update the necessary variables for the IamPolicyLambdaExecution',
    () => awsDeploy.mergeIamTemplates()
      .then(() => {
        expect(awsDeploy.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[awsDeploy.provider.naming.getPolicyLogicalId()]
          .Properties
          .PolicyName
        ).to.eql(
          {
            'Fn::Join': [
              '-',
              [
                awsDeploy.options.stage,
                awsDeploy.serverless.service.service,
                'lambda',
              ],
            ],
          }
        );
      })
  );

  it('should add custom IAM policy statements', () => {
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
          .Resources[awsDeploy.provider.naming.getPolicyLogicalId()]
          .Properties
          .PolicyDocument
          .Statement[1]
        ).to.deep.equal(awsDeploy.serverless.service.provider.iamRoleStatements[0]);
      });
  });

  it('should throw error if custom IAM policy statements is not an array', () => {
    awsDeploy.serverless.service.provider.iamRoleStatements = {
      policy: 'some_value',
      statments: [
        {
          Effect: 'Allow',
          Action: [
            'something:SomethingElse',
          ],
          Resource: 'some:aws:arn:xxx:*:*',
        },
      ],
    };

    expect(() => awsDeploy.mergeIamTemplates()).to.throw('not an array');
  });

  it('should throw error if a custom IAM policy statement does not have an Effect field', () => {
    awsDeploy.serverless.service.provider.iamRoleStatements = [{
      Action: ['something:SomethingElse'],
      Resource: '*',
    }];

    expect(() => awsDeploy.mergeIamTemplates()).to.throw(
        'missing the following properties: Effect');
  });

  it('should throw error if a custom IAM policy statement does not have an Action field', () => {
    awsDeploy.serverless.service.provider.iamRoleStatements = [{
      Effect: 'Allow',
      Resource: '*',
    }];

    expect(() => awsDeploy.mergeIamTemplates()).to.throw(
        'missing the following properties: Action');
  });

  it('should throw error if a custom IAM policy statement does not have a Resource field', () => {
    awsDeploy.serverless.service.provider.iamRoleStatements = [{
      Action: ['something:SomethingElse'],
      Effect: 'Allow',
    }];

    expect(() => awsDeploy.mergeIamTemplates()).to.throw(
        'missing the following properties: Resource');
  });

  it('should throw an error describing all problematics custom IAM policy statements', () => {
    awsDeploy.serverless.service.provider.iamRoleStatements = [
      {
        Action: ['something:SomethingElse'],
        Effect: 'Allow',
      },
      {
        Action: ['something:SomethingElse'],
        Resource: '*',
        Effect: 'Allow',
      },
      {
        Resource: '*',
      },
    ];

    expect(() => awsDeploy.mergeIamTemplates())
      .to.throw(/statement 0 is missing.*Resource; statement 2 is missing.*Effect, Action/);
  });

  it('should add a CloudWatch LogGroup resource', () => {
    const normalizedName = awsDeploy.provider.naming.getLogGroupLogicalId(functionName);
    return awsDeploy.mergeIamTemplates().then(() => {
      expect(awsDeploy.serverless.service.provider.compiledCloudFormationTemplate
        .Resources[normalizedName]
      ).to.deep.equal(
        {
          Type: 'AWS::Logs::LogGroup',
          Properties: {
            LogGroupName: awsDeploy.provider.naming.getLogGroupName(functionName),
          },
        }
      );
    });
  });

  it('should add a CloudWatch LogGroup resource if all functions use custom roles', () => {
    awsDeploy.serverless.service.functions[functionName].role = 'something';
    const normalizedName = awsDeploy.provider.naming.getLogGroupLogicalId(functionName);
    return awsDeploy.mergeIamTemplates().then(() => {
      expect(awsDeploy.serverless.service.provider.compiledCloudFormationTemplate
        .Resources[normalizedName]
      ).to.deep.equal(
        {
          Type: 'AWS::Logs::LogGroup',
          Properties: {
            LogGroupName: awsDeploy.provider.naming.getLogGroupName(functionName),
          },
        }
      );

      const roleLogicalId = awsDeploy.provider.naming.getRoleLogicalId();
      expect(awsDeploy.serverless.service.provider.compiledCloudFormationTemplate
        .Resources[roleLogicalId]
      ).to.equal(undefined);
      delete awsDeploy.serverless.service.functions[functionName].role;
    });
  });

  it('should update IamPolicyLambdaExecution with a logging resource for the function', () => {
    awsDeploy.serverless.service.functions = {
      func0: {
        handler: 'func.function.handler',
        name: 'func0',
      },
      func1: {
        handler: 'func.function.handler',
        name: 'func1',
      },
    };
    const f = awsDeploy.serverless.service.functions;
    const normalizedNames = [
      awsDeploy.provider.naming.getLogGroupLogicalId(f.func0.name),
      awsDeploy.provider.naming.getLogGroupLogicalId(f.func1.name),
    ];
    return awsDeploy.mergeIamTemplates().then(() => {
      expect(awsDeploy.serverless.service.provider.compiledCloudFormationTemplate
        .Resources[normalizedNames[0]]
      ).to.deep.equal(
        {
          Type: 'AWS::Logs::LogGroup',
          Properties: {
            LogGroupName: awsDeploy.provider.naming.getLogGroupName(f.func0.name),
          },
        }
      );
      expect(awsDeploy.serverless.service.provider.compiledCloudFormationTemplate
        .Resources[normalizedNames[1]]
      ).to.deep.equal(
        {
          Type: 'AWS::Logs::LogGroup',
          Properties: {
            LogGroupName: awsDeploy.provider.naming.getLogGroupName(f.func1.name),
          },
        }
      );
    });
  });

  it('should update IamPolicyLambdaExecution with a logging resource for the function', () => {
    const normalizedName = awsDeploy.provider.naming.getLogGroupLogicalId(functionName);
    return awsDeploy.mergeIamTemplates().then(() => {
      expect(awsDeploy.serverless.service.provider.compiledCloudFormationTemplate
        .Resources[awsDeploy.provider.naming.getPolicyLogicalId()]
        .Properties
        .PolicyDocument
        .Statement[0]
        .Resource
      ).to.deep.equal([{ 'Fn::Join': [':', [{ 'Fn::GetAtt': [normalizedName, 'Arn'] }, '*']] }]);
    });
  });

  it('should update IamPolicyLambdaExecution with each function\'s logging resources', () => {
    awsDeploy.serverless.service.functions = {
      func0: {
        handler: 'func.function.handler',
        name: 'func0',
      },
      func1: {
        handler: 'func.function.handler',
        name: 'func1',
      },
    };
    const f = awsDeploy.serverless.service.functions; // avoid 100 char lines below
    const normalizedNames = [
      awsDeploy.provider.naming.getLogGroupLogicalId(f.func0.name),
      awsDeploy.provider.naming.getLogGroupLogicalId(f.func1.name),
    ];
    return awsDeploy.mergeIamTemplates().then(() => {
      expect(awsDeploy.serverless.service.provider.compiledCloudFormationTemplate
        .Resources[awsDeploy.provider.naming.getPolicyLogicalId()]
        .Properties
        .PolicyDocument
        .Statement[0]
        .Resource
      ).to.deep.equal(
        [
          { 'Fn::Join': [':', [{ 'Fn::GetAtt': [normalizedNames[0], 'Arn'] }, '*']] },
          { 'Fn::Join': [':', [{ 'Fn::GetAtt': [normalizedNames[1], 'Arn'] }, '*']] },
        ]
      );
    });
  });

  it('should not add the default role and policy if all functions have an ARN role', () => {
    awsDeploy.serverless.service.functions = {
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

    awsDeploy.mergeIamTemplates().then(() => {
      expect(awsDeploy.serverless.service.provider.compiledCloudFormationTemplate
        .Resources[awsDeploy.provider.naming.getPolicyLogicalId()]
      ).to.equal(undefined);
      expect(awsDeploy.serverless.service.provider.compiledCloudFormationTemplate
        .Resources[awsDeploy.provider.naming.getRoleLogicalId()]
      ).to.equal(undefined);
    });
  });

  it('should not add default role / policy if all functions have an ARN role', () => {
    awsDeploy.serverless.service.provider.role = 'some:aws:arn:xxx:*:*';
    awsDeploy.serverless.service.functions = {
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

    awsDeploy.mergeIamTemplates().then(() => {
      expect(awsDeploy.serverless.service.provider.compiledCloudFormationTemplate
        .Resources[awsDeploy.provider.naming.getPolicyLogicalId()]
      ).to.equal(undefined);
      expect(awsDeploy.serverless.service.provider.compiledCloudFormationTemplate
        .Resources[awsDeploy.provider.naming.getRoleLogicalId()]
      ).to.equal(undefined);
    });
  });

  it('should not add the IamPolicyLambdaExecution if role is defined on the provider level', () => {
    awsDeploy.serverless.service.provider.role = 'some:aws:arn:xxx:*:*';

    return awsDeploy.mergeIamTemplates()
      .then(() => expect(awsDeploy.serverless.service.provider.compiledCloudFormationTemplate
        .Resources[awsDeploy.provider.naming.getPolicyLogicalId()]
      ).to.not.exist);
  });


  it('should not add the IamRoleLambdaExecution if role is defined on the provider level', () => {
    awsDeploy.serverless.service.provider.role = 'some:aws:arn:xxx:*:*';

    return awsDeploy.mergeIamTemplates()
      .then(() => expect(awsDeploy.serverless.service.provider.compiledCloudFormationTemplate
        .Resources[awsDeploy.provider.naming.getRoleLogicalId()]
      ).to.not.exist);
  });
});
