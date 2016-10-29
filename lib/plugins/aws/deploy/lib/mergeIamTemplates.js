'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');
const path = require('path');

module.exports = {
  mergeIamTemplates() {
    if (!this.serverless.service.getAllFunctions().length) {
      return BbPromise.resolve();
    }

    if (typeof this.serverless.service.provider.iamRoleARN !== 'string') {
      // merge in the iamRoleLambdaTemplate
      const iamRoleLambdaExecutionTemplate = this.serverless.utils.readFileSync(
        path.join(this.serverless.config.serverlessPath,
          'plugins',
          'aws',
          'deploy',
          'lib',
          'iam-role-lambda-execution-template.json')
      );

      _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
        iamRoleLambdaExecutionTemplate);

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
      iamPolicyLambdaExecutionTemplate
        .IamPolicyLambdaExecution
        .Properties
        .PolicyName = `${this.options.stage}-${this.serverless.service.service}-lambda`;

      _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
        iamPolicyLambdaExecutionTemplate);

      if (!this.serverless.service.provider.cfLogs) {
        this.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .IamPolicyLambdaExecution
          .Properties
          .PolicyDocument
          .Statement[0]
          .Resource = `arn:aws:logs:${this.options.region}:*:*`;

        this.serverless.service.provider.compiledCloudFormationTemplate.Resources
          .IamPolicyLambdaExecution
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
          const normalizedFunctionName = functionName[0].toUpperCase() + functionName.substr(1);
          const logGroupTemplate = `
          {
            "${normalizedFunctionName}LogGroup": {
              "Type" : "AWS::Logs::LogGroup",
              "Properties" : {
                "LogGroupName" : "/aws/lambda/${functionObject.name}"
              }
            }
          }
        `;
          const newLogGroup = JSON.parse(logGroupTemplate);
          _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
            newLogGroup);

          this.serverless.service.provider.compiledCloudFormationTemplate
            .Resources
            .IamPolicyLambdaExecution
            .Properties
            .PolicyDocument
            .Statement[0]
            .Resource
            .push({ 'Fn::GetAtt': [`${normalizedFunctionName}LogGroup`, 'Arn'] });

          this.serverless.service.provider.compiledCloudFormationTemplate
            .Resources
            .IamPolicyLambdaExecution
            .Properties
            .PolicyDocument
            .Statement[1]
            .Resource
            .push({
              'Fn::Join': [
                ':',
                [
                  { 'Fn::GetAtt': [`${normalizedFunctionName}LogGroup`, 'Arn'] },
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
          .Resources
          .IamPolicyLambdaExecution
          .Properties
          .PolicyDocument
          .Statement = this.serverless.service.provider.compiledCloudFormationTemplate
          .Resources
          .IamPolicyLambdaExecution
          .Properties
          .PolicyDocument
          .Statement.concat(this.serverless.service.provider.iamRoleStatements);
      }
    }

    return BbPromise.resolve();
  },

};
