'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');
const path = require('path');

module.exports = {
  mergeIamTemplates() {
    this.validateStatements(this.serverless.service.provider.iamRoleStatements);
    return this.merge();
  },

  merge() {
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
    });

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

      this.serverless.service.getAllFunctions().forEach((functionName) => {
        const logGroupLogicalId = this.provider.naming
          .getLogGroupLogicalId(functionName);

        this.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[this.provider.naming.getPolicyLogicalId()]
          .Properties
          .PolicyDocument
          .Statement[0]
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

      if (this.serverless.service.provider.iamRoleStatements) {
        // add custom iam role statements
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

  validateStatements(statements) {
    // Verify that iamRoleStatements (if present) is an array of { Effect: ...,
    // Action: ..., Resource: ... } objects.
    if (!statements) {
      return;
    }
    let violationsFound;
    if (!(statements instanceof Array)) {
      violationsFound = 'it is not an array';
    } else {
      const descriptions = statements.map((statement, i) => {
        const missing = ['Effect', 'Action', 'Resource'].filter(
            prop => statement[prop] === undefined);
        return missing.length === 0 ? null :
          `statement ${i} is missing the following properties: ${missing.join(', ')}`;
      });
      const flawed = descriptions.filter(curr => curr);
      if (flawed.length) {
        violationsFound = flawed.join('; ');
      }
    }

    if (violationsFound) {
      const errorMessage = [
        'iamRoleStatements should be an array of objects,',
        ' where each object has Effect, Action, Resource fields.',
        ` Specifically, ${violationsFound}`,
      ].join('');
      throw new this.serverless.classes.Error(errorMessage);
    }
  },
};

