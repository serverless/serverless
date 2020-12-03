'use strict';

const expect = require('chai').expect;
const runServerless = require('../../../../../test/utils/run-serverless');

describe('lib/plugins/aws/package/lib/mergeIamTemplates.test.js', () => {
  describe('No default role', () => {
    it('should not create role resource if there are no functions', async () => {
      const { cfTemplate, awsNaming } = await runServerless({
        fixture: 'aws',
        cliArgs: ['package'],
      });
      const iamRoleLambdaExecution = awsNaming.getRoleLogicalId();
      const resourceIam = cfTemplate.Resources[iamRoleLambdaExecution];
      expect(resourceIam).to.be.undefined;
      // Replaces
      // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/lib/mergeIamTemplates.test.js#L40-L49
    });

    it('should not create role resource with `provider.role`', async () => {
      const { cfTemplate, awsNaming } = await runServerless({
        fixture: 'function',
        cliArgs: ['package'],
        configExt: {
          provider: {
            name: 'aws',
            role: 'arn:aws:iam::YourAccountNumber:role/YourIamRole',
          },
        },
      });

      const IamRoleLambdaExecution = awsNaming.getRoleLogicalId();
      const resourceIam = cfTemplate.Resources[IamRoleLambdaExecution];
      expect(resourceIam).to.be.undefined;

      // Replaces
      // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/lib/mergeIamTemplates.test.js#L613-L636
    });

    it('should not create role resource with all functions having `functions[].role`', async () => {
      await runServerless({ fixture: 'function' });
      const { cfTemplate, awsNaming } = await runServerless({
        fixture: 'function',
        cliArgs: ['package'],
        configExt: {
          service: 'another-service',
          functions: {
            foo: {
              handler: 'index.handler',
              role: 'some:aws:arn:xx1:*:*',
            },
            other: {
              handler: 'index.handler',
              role: 'some:aws:arn:xx1:*:*',
            },
          },
        },
      });

      const IamRoleLambdaExecution = awsNaming.getRoleLogicalId();
      const resourceIam = cfTemplate.Resources[IamRoleLambdaExecution];
      expect(resourceIam).to.be.undefined;
      // Replaces
      // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/lib/mergeIamTemplates.test.js#L638-L662
      // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/lib/mergeIamTemplates.test.js#L747-L771
    });
  });

  describe('Default role', () => {
    describe('Defaults', () => {
      let naming;
      let cfResources;

      before(async () => {
        await runServerless({
          fixture: 'function',
          cliArgs: ['package'],
          configExt: {
            service: 'another-service',
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
            // Configure one of the functions with custom "role", that will replace:
            // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/lib/mergeIamTemplates.test.js#L587-L611
          },
        }).then(({ cfTemplate, awsNaming }) => {
          cfResources = cfTemplate.Resources;
          naming = awsNaming;
        });
      });

      it('should not configure ManagedPolicyArns by default', () => {
        // Replaces
        const IamRoleLambdaExecution = naming.getRoleLogicalId();
        const { Properties } = cfResources[IamRoleLambdaExecution];
        expect(Properties.ManagedPolicyArns).to.be.undefined;
        // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/lib/mergeIamTemplates.test.js#L665-L683
      });

      it('should add logGroup access policies if there are functions', () => {
        // Replaces
        const IamRoleLambdaExecution = naming.getRoleLogicalId();
        const { Properties } = cfResources[IamRoleLambdaExecution];

        const createLogStatement = Properties.Policies[0].PolicyDocument.Statement[0];
        expect(createLogStatement.Effect).to.be.equal('Allow');
        expect(createLogStatement.Action).to.be.deep.equal([
          'logs:CreateLogStream',
          'logs:CreateLogGroup',
        ]);
        expect(createLogStatement.Resource).to.deep.includes({
          'Fn::Sub':
            'arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}:log-group:/aws/lambda/another-service-dev*:*',
        });

        const putLogStatement = Properties.Policies[0].PolicyDocument.Statement[1];
        expect(putLogStatement.Effect).to.be.equal('Allow');
        expect(putLogStatement.Action).to.be.deep.equal(['logs:PutLogEvents']);
        expect(putLogStatement.Resource).to.deep.includes({
          'Fn::Sub':
            'arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}:log-group:/aws/lambda/another-service-dev*:*:*',
        });
        // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/lib/mergeIamTemplates.test.js#L51-L129
        // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/lib/mergeIamTemplates.test.js#L218-L305
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
          'Fn::Sub':
            'arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}:log-group:/aws/lambda/myCustomName:*',
        });

        const putLogStatement = Properties.Policies[0].PolicyDocument.Statement[1];
        expect(putLogStatement.Effect).to.be.equal('Allow');
        expect(putLogStatement.Action).to.be.deep.equal(['logs:PutLogEvents']);
        expect(putLogStatement.Resource).to.deep.includes({
          'Fn::Sub':
            'arn:${AWS::Partition}:logs:${AWS::Region}:${AWS::AccountId}:log-group:/aws/lambda/myCustomName:*:*',
        });

        // Replaces
        // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/lib/mergeIamTemplates.test.js#L131-L216
        // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/lib/mergeIamTemplates.test.js#L307-L410
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
          '/aws/lambda/another-service-dev-myFunction'
        );
        // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/lib/mergeIamTemplates.test.js#L546-L585
      });
    });

    describe('Provider properties', () => {
      let cfResources;
      let naming;

      before(async () => {
        await runServerless({
          fixture: 'function',
          cliArgs: ['package'],
          configExt: {
            service: 'my-service',
            provider: {
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
        }).then(({ cfTemplate, awsNaming }) => {
          cfResources = cfTemplate.Resources;
          naming = awsNaming;
        });
      });

      it('should support `provider.iamRoleStatements`', async () => {
        const {
          cfTemplate: { Resources },
          awsNaming,
        } = await runServerless({
          fixture: 'function',
          cliArgs: ['package'],
          configExt: {
            provider: {
              iamRoleStatements: [
                {
                  Effect: 'Allow',
                  Resource: '*',
                  NotAction: 'iam:DeleteUser',
                },
              ],
            },
          },
        });

        const IamRoleLambdaExecution = awsNaming.getRoleLogicalId();
        const iamResource = Resources[IamRoleLambdaExecution];

        const statments = iamResource.Properties.Policies[0].PolicyDocument.Statement;

        expect(statments).to.deep.includes({
          Effect: 'Allow',
          Resource: '*',
          NotAction: ['iam:DeleteUser'],
        });
        // Replaces
        // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/lib/mergeIamTemplates.test.js#L457-L490
        // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/lib/mergeIamTemplates.test.js#L685-L709
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
        // Replaces
        // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/lib/mergeIamTemplates.test.js#L430-L443
      });

      it('should support `provider.rolePermissionsBoundary`', () => {
        const IamRoleLambdaExecution = naming.getRoleLogicalId();
        const {
          Properties: { PermissionsBoundary },
        } = cfResources[IamRoleLambdaExecution];
        expect(PermissionsBoundary).to.be.equal(
          'arn:aws:iam::123456789012:policy/XCompanyBoundaries'
        );
        // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/lib/mergeIamTemplates.test.js#L445-L455
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
        // Replaces
        // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/lib/mergeIamTemplates.test.js#L457-L490
        // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/lib/mergeIamTemplates.test.js#L685-L709
      });

      it('should support `provider.logRetentionInDays`', () => {
        const normalizedName = naming.getLogGroupLogicalId('foo');
        const iamResource = cfResources[normalizedName];
        expect(iamResource.Type).to.be.equal('AWS::Logs::LogGroup');
        expect(iamResource.Properties.RetentionInDays).to.be.equal(5);
        expect(iamResource.Properties.LogGroupName).to.be.equal('/aws/lambda/my-service-dev-foo');
        // Replaces
        // https://github.com/serverless/serverless/blob/d8527d8b57e7e5f0b94ba704d9f53adb34298d99/lib/plugins/aws/package/lib/mergeIamTemplates.test.js#L528-L544
      });
    });

    describe('Function properties', () => {
      let cfResources;
      let naming;
      let serverless;
      before(async () => {
        const { awsNaming, cfTemplate, serverless: serverlessInstance } = await runServerless({
          fixture: 'function',
          cliArgs: ['package'],
          configExt: {
            functions: {
              fnDisableLogs: {
                handler: 'index.handler',
                disableLogs: true,
              },
              functionWithVpc: {
                handler: 'func.function.handler',
                name: 'new-service-dev-func1',
                vpc: {
                  securityGroupIds: ['xxx'],
                  subnetIds: ['xxx'],
                },
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
    });
  });
});
