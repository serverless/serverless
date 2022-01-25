'use strict';

const _ = require('lodash');
const path = require('path');

module.exports = {
  mergeIamTemplates() {
    // resolve early if no functions are provided
    if (!this.serverless.service.getAllFunctions().length) {
      return;
    }

    // create log group resources
    this.serverless.service
      .getAllFunctions()
      .filter((functionName) => !this.serverless.service.getFunction(functionName).disableLogs)
      .forEach((functionName) => {
        const functionObject = this.serverless.service.getFunction(functionName);
        const logGroupLogicalId = this.provider.naming.getLogGroupLogicalId(functionName);
        const newLogGroup = {
          [logGroupLogicalId]: {
            Type: 'AWS::Logs::LogGroup',
            Properties: {
              LogGroupName: this.provider.naming.getLogGroupName(functionObject.name),
            },
          },
        };

        const logRetentionInDays = this.provider.getLogRetentionInDays();
        if (logRetentionInDays) {
          newLogGroup[logGroupLogicalId].Properties.RetentionInDays = logRetentionInDays;
        }

        Object.assign(
          this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
          newLogGroup
        );
      });

    this.serverless.service.getAllFunctions().forEach((functionName) => {
      const functionObject = this.serverless.service.getFunction(functionName);
      functionObject.iamConfig = this.provider.createIamConfig();
    });

    const iamRole = _.get(this.serverless.service.provider.iam, 'role', {});

    // resolve early if provider level role is provided as a reference to existing role
    if (this.provider.isExistingRoleProvided(iamRole)) {
      return;
    }

    if ('role' in this.serverless.service.provider) {
      return;
    }

    // resolve early if all functions contain a custom role
    const customRoleProvided = this.serverless.service.getAllFunctions().every((functionName) => {
      const functionObject = this.serverless.service.getFunction(functionName);
      return 'role' in functionObject;
    });

    if (customRoleProvided) {
      return;
    }

    // merge in the iamRoleLambdaTemplate
    const iamRoleLambdaExecutionTemplate = this.serverless.utils.readFileSync(
      path.join(
        this.serverless.config.serverlessPath,
        'plugins',
        'aws',
        'package',
        'lib',
        'iam-role-lambda-execution-template.json'
      )
    );
    iamRoleLambdaExecutionTemplate.Properties.Path = this.provider.naming.getRolePath();
    iamRoleLambdaExecutionTemplate.Properties.RoleName = this.provider.naming.getRoleName();

    // set role tags
    if (iamRole.tags) {
      iamRoleLambdaExecutionTemplate.Properties.Tags = Object.keys(iamRole.tags).map((key) => ({
        Key: key,
        Value: iamRole.tags[key],
      }));
    }

    // set permission boundary
    if (iamRole.permissionsBoundary) {
      iamRoleLambdaExecutionTemplate.Properties.PermissionsBoundary = iamRole.permissionsBoundary;
    } else if (iamRole.permissionBoundary) {
      iamRoleLambdaExecutionTemplate.Properties.PermissionsBoundary = iamRole.permissionBoundary;
    } else if (this.serverless.service.provider.rolePermissionsBoundary) {
      iamRoleLambdaExecutionTemplate.Properties.PermissionsBoundary =
        this.serverless.service.provider.rolePermissionsBoundary;
    }

    iamRoleLambdaExecutionTemplate.Properties.Policies[0].PolicyName =
      this.provider.naming.getPolicyName();

    _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
      [this.provider.naming.getRoleLogicalId()]: iamRoleLambdaExecutionTemplate,
    });

    // add custom iam role statements
    if (iamRole.statements) {
      this.provider.iamConfig.policyStatements.push(...iamRole.statements);
    } else if (this.serverless.service.provider.iamRoleStatements) {
      this.provider.iamConfig.policyStatements.push(
        ...this.serverless.service.provider.iamRoleStatements
      );
    }

    // add iam managed policies
    if (iamRole.managedPolicies) {
      this.provider.iamConfig.managedPolicies.push(...iamRole.managedPolicies);
    } else if (this.serverless.service.provider.iamManagedPolicies) {
      this.provider.iamConfig.managedPolicies.push(
        ...this.serverless.service.provider.iamManagedPolicies
      );
    }

    if (this.serverless.service.provider.vpc) {
      // add managed iam policy to allow ENI management
      this.provider.iamConfig.managedPolicies.push({
        'Fn::Join': [
          '',
          [
            'arn:',
            { Ref: 'AWS::Partition' },
            ':iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole',
          ],
        ],
      });
    }

    return;
  },
};
