'use strict';

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

  it('should not merge if there are no functions', () => {
    awsDeploy.serverless.service.functions = {};

    return awsDeploy.mergeIamTemplates()
      .then(() => {
        const resources = awsDeploy.serverless.service.provider
          .compiledCloudFormationTemplate.Resources;

        return expect(
          resources[awsDeploy.provider.naming.getRoleLogicalId()]
        ).to.not.exist;
      });
  });

  it('should merge the IamRoleLambdaExecution template into the CloudFormation template',
    () => awsDeploy.mergeIamTemplates()
      .then(() => {
        const qualifiedFunction = awsDeploy.serverless.service.getFunction(functionName).name;
        expect(awsDeploy.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[awsDeploy.provider.naming.getRoleLogicalId()]
        ).to.deep.equal({
          Type: 'AWS::IAM::Role',
          Properties: {
            AssumeRolePolicyDocument: {
              Version: '2012-10-17',
              Statement: [
                {
                  Effect: 'Allow',
                  Principal: {
                    Service: [
                      'lambda.amazonaws.com',
                    ],
                  },
                  Action: [
                    'sts:AssumeRole',
                  ],
                },
              ],
            },
            Path: '/',
            Policies: [
              {
                PolicyName: {
                  'Fn::Join': [
                    '-',
                    [
                      awsDeploy.options.stage,
                      awsDeploy.serverless.service.service,
                      'lambda',
                    ],
                  ],
                },
                PolicyDocument: {
                  Version: '2012-10-17',
                  Statement: [
                    {
                      Effect: 'Allow',
                      Action: [
                        'logs:CreateLogStream',
                      ],
                      Resource: [
                        {
                          'Fn::Sub': 'arn:aws:logs:${AWS::Region}:${AWS::AccountId}:'
                            + `log-group:/aws/lambda/${qualifiedFunction}:*`,
                        },
                      ],
                    },
                    {
                      Effect: 'Allow',
                      Action: [
                        'logs:PutLogEvents',
                      ],
                      Resource: [
                        {
                          'Fn::Sub': 'arn:aws:logs:${AWS::Region}:${AWS::AccountId}:'
                            + `log-group:/aws/lambda/${qualifiedFunction}:*:*`,
                        },
                      ],
                    },
                  ],
                },
              },
            ],
            RoleName: {
              'Fn::Join': [
                '-',
                [
                  awsDeploy.serverless.service.service,
                  awsDeploy.options.stage,
                  awsDeploy.options.region,
                  'lambdaRole',
                ],
              ],
            },
          },
        });
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
          .Resources[awsDeploy.provider.naming.getRoleLogicalId()]
          .Properties
          .Policies[0]
          .PolicyDocument
          .Statement[2]
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

  it('should update IamRoleLambdaExecution with a logging resource for the function', () => {
    const qualifiedFunction = awsDeploy.serverless.service.getFunction(functionName).name;
    return awsDeploy.mergeIamTemplates().then(() => {
      expect(awsDeploy.serverless.service.provider.compiledCloudFormationTemplate
        .Resources[awsDeploy.provider.naming.getRoleLogicalId()]
        .Properties
        .Policies[0]
        .PolicyDocument
        .Statement[0]
        .Resource
      ).to.deep.equal([
        {
          'Fn::Sub': 'arn:aws:logs:${AWS::Region}:${AWS::AccountId}:'
            + `log-group:/aws/lambda/${qualifiedFunction}:*`,
        },
      ]);
      expect(awsDeploy.serverless.service.provider.compiledCloudFormationTemplate
        .Resources[awsDeploy.provider.naming.getRoleLogicalId()]
        .Properties
        .Policies[0]
        .PolicyDocument
        .Statement[1]
        .Resource
      ).to.deep.equal([
        {
          'Fn::Sub': 'arn:aws:logs:${AWS::Region}:${AWS::AccountId}:'
            + `log-group:/aws/lambda/${qualifiedFunction}:*:*`,
        },
      ]);
    });
  });

  it('should update IamRoleLambdaExecution with each function\'s logging resources', () => {
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
    return awsDeploy.mergeIamTemplates().then(() => {
      expect(awsDeploy.serverless.service.provider.compiledCloudFormationTemplate
        .Resources[awsDeploy.provider.naming.getRoleLogicalId()]
        .Properties
        .Policies[0]
        .PolicyDocument
        .Statement[0]
        .Resource
      ).to.deep.equal(
        [
          { 'Fn::Sub': 'arn:aws:logs:${AWS::Region}:${AWS::AccountId}:'
              + 'log-group:/aws/lambda/func0:*' },
          { 'Fn::Sub': 'arn:aws:logs:${AWS::Region}:${AWS::AccountId}:'
              + 'log-group:/aws/lambda/func1:*' },
        ]
      );
      expect(awsDeploy.serverless.service.provider.compiledCloudFormationTemplate
        .Resources[awsDeploy.provider.naming.getRoleLogicalId()]
        .Properties
        .Policies[0]
        .PolicyDocument
        .Statement[1]
        .Resource
      ).to.deep.equal(
        [
          { 'Fn::Sub': 'arn:aws:logs:${AWS::Region}:${AWS::AccountId}:'
              + 'log-group:/aws/lambda/func0:*:*' },
          { 'Fn::Sub': 'arn:aws:logs:${AWS::Region}:${AWS::AccountId}:'
              + 'log-group:/aws/lambda/func1:*:*' },
        ]
      );
    });
  });

  it('should add default role if one of the functions has an ARN role', () => {
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

    return awsDeploy.mergeIamTemplates()
      .then(() => expect(awsDeploy.serverless.service.provider.compiledCloudFormationTemplate
        .Resources[awsDeploy.provider.naming.getRoleLogicalId()]
      ).to.exist
    );
  });

  it('should not add the default role if role is defined on a provider level', () => {
    awsDeploy.serverless.service.provider.role = 'some:aws:arn:xxx:*:*';
    awsDeploy.serverless.service.functions = {
      func0: {
        handler: 'func.function.handler',
        name: 'new-service-dev-func0',
      },
      func1: {
        handler: 'func.function.handler',
        name: 'new-service-dev-func1',
      },
    };

    return awsDeploy.mergeIamTemplates()
      .then(() => expect(awsDeploy.serverless.service.provider.compiledCloudFormationTemplate
        .Resources[awsDeploy.provider.naming.getRoleLogicalId()]
      ).to.not.exist);
  });

  it('should not add the default role if all functions have an ARN role', () => {
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

    return awsDeploy.mergeIamTemplates()
      .then(() => expect(awsDeploy.serverless.service.provider.compiledCloudFormationTemplate
        .Resources[awsDeploy.provider.naming.getRoleLogicalId()]
      ).to.not.exist
    );
  });

  describe('ManagedPolicyArns property', () => {
    it('should not be added by default', () => {
      awsDeploy.serverless.service.functions = {
        func0: {
          handler: 'func.function.handler',
          name: 'new-service-dev-func0',
        },
      };

      return awsDeploy.mergeIamTemplates()
        .then(() => expect(awsDeploy.serverless.service.provider.compiledCloudFormationTemplate
            .Resources[awsDeploy.provider.naming.getRoleLogicalId()].Properties.ManagedPolicyArns
          ).to.not.exist
        );
    });

    it('should be added if vpc config is defined on a provider level', () => {
      awsDeploy.serverless.service.provider.vpc = {
        securityGroupIds: ['xxx'],
        subnetIds: ['xxx'],
      };

      return awsDeploy.mergeIamTemplates()
        .then(() => {
          expect(awsDeploy.serverless.service.provider.compiledCloudFormationTemplate
            .Resources[awsDeploy.provider.naming.getRoleLogicalId()].Properties.ManagedPolicyArns
          ).to.deep.equal([
            'arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole',
          ]);
        });
    });

    it('should be added if vpc config is defined on function level', () => {
      awsDeploy.serverless.service.functions = {
        func0: {
          handler: 'func.function.handler',
          name: 'new-service-dev-func0',
        },
        func1: {
          handler: 'func.function.handler',
          name: 'new-service-dev-func1',
          vpc: {
            securityGroupIds: ['xxx'],
            subnetIds: ['xxx'],
          },
        },
      };

      return awsDeploy.mergeIamTemplates()
        .then(() => {
          expect(awsDeploy.serverless.service.provider.compiledCloudFormationTemplate
            .Resources[awsDeploy.provider.naming.getRoleLogicalId()].Properties.ManagedPolicyArns
          ).to.deep.equal([
            'arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole',
          ]);
        });
    });

    it('should not be added if vpc config is defined with role on function level', () => {
      awsDeploy.serverless.service.functions = {
        func1: {
          handler: 'func.function.handler',
          name: 'new-service-dev-func1',
          role: 'some:aws:arn:xx1:*:*',
          vpc: {
            securityGroupIds: ['xxx'],
            subnetIds: ['xxx'],
          },
        },
      };

      return awsDeploy.mergeIamTemplates()
        .then(() => expect(awsDeploy.serverless.service.provider.compiledCloudFormationTemplate
            .Resources[awsDeploy.provider.naming.getRoleLogicalId()]
          ).to.not.exist
        );
    });
  });
});
