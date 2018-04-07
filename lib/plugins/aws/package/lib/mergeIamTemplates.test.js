'use strict';

const expect = require('chai').expect;

const Serverless = require('../../../../Serverless');
const AwsProvider = require('../../provider/awsProvider');
const AwsPackage = require('../index');

describe('#mergeIamTemplates()', () => {
  let awsPackage;
  let serverless;
  const functionName = 'test';

  beforeEach(() => {
    serverless = new Serverless();
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    };
    serverless.setProvider('aws', new AwsProvider(serverless, options));
    awsPackage = new AwsPackage(serverless, options);
    awsPackage.serverless.cli = new serverless.classes.CLI();
    awsPackage.serverless.service.provider.compiledCloudFormationTemplate = {
      Resources: {},
    };
    awsPackage.serverless.service.service = 'new-service';
    awsPackage.serverless.service.functions = {
      [functionName]: {
        name: 'test',
        artifact: 'test.zip',
        handler: 'handler.hello',
      },
    };
  });

  it('should not merge if there are no functions', () => {
    awsPackage.serverless.service.functions = {};

    return awsPackage.mergeIamTemplates()
      .then(() => {
        const resources = awsPackage.serverless.service.provider
          .compiledCloudFormationTemplate.Resources;

        return expect(
          resources[awsPackage.provider.naming.getRoleLogicalId()]
        ).to.not.exist;
      });
  });

  it('should merge the IamRoleLambdaExecution template into the CloudFormation template',
    () => awsPackage.mergeIamTemplates()
      .then(() => {
        const qualifiedFunction = awsPackage.serverless.service.getFunction(functionName).name;
        expect(awsPackage.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[awsPackage.provider.naming.getRoleLogicalId()]
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
                      awsPackage.provider.getStage(),
                      awsPackage.serverless.service.service,
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
                          'Fn::Sub': 'arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}:'
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
                          'Fn::Sub': 'arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}:'
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
                  awsPackage.serverless.service.service,
                  awsPackage.provider.getStage(),
                  awsPackage.provider.getRegion(),
                  'lambdaRole',
                ],
              ],
            },
          },
        });
      })
  );

  it('should add custom IAM policy statements', () => {
    awsPackage.serverless.service.provider.iamRoleStatements = [
      {
        Effect: 'Allow',
        Action: [
          'something:SomethingElse',
        ],
        Resource: 'some:aws:arn:xxx:*:*',
      },
    ];

    return awsPackage.mergeIamTemplates()
      .then(() => {
        expect(awsPackage.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[awsPackage.provider.naming.getRoleLogicalId()]
          .Properties
          .Policies[0]
          .PolicyDocument
          .Statement[2]
        ).to.deep.equal(awsPackage.serverless.service.provider.iamRoleStatements[0]);
      });
  });

  it('should add managed policy arns', () => {
    awsPackage.serverless.service.provider.iamManagedPolicies = [
      'some:aws:arn:xxx:*:*',
      'someOther:aws:arn:xxx:*:*',
      { 'Fn::Join': [':', ['arn:aws:iam:', { Ref: 'AWSAccountId' }, 'some/path']] },
    ];
    return awsPackage.mergeIamTemplates()
      .then(() => {
        expect(awsPackage.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[awsPackage.provider.naming.getRoleLogicalId()]
          .Properties
          .ManagedPolicyArns
        ).to.deep.equal(awsPackage.serverless.service.provider.iamManagedPolicies);
      });
  });

  it('should merge managed policy arns when vpc config supplied', () => {
    awsPackage.serverless.service.provider.vpc = {
      securityGroupIds: ['xxx'],
      subnetIds: ['xxx'],
    };
    const iamManagedPolicies = [
      'some:aws:arn:xxx:*:*',
      'someOther:aws:arn:xxx:*:*',
      { 'Fn::Join': [':', ['arn:aws:iam:', { Ref: 'AWSAccountId' }, 'some/path']] },
    ];
    awsPackage.serverless.service.provider.iamManagedPolicies = iamManagedPolicies;
    const expectedManagedPolicyArns = [
      'some:aws:arn:xxx:*:*',
      'someOther:aws:arn:xxx:*:*',
      { 'Fn::Join': [':', ['arn:aws:iam:', { Ref: 'AWSAccountId' }, 'some/path']] },
      { 'Fn::Join': ['',
        [
          'arn:',
          { Ref: 'AWS::Partition' },
          ':iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole',
        ],
      ],
      },
    ];
    return awsPackage.mergeIamTemplates()
      .then(() => {
        expect(awsPackage.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[awsPackage.provider.naming.getRoleLogicalId()]
          .Properties
          .ManagedPolicyArns
        ).to.deep.equal(expectedManagedPolicyArns);
      });
  });

  it('should throw error if custom IAM policy statements is not an array', () => {
    awsPackage.serverless.service.provider.iamRoleStatements = {
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

    expect(() => awsPackage.mergeIamTemplates()).to.throw('not an array');
  });

  it('should throw error if a custom IAM policy statement does not have an Effect field', () => {
    awsPackage.serverless.service.provider.iamRoleStatements = [{
      Action: ['something:SomethingElse'],
      Resource: '*',
    }];

    expect(() => awsPackage.mergeIamTemplates()).to.throw(
      'missing the following properties: Effect');
  });

  it('should throw error if a custom IAM policy statement does not have an Action field', () => {
    awsPackage.serverless.service.provider.iamRoleStatements = [{
      Effect: 'Allow',
      Resource: '*',
    }];

    expect(() => awsPackage.mergeIamTemplates()).to.throw(
      'missing the following properties: Action');
  });

  it('should throw error if a custom IAM policy statement does not have a Resource field', () => {
    awsPackage.serverless.service.provider.iamRoleStatements = [{
      Action: ['something:SomethingElse'],
      Effect: 'Allow',
    }];

    expect(() => awsPackage.mergeIamTemplates()).to.throw(
      'missing the following properties: Resource');
  });

  it('should throw an error describing all problematics custom IAM policy statements', () => {
    awsPackage.serverless.service.provider.iamRoleStatements = [
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

    expect(() => awsPackage.mergeIamTemplates())
      .to.throw(/statement 0 is missing.*Resource; statement 2 is missing.*Effect, Action/);
  });

  it('should throw error if managed policies is not an array', () => {
    awsPackage.serverless.service.provider.iamManagedPolicies = 'a string';
    expect(() => awsPackage.mergeIamTemplates())
      .to.throw('iamManagedPolicies should be an array of arns');
  });

  it('should add a CloudWatch LogGroup resource', () => {
    const normalizedName = awsPackage.provider.naming.getLogGroupLogicalId(functionName);
    return awsPackage.mergeIamTemplates().then(() => {
      expect(awsPackage.serverless.service.provider.compiledCloudFormationTemplate
        .Resources[normalizedName]
      ).to.deep.equal(
        {
          Type: 'AWS::Logs::LogGroup',
          Properties: {
            LogGroupName: awsPackage.provider.naming.getLogGroupName(functionName),
          },
        }
        );
    });
  });

  it('should add RetentionInDays to a CloudWatch LogGroup resource if logRetentionInDays is given'
    , () => {
      awsPackage.serverless.service.provider.logRetentionInDays = 5;
      const normalizedName = awsPackage.provider.naming.getLogGroupLogicalId(functionName);
      return awsPackage.mergeIamTemplates().then(() => {
        expect(awsPackage.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[normalizedName]
        ).to.deep.equal(
          {
            Type: 'AWS::Logs::LogGroup',
            Properties: {
              LogGroupName: awsPackage.provider.naming.getLogGroupName(functionName),
              RetentionInDays: 5,
            },
          }
          );
      });
    });

  it('should throw error if RetentionInDays is 0 or not an integer'
    , () => {
      awsPackage.serverless.service.provider.logRetentionInDays = 0;
      expect(() => awsPackage.mergeIamTemplates()).to.throw('should be an integer');
      awsPackage.serverless.service.provider.logRetentionInDays = 'string';
      expect(() => awsPackage.mergeIamTemplates()).to.throw('should be an integer');
      awsPackage.serverless.service.provider.logRetentionInDays = [];
      expect(() => awsPackage.mergeIamTemplates()).to.throw('should be an integer');
      awsPackage.serverless.service.provider.logRetentionInDays = {};
      expect(() => awsPackage.mergeIamTemplates()).to.throw('should be an integer');
      awsPackage.serverless.service.provider.logRetentionInDays = undefined;
      expect(() => awsPackage.mergeIamTemplates()).to.throw('should be an integer');
      awsPackage.serverless.service.provider.logRetentionInDays = null;
      expect(() => awsPackage.mergeIamTemplates()).to.throw('should be an integer');
    });

  it('should add a CloudWatch LogGroup resource if all functions use custom roles', () => {
    awsPackage.serverless.service.functions[functionName].role = 'something';
    awsPackage.serverless.service.functions = {
      func0: {
        handler: 'func.function.handler',
        name: 'func0',
      },
      func1: {
        handler: 'func.function.handler',
        name: 'func1',
      },
    };
    const f = awsPackage.serverless.service.functions;
    const normalizedNames = [
      awsPackage.provider.naming.getLogGroupLogicalId(f.func0.name),
      awsPackage.provider.naming.getLogGroupLogicalId(f.func1.name),
    ];
    return awsPackage.mergeIamTemplates().then(() => {
      expect(awsPackage.serverless.service.provider.compiledCloudFormationTemplate
        .Resources[normalizedNames[0]]
      ).to.deep.equal(
        {
          Type: 'AWS::Logs::LogGroup',
          Properties: {
            LogGroupName: awsPackage.provider.naming.getLogGroupName(f.func0.name),
          },
        }
        );
      expect(awsPackage.serverless.service.provider.compiledCloudFormationTemplate
        .Resources[normalizedNames[1]]
      ).to.deep.equal(
        {
          Type: 'AWS::Logs::LogGroup',
          Properties: {
            LogGroupName: awsPackage.provider.naming.getLogGroupName(f.func1.name),
          },
        }
        );
    });
  });

  it('should update IamRoleLambdaExecution with a logging resource for the function', () => {
    const qualifiedFunction = awsPackage.serverless.service.getFunction(functionName).name;
    return awsPackage.mergeIamTemplates().then(() => {
      expect(awsPackage.serverless.service.provider.compiledCloudFormationTemplate
        .Resources[awsPackage.provider.naming.getRoleLogicalId()]
        .Properties
        .Policies[0]
        .PolicyDocument
        .Statement[0]
        .Resource
      ).to.deep.equal([
        {
          'Fn::Sub': 'arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}:'
            + `log-group:/aws/lambda/${qualifiedFunction}:*`,
        },
      ]);
      expect(awsPackage.serverless.service.provider.compiledCloudFormationTemplate
        .Resources[awsPackage.provider.naming.getRoleLogicalId()]
        .Properties
        .Policies[0]
        .PolicyDocument
        .Statement[1]
        .Resource
      ).to.deep.equal([
        {
          'Fn::Sub': 'arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}:'
            + `log-group:/aws/lambda/${qualifiedFunction}:*:*`,
        },
      ]);
    });
  });

  it('should update IamRoleLambdaExecution with each function\'s logging resources', () => {
    awsPackage.serverless.service.functions = {
      func0: {
        handler: 'func.function.handler',
        name: 'func0',
      },
      func1: {
        handler: 'func.function.handler',
        name: 'func1',
      },
    };
    return awsPackage.mergeIamTemplates().then(() => {
      expect(awsPackage.serverless.service.provider.compiledCloudFormationTemplate
        .Resources[awsPackage.provider.naming.getRoleLogicalId()]
        .Properties
        .Policies[0]
        .PolicyDocument
        .Statement[0]
        .Resource
      ).to.deep.equal(
        [
          {
            'Fn::Sub': 'arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}:'
              + 'log-group:/aws/lambda/func0:*',
          },
          {
            'Fn::Sub': 'arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}:'
              + 'log-group:/aws/lambda/func1:*',
          },
        ]
        );
      expect(awsPackage.serverless.service.provider.compiledCloudFormationTemplate
        .Resources[awsPackage.provider.naming.getRoleLogicalId()]
        .Properties
        .Policies[0]
        .PolicyDocument
        .Statement[1]
        .Resource
      ).to.deep.equal(
        [
          {
            'Fn::Sub': 'arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}:'
              + 'log-group:/aws/lambda/func0:*:*',
          },
          {
            'Fn::Sub': 'arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}:'
              + 'log-group:/aws/lambda/func1:*:*',
          },
        ]
        );
    });
  });

  it('should add default role if one of the functions has an ARN role', () => {
    awsPackage.serverless.service.functions = {
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

    return awsPackage.mergeIamTemplates()
      .then(() => expect(awsPackage.serverless.service.provider.compiledCloudFormationTemplate
        .Resources[awsPackage.provider.naming.getRoleLogicalId()]
      ).to.exist
      );
  });

  it('should not add the default role if role is defined on a provider level', () => {
    awsPackage.serverless.service.provider.role = 'some:aws:arn:xxx:*:*';
    awsPackage.serverless.service.functions = {
      func0: {
        handler: 'func.function.handler',
        name: 'new-service-dev-func0',
      },
      func1: {
        handler: 'func.function.handler',
        name: 'new-service-dev-func1',
      },
    };

    return awsPackage.mergeIamTemplates()
      .then(() => expect(awsPackage.serverless.service.provider.compiledCloudFormationTemplate
        .Resources[awsPackage.provider.naming.getRoleLogicalId()]
      ).to.not.exist);
  });

  it('should not add the default role if all functions have an ARN role', () => {
    awsPackage.serverless.service.functions = {
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

    return awsPackage.mergeIamTemplates()
      .then(() => expect(awsPackage.serverless.service.provider.compiledCloudFormationTemplate
        .Resources[awsPackage.provider.naming.getRoleLogicalId()]
      ).to.not.exist
      );
  });

  describe('ManagedPolicyArns property', () => {
    it('should not be added by default', () => {
      awsPackage.serverless.service.functions = {
        func0: {
          handler: 'func.function.handler',
          name: 'new-service-dev-func0',
        },
      };

      return awsPackage.mergeIamTemplates()
        .then(() => expect(awsPackage.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[awsPackage.provider.naming.getRoleLogicalId()].Properties.ManagedPolicyArns
        ).to.not.exist
        );
    });

    it('should be added if vpc config is defined on a provider level', () => {
      awsPackage.serverless.service.provider.vpc = {
        securityGroupIds: ['xxx'],
        subnetIds: ['xxx'],
      };

      return awsPackage.mergeIamTemplates()
        .then(() => {
          expect(awsPackage.serverless.service.provider.compiledCloudFormationTemplate
            .Resources[awsPackage.provider.naming.getRoleLogicalId()].Properties.ManagedPolicyArns
          ).to.deep.equal([{
            'Fn::Join': ['',
              [
                'arn:',
                { Ref: 'AWS::Partition' },
                ':iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole',
              ],
            ],
          }]);
        });
    });

    it('should be added if vpc config is defined on function level', () => {
      awsPackage.serverless.service.functions = {
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

      return awsPackage.mergeIamTemplates()
        .then(() => {
          expect(awsPackage.serverless.service.provider.compiledCloudFormationTemplate
            .Resources[awsPackage.provider.naming.getRoleLogicalId()].Properties.ManagedPolicyArns
          ).to.deep.equal([{
            'Fn::Join': ['',
              [
                'arn:',
                { Ref: 'AWS::Partition' },
                ':iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole',
              ],
            ],
          }]);
        });
    });

    it('should not be added if vpc config is defined with role on function level', () => {
      awsPackage.serverless.service.functions = {
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

      return awsPackage.mergeIamTemplates()
        .then(() => expect(awsPackage.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[awsPackage.provider.naming.getRoleLogicalId()]
        ).to.not.exist
        );
    });
  });
});
