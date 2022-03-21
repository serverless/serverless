'use strict';

const chai = require('chai');
const runServerless = require('../../../../../../utils/run-serverless');

chai.use(require('chai-as-promised'));

const expect = chai.expect;

describe('lib/plugins/aws/package/lib/mergeIamTemplates.test.js', () => {
  describe('No default role', () => {
    it('should not create role resource if there are no functions', async () => {
      const { cfTemplate, awsNaming } = await runServerless({
        fixture: 'aws',
        command: 'package',
      });
      const iamRoleLambdaExecution = awsNaming.getRoleLogicalId();
      expect(cfTemplate.Resources).to.not.have.property(iamRoleLambdaExecution);
    });

    it('should not create role resource with deprecated `provider.role`', async () => {
      const { cfTemplate, awsNaming } = await runServerless({
        fixture: 'function',
        command: 'package',
        configExt: {
          disabledDeprecations: ['PROVIDER_IAM_SETTINGS_V3'],
          provider: {
            name: 'aws',
            role: 'arn:aws:iam::YourAccountNumber:role/YourIamRole',
          },
        },
      });

      const IamRoleLambdaExecution = awsNaming.getRoleLogicalId();
      expect(cfTemplate.Resources).to.not.have.property(IamRoleLambdaExecution);
    });

    it('should not create role resource with `provider.iam.role`', async () => {
      const { cfTemplate, awsNaming } = await runServerless({
        fixture: 'function',
        command: 'package',
        configExt: {
          provider: {
            name: 'aws',
            iam: {
              role: 'arn:aws:iam::YourAccountNumber:role/YourIamRole',
            },
          },
        },
      });

      const IamRoleLambdaExecution = awsNaming.getRoleLogicalId();
      expect(cfTemplate.Resources).to.not.have.property(IamRoleLambdaExecution);
    });

    it('should not create role resource with all functions having `functions[].role`', async () => {
      const { cfTemplate, awsNaming } = await runServerless({
        fixture: 'function',
        command: 'package',
        configExt: {
          functions: {
            basic: {
              role: 'some:aws:arn:xx1:*:*',
            },
            other: {
              role: 'some:aws:arn:xx1:*:*',
            },
          },
        },
      });

      const IamRoleLambdaExecution = awsNaming.getRoleLogicalId();
      expect(cfTemplate.Resources).to.not.have.property(IamRoleLambdaExecution);
    });
  });

  describe('Default role', () => {
    describe('Defaults', () => {
      let naming;
      let cfResources;
      let service;
      const arnLogPrefix = 'arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}';

      before(async () => {
        const test = await runServerless({
          fixture: 'function',
          command: 'package',
          configExt: {
            functions: {
              myFunction: {
                handler: 'index.handler',
              },
              myFunctionWithRole: {
                name: 'myCustomName',
                handler: 'index.handler',
                role: 'myCustRole0',
              },
            },
          },
        });
        const { cfTemplate, awsNaming, fixtureData } = test;
        cfResources = cfTemplate.Resources;
        naming = awsNaming;
        service = fixtureData.serviceConfig.service;
      });

      it('should not configure ManagedPolicyArns by default', () => {
        const IamRoleLambdaExecution = naming.getRoleLogicalId();
        const { Properties } = cfResources[IamRoleLambdaExecution];
        expect(Properties).to.not.have.property('ManagedPolicyArns');
      });

      it('should add logGroup access policies if there are functions', () => {
        const IamRoleLambdaExecution = naming.getRoleLogicalId();
        const { Properties } = cfResources[IamRoleLambdaExecution];

        const createLogStatement = Properties.Policies[0].PolicyDocument.Statement[0];
        expect(createLogStatement.Effect).to.be.equal('Allow');
        expect(createLogStatement.Action).to.be.deep.equal([
          'logs:CreateLogStream',
          'logs:CreateLogGroup',
        ]);
        expect(createLogStatement.Resource).to.deep.includes({
          'Fn::Sub': `${arnLogPrefix}:log-group:/aws/lambda/${service}-dev*:*`,
        });

        const putLogStatement = Properties.Policies[0].PolicyDocument.Statement[1];
        expect(putLogStatement.Effect).to.be.equal('Allow');
        expect(putLogStatement.Action).to.be.deep.equal(['logs:PutLogEvents']);
        expect(putLogStatement.Resource).to.deep.includes({
          'Fn::Sub': `${arnLogPrefix}:log-group:/aws/lambda/${service}-dev*:*:*`,
        });
      });

      it('should add logGroup access policies for custom named functions', () => {
        const IamRoleLambdaExecution = naming.getRoleLogicalId();
        const { Properties } = cfResources[IamRoleLambdaExecution];

        const createLogStatement = Properties.Policies[0].PolicyDocument.Statement[0];
        expect(createLogStatement.Effect).to.be.equal('Allow');
        expect(createLogStatement.Action).to.be.deep.equal([
          'logs:CreateLogStream',
          'logs:CreateLogGroup',
        ]);
        expect(createLogStatement.Resource).to.deep.includes({
          'Fn::Sub': `${arnLogPrefix}:log-group:/aws/lambda/myCustomName:*`,
        });

        const putLogStatement = Properties.Policies[0].PolicyDocument.Statement[1];
        expect(putLogStatement.Effect).to.be.equal('Allow');
        expect(putLogStatement.Action).to.be.deep.equal(['logs:PutLogEvents']);
        expect(putLogStatement.Resource).to.deep.includes({
          'Fn::Sub': `${arnLogPrefix}:log-group:/aws/lambda/myCustomName:*:*`,
        });
      });

      it('should configure LogGroup resources for functions', () => {
        const myFunctionWithRole = naming.getLogGroupLogicalId('myFunctionWithRole');
        const myCustomName = cfResources[myFunctionWithRole];

        expect(myCustomName.Type).to.be.equal('AWS::Logs::LogGroup');
        expect(myCustomName.Properties.LogGroupName).to.be.equal('/aws/lambda/myCustomName');

        const myFunctionName = naming.getLogGroupLogicalId('myFunction');
        const myFunctionResource = cfResources[myFunctionName];

        expect(myFunctionResource.Type).to.be.equal('AWS::Logs::LogGroup');
        expect(myFunctionResource.Properties.LogGroupName).to.be.equal(
          `/aws/lambda/${service}-dev-myFunction`
        );
      });
    });

    describe('Provider properties - deprecated properties', () => {
      let cfResources;
      let naming;

      before(async () => {
        const { cfTemplate, awsNaming } = await runServerless({
          fixture: 'function',
          command: 'package',
          configExt: {
            disabledDeprecations: ['PROVIDER_IAM_SETTINGS_V3'],
            provider: {
              iamRoleStatements: [
                {
                  Effect: 'Allow',
                  Resource: '*',
                  NotAction: 'iam:DeleteUser',
                },
              ],
              vpc: {
                securityGroupIds: ['xxx'],
                subnetIds: ['xxx'],
              },
              logRetentionInDays: 5,
              iamManagedPolicies: [
                'arn:aws:iam::123456789012:user/*',
                'arn:aws:s3:::my_corporate_bucket/Development/*',
                'arn:aws:iam::123456789012:u*',
              ],
              rolePermissionsBoundary: ['arn:aws:iam::123456789012:policy/XCompanyBoundaries'],
            },
          },
        });

        cfResources = cfTemplate.Resources;
        naming = awsNaming;
      });

      it('should support `provider.iamRoleStatements`', async () => {
        const IamRoleLambdaExecution = naming.getRoleLogicalId();
        const iamResource = cfResources[IamRoleLambdaExecution];
        const { Statement } = iamResource.Properties.Policies[0].PolicyDocument;

        expect(Statement).to.deep.includes({
          Effect: 'Allow',
          Resource: '*',
          NotAction: ['iam:DeleteUser'],
        });
      });
      it('should support `provider.iamManagedPolicies`', () => {
        const IamRoleLambdaExecution = naming.getRoleLogicalId();
        const {
          Properties: { ManagedPolicyArns },
        } = cfResources[IamRoleLambdaExecution];

        expect(ManagedPolicyArns).to.deep.includes('arn:aws:iam::123456789012:user/*');
        expect(ManagedPolicyArns).to.deep.includes(
          'arn:aws:s3:::my_corporate_bucket/Development/*'
        );
        expect(ManagedPolicyArns).to.deep.includes('arn:aws:iam::123456789012:u*');
      });

      it('should support `provider.rolePermissionsBoundary`', () => {
        const IamRoleLambdaExecution = naming.getRoleLogicalId();
        const {
          Properties: { PermissionsBoundary },
        } = cfResources[IamRoleLambdaExecution];
        expect(PermissionsBoundary).to.be.equal(
          'arn:aws:iam::123456789012:policy/XCompanyBoundaries'
        );
      });

      it('should support `provider.iam.role.permissionBoundary`', async () => {
        const { cfTemplate, awsNaming } = await runServerless({
          fixture: 'function',
          command: 'package',
          configExt: {
            disabledDeprecations: ['PROVIDER_IAM_SETTINGS_V3'],
            provider: {
              iam: {
                role: {
                  permissionBoundary: ['arn:aws:iam::123456789012:policy/XCompanyBoundaries'],
                },
              },
            },
          },
        });

        const IamRoleLambdaExecution = awsNaming.getRoleLogicalId();
        const {
          Properties: { PermissionsBoundary },
        } = cfTemplate.Resources[IamRoleLambdaExecution];
        expect(PermissionsBoundary).to.be.equal(
          'arn:aws:iam::123456789012:policy/XCompanyBoundaries'
        );
      });
    });

    describe('Provider properties', () => {
      let cfResources;
      let naming;
      let service;

      before(async () => {
        const { cfTemplate, awsNaming, fixtureData } = await runServerless({
          fixture: 'function',
          command: 'package',
          configExt: {
            provider: {
              iam: {
                role: {
                  name: 'custom-default-role',
                  path: '/custom-role-path/',
                  statements: [
                    {
                      Effect: 'Allow',
                      Resource: '*',
                      NotAction: 'iam:DeleteUser',
                    },
                  ],
                  managedPolicies: [
                    'arn:aws:iam::123456789012:user/*',
                    'arn:aws:s3:::my_corporate_bucket/Development/*',
                    'arn:aws:iam::123456789012:u*',
                  ],
                  permissionsBoundary: ['arn:aws:iam::123456789012:policy/XCompanyBoundaries'],
                  tags: {
                    sweet: 'potato',
                  },
                },
              },
              vpc: {
                securityGroupIds: ['xxx'],
                subnetIds: ['xxx'],
              },
              logRetentionInDays: 5,
            },
          },
        });

        cfResources = cfTemplate.Resources;
        naming = awsNaming;
        service = fixtureData.serviceConfig.service;
      });

      it('should support `provider.iam.role.name`', async () => {
        const iamRoleLambdaResource = cfResources[naming.getRoleLogicalId()];
        expect(iamRoleLambdaResource.Properties.RoleName).to.be.eq('custom-default-role');
      });

      it('should support `provider.iam.role.path`', async () => {
        const iamRoleLambdaResource = cfResources[naming.getRoleLogicalId()];
        expect(iamRoleLambdaResource.Properties.Path).to.be.eq('/custom-role-path/');
      });

      it('should reject an invalid `provider.iam.role.path`', async () => {
        const customRolePath = '/invalid';
        await expect(
          runServerless({
            fixture: 'function',
            command: 'package',
            configExt: {
              provider: {
                iam: {
                  role: {
                    path: customRolePath,
                  },
                },
              },
            },
          })
        ).to.be.eventually.rejectedWith(/'provider.iam.role.path': must match pattern/);
      });

      it('should support `provider.iam.role.statements`', async () => {
        const IamRoleLambdaExecution = naming.getRoleLogicalId();
        const iamResource = cfResources[IamRoleLambdaExecution];
        const { Statement } = iamResource.Properties.Policies[0].PolicyDocument;

        expect(Statement).to.deep.includes({
          Effect: 'Allow',
          Resource: '*',
          NotAction: ['iam:DeleteUser'],
        });
      });

      it('should support `provider.iam.role.managedPolicies`', () => {
        const IamRoleLambdaExecution = naming.getRoleLogicalId();
        const {
          Properties: { ManagedPolicyArns },
        } = cfResources[IamRoleLambdaExecution];

        expect(ManagedPolicyArns).to.deep.includes('arn:aws:iam::123456789012:user/*');
        expect(ManagedPolicyArns).to.deep.includes(
          'arn:aws:s3:::my_corporate_bucket/Development/*'
        );
        expect(ManagedPolicyArns).to.deep.includes('arn:aws:iam::123456789012:u*');
      });

      it('should support `provider.iam.role.permissionsBoundary`', () => {
        const IamRoleLambdaExecution = naming.getRoleLogicalId();
        const {
          Properties: { PermissionsBoundary },
        } = cfResources[IamRoleLambdaExecution];
        expect(PermissionsBoundary).to.be.equal(
          'arn:aws:iam::123456789012:policy/XCompanyBoundaries'
        );
      });

      it('should support `provider.iam.role.permissionsBoundary` defined with CF intrinsic functions', async () => {
        const { cfTemplate, awsNaming } = await runServerless({
          fixture: 'function',
          command: 'package',
          configExt: {
            provider: {
              iam: {
                role: {
                  permissionsBoundary: {
                    'Fn::Sub': 'arn:aws:iam::${AWS::AccountId}:policy/XCompanyBoundaries',
                  },
                },
              },
            },
          },
        });

        const IamRoleLambdaExecution = awsNaming.getRoleLogicalId();
        const {
          Properties: { PermissionsBoundary },
        } = cfTemplate.Resources[IamRoleLambdaExecution];
        expect(PermissionsBoundary).to.deep.includes({
          'Fn::Sub': 'arn:aws:iam::${AWS::AccountId}:policy/XCompanyBoundaries',
        });
      });

      it('should ensure needed IAM configuration when `provider.vpc` is configured', () => {
        const IamRoleLambdaExecution = naming.getRoleLogicalId();
        const iamResource = cfResources[IamRoleLambdaExecution];

        expect(iamResource.Properties.ManagedPolicyArns).to.deep.includes({
          'Fn::Join': [
            '',
            [
              'arn:',
              { Ref: 'AWS::Partition' },
              ':iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole',
            ],
          ],
        });
      });

      it('should support `provider.logRetentionInDays`', () => {
        const normalizedName = naming.getLogGroupLogicalId('basic');
        const iamResource = cfResources[normalizedName];
        expect(iamResource.Type).to.be.equal('AWS::Logs::LogGroup');
        expect(iamResource.Properties.RetentionInDays).to.be.equal(5);
        expect(iamResource.Properties.LogGroupName).to.be.equal(`/aws/lambda/${service}-dev-basic`);
      });

      it('should support `provider.iam.role.tags`', () => {
        const IamRoleLambdaExecution = naming.getRoleLogicalId();
        const iamResource = cfResources[IamRoleLambdaExecution];
        expect(iamResource.Properties.Tags).to.eql([{ Key: 'sweet', Value: 'potato' }]);
      });

      it('should not create default role when `provider.iam.role` defined with CF intrinsic functions', async () => {
        const { cfTemplate, awsNaming } = await runServerless({
          fixture: 'function',
          command: 'package',
          configExt: {
            provider: {
              iam: {
                role: {
                  'Fn::Sub': 'arn:aws:iam::${AWS::AccountId}:role/someRole',
                },
              },
            },
          },
        });

        expect(cfTemplate.Resources[awsNaming.getRoleLogicalId()]).to.be.undefined;
      });
    });

    describe('Function properties', () => {
      let cfResources;
      let naming;
      let serverless;
      const customFunctionName = 'foo-bar';
      before(async () => {
        const {
          awsNaming,
          cfTemplate,
          serverless: serverlessInstance,
        } = await runServerless({
          fixture: 'function',
          command: 'package',
          configExt: {
            functions: {
              fnDisableLogs: {
                handler: 'index.handler',
                disableLogs: true,
              },
              fnLogRetentionInDays: {
                handler: 'index.handler',
                logRetentionInDays: 5,
              },
              fnWithVpc: {
                handler: 'index.handler',
                vpc: {
                  securityGroupIds: ['xxx'],
                  subnetIds: ['xxx'],
                },
              },
              fnHaveCustomName: {
                name: customFunctionName,
                handler: 'index.handler',
                disableLogs: true,
              },
            },
          },
        });
        cfResources = cfTemplate.Resources;
        naming = awsNaming;
        serverless = serverlessInstance;
      });

      it('should ensure needed IAM configuration when `functions[].vpc` is configured', () => {
        const IamRoleLambdaExecution = naming.getRoleLogicalId();
        const { Properties } = cfResources[IamRoleLambdaExecution];
        expect(Properties.ManagedPolicyArns).to.deep.includes({
          'Fn::Join': [
            '',
            [
              'arn:',
              { Ref: 'AWS::Partition' },
              ':iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole',
            ],
          ],
        });
      });

      it('should support `functions[].disableLogs`', async () => {
        const functionName = serverless.service.getFunction('fnDisableLogs').name;
        const functionLogGroupName = naming.getLogGroupName(functionName);

        expect(cfResources).to.not.have.property(functionLogGroupName);
      });

      it('should support `functions[].logRetentionInDays`', async () => {
        const functionName = serverless.service.getFunction('fnLogRetentionInDays').name;
        const normalizedName = naming.getLogGroupLogicalId('fnLogRetentionInDays');
        const logResource = cfResources[normalizedName];

        expect(logResource.Type).to.be.equal('AWS::Logs::LogGroup');
        expect(logResource.Properties.RetentionInDays).to.be.equal(5);
        expect(logResource.Properties.LogGroupName).to.be.equal(
          naming.getLogGroupName(functionName)
        );
      });

      it('should not have allow rights to put logs for custom named function when disableLogs option is enabled', async () => {
        expect(
          cfResources[naming.getRoleLogicalId()].Properties.Policies[0].PolicyDocument.Statement[0]
            .Resource
        ).to.not.deep.include({
          'Fn::Sub':
            'arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}:' +
            `log-group:/aws/lambda/${customFunctionName}:*`,
        });
        expect(
          cfResources[naming.getRoleLogicalId()].Properties.Policies[0].PolicyDocument.Statement[1]
            .Resource
        ).to.not.deep.include({
          'Fn::Sub':
            'arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}:' +
            `log-group:/aws/lambda/${customFunctionName}:*`,
        });
      });

      it('should have deny policy when disableLogs option is enabled`', async () => {
        const functionName = serverless.service.getFunction('fnDisableLogs').name;
        const functionLogGroupName = naming.getLogGroupName(functionName);

        expect(
          cfResources[naming.getRoleLogicalId()].Properties.Policies[0].PolicyDocument.Statement
        ).to.deep.include({
          Effect: 'Deny',
          Action: 'logs:PutLogEvents',
          Resource: [
            {
              'Fn::Sub':
                'arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}' +
                `:log-group:${functionLogGroupName}:*`,
            },
          ],
        });
      });
    });
  });
});
