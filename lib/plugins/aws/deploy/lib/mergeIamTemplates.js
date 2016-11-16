'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');
const path = require('path');

module.exports = {
  mergeIamTemplates() {
    if (!this.serverless.service.getAllFunctions().length) {
      return BbPromise.resolve();
    }

    let anyFunctionHasNoRole = false;
    if (!('role' in this.serverless.service.provider)) {
      this.serverless.service.getAllFunctions().forEach((functionName) => {
        const functionObject = this.serverless.service.getFunction(functionName);
        if (!('role' in functionObject)) {
          anyFunctionHasNoRole = true;
        }
      });
    }
    if (!anyFunctionHasNoRole) return BbPromise.resolve();

    if (typeof this.serverless.service.provider.role !== 'string') {
      // merge in the iamRoleLambdaTemplate
      const iamRoleLambdaExecutionTemplate = this.serverless.utils.readFileSync(
        path.join(this.serverless.config.serverlessPath,
          'plugins',
          'aws',
          'deploy',
          'lib',
          'iam-role-lambda-execution-template.json')
      );
      iamRoleLambdaExecutionTemplate.Properties.Path = this.provider.naming.getRolePath();
      iamRoleLambdaExecutionTemplate.Properties.RoleName = this.provider.naming.getRoleName();

      _.merge(
        this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
        {
          [this.provider.naming.getRoleLogicalId()]: iamRoleLambdaExecutionTemplate,
        }
      );

      // merge in the iamPolicyLambdaTemplate
      const iamPolicyLambdaExecutionTemplate = this.serverless.utils.readFileSync(
        path.join(this.serverless.config.serverlessPath,
          'plugins',
          'aws',
          'deploy',
          'lib',
          'iam-policy-lambda-execution-template.json')
      );

      // set the necessary variables for the IamPolicyLambda
      iamPolicyLambdaExecutionTemplate.Properties.PolicyName = this.provider.naming.getPolicyName();
      iamPolicyLambdaExecutionTemplate.Properties.Roles[0].Ref = this.provider.naming
        .getRoleLogicalId();

      _.merge(
        this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
        {
          [this.provider.naming.getPolicyLogicalId()]: iamPolicyLambdaExecutionTemplate,
        }
      );

      if (!this.serverless.service.provider.cfLogs) {
        this.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[this.provider.naming.getPolicyLogicalId()]
          .Properties
          .PolicyDocument
          .Statement[0]
          .Resource = `arn:aws:logs:${this.options.region}:*:*`;

        this.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[this.provider.naming.getPolicyLogicalId()]
          .Properties
          .PolicyDocument
          .Statement[1]
          .Resource = `arn:aws:logs:${this.options.region}:*:*`;

        const warningMessage = [
          'Deprecation Notice: Starting with the next update, ',
          'we will drop support for Lambda to implicitly create LogGroups. ',
          'Please remove your log groups and set "provider.cfLogs: true", ' +
          'for CloudFormation to explicitly create them for you.',
        ].join('');
        this.serverless.cli.log(warningMessage);
      } else {
        this.serverless.service.getAllFunctions().forEach((functionName) => {
          const functionObject = this.serverless.service.getFunction(functionName);
          const logGroupLogicalId = this.provider.naming
            .getLogGroupLogicalId(functionName);
          const newLogGroup = {
            [logGroupLogicalId]: {
              Type: 'AWS::Logs::LogGroup',
              Properties: {
                LogGroupName: this.provider.naming.getLogGroupName(functionObject.name),
              },
            },
          };
          _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
            newLogGroup);

          this.serverless.service.provider.compiledCloudFormationTemplate
            .Resources[this.provider.naming.getPolicyLogicalId()]
            .Properties
            .PolicyDocument
            .Statement[0]
            .Resource
            .push({ 'Fn::GetAtt': [`${logGroupLogicalId}`, 'Arn'] });

          this.serverless.service.provider.compiledCloudFormationTemplate
            .Resources[this.provider.naming.getPolicyLogicalId()]
            .Properties
            .PolicyDocument
            .Statement[1]
            .Resource
            .push({
              'Fn::Join': [
                ':',
                [
                  { 'Fn::GetAtt': [`${logGroupLogicalId}`, 'Arn'] },
                  '*',
                ],
              ],
            });
        });
      }

      // add custom iam role statements
      if (this.serverless.service.provider.iamRoleStatements &&
        this.serverless.service.provider.iamRoleStatements instanceof Array) {
        this.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[this.provider.naming.getPolicyLogicalId()]
          .Properties
          .PolicyDocument
          .Statement = this.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[this.provider.naming.getPolicyLogicalId()]
          .Properties
          .PolicyDocument
          .Statement.concat(this.serverless.service.provider.iamRoleStatements);
      }
    }

    return BbPromise.resolve();
  },

};
