'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');
const { addCustomResourceToService } = require('../../../../customResources');

const validTriggerSources = [
  'PreSignUp',
  'PostConfirmation',
  'PreAuthentication',
  'PostAuthentication',
  'CustomMessage',
  'DefineAuthChallenge',
  'CreateAuthChallenge',
  'VerifyAuthChallengeResponse',
];

class AwsCompileCognitoUserPoolEvents {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = this.serverless.getProvider('aws');

    this.hooks = {
      'package:compileEvents': () => {
        return BbPromise.bind(this)
          .then(this.newCognitoUserPools)
          .then(this.existingCognitoUserPools);
      },
      'after:package:finalize': this.mergeWithCustomResources.bind(this),
    };
  }

  newCognitoUserPools() {
    const { service } = this.serverless;
    service.getAllFunctions().forEach(functionName => {
      const functionObj = service.getFunction(functionName);
      if (functionObj.events) {
        functionObj.events.forEach(event => {
          if (event.cognitoUserPool) {
            // return immediately if it's an existing Cognito User Pool event since we treat them differently
            if (event.cognitoUserPool.existing) return null;

            const result = this.findUserPoolsAndFunctions();
            const cognitoUserPoolTriggerFunctions = result.cognitoUserPoolTriggerFunctions;
            const userPools = result.userPools;

            // Generate CloudFormation templates for Cognito User Pool changes
            _.forEach(userPools, poolName => {
              const currentPoolTriggerFunctions = _.filter(cognitoUserPoolTriggerFunctions, {
                poolName,
              });
              const userPoolCFResource = this.generateTemplateForPool(
                poolName,
                currentPoolTriggerFunctions
              );

              _.merge(
                this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
                userPoolCFResource
              );
            });

            // Generate CloudFormation templates for IAM permissions to allow Cognito to trigger Lambda
            _.forEach(cognitoUserPoolTriggerFunctions, cognitoUserPoolTriggerFunction => {
              const userPoolLogicalId = this.provider.naming.getCognitoUserPoolLogicalId(
                cognitoUserPoolTriggerFunction.poolName
              );
              const lambdaLogicalId = this.provider.naming.getLambdaLogicalId(
                cognitoUserPoolTriggerFunction.functionName
              );

              const permissionTemplate = {
                Type: 'AWS::Lambda::Permission',
                Properties: {
                  FunctionName: {
                    'Fn::GetAtt': [lambdaLogicalId, 'Arn'],
                  },
                  Action: 'lambda:InvokeFunction',
                  Principal: 'cognito-idp.amazonaws.com',
                  SourceArn: {
                    'Fn::GetAtt': [userPoolLogicalId, 'Arn'],
                  },
                },
              };
              const lambdaPermissionLogicalId = this.provider.naming.getLambdaCognitoUserPoolPermissionLogicalId(
                cognitoUserPoolTriggerFunction.functionName,
                cognitoUserPoolTriggerFunction.poolName,
                cognitoUserPoolTriggerFunction.triggerSource
              );
              const permissionCFResource = {
                [lambdaPermissionLogicalId]: permissionTemplate,
              };
              _.merge(
                this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
                permissionCFResource
              );
            });
          }
          return null;
        });
      }
      return null;
    });
  }

  existingCognitoUserPools() {
    const { service } = this.serverless;
    const { provider } = service;
    const { compiledCloudFormationTemplate } = provider;
    const iamRoleStatements = [];

    service.getAllFunctions().forEach(functionName => {
      let funcUsesExistingCognitoUserPool = false;
      const functionObj = service.getFunction(functionName);
      const FunctionName = functionObj.name;

      if (functionObj.events) {
        functionObj.events.forEach((event, idx) => {
          if (event.cognitoUserPool && event.cognitoUserPool.existing) {
            idx++;
            const { pool, trigger } = event.cognitoUserPool;
            funcUsesExistingCognitoUserPool = true;

            const eventFunctionLogicalId = this.provider.naming.getLambdaLogicalId(functionName);
            const customResourceFunctionLogicalId = this.provider.naming.getCustomResourceCognitoUserPoolHandlerFunctionLogicalId();
            const customCognitoUserPoolResourceLogicalId = this.provider.naming.getCustomResourceCognitoUserPoolResourceLogicalId(
              functionName,
              idx
            );

            const customCognitoUserPool = {
              [customCognitoUserPoolResourceLogicalId]: {
                Type: 'Custom::CognitoUserPool',
                Version: 1.0,
                DependsOn: [eventFunctionLogicalId, customResourceFunctionLogicalId],
                Properties: {
                  ServiceToken: {
                    'Fn::GetAtt': [customResourceFunctionLogicalId, 'Arn'],
                  },
                  FunctionName,
                  UserPoolName: pool,
                  UserPoolConfig: {
                    Trigger: trigger,
                  },
                },
              },
            };

            _.merge(compiledCloudFormationTemplate.Resources, customCognitoUserPool);

            iamRoleStatements.push({
              Effect: 'Allow',
              Resource: '*',
              Action: [
                'cognito-idp:ListUserPools',
                'cognito-idp:DescribeUserPool',
                'cognito-idp:UpdateUserPool',
              ],
            });
          }
        });
      }

      if (funcUsesExistingCognitoUserPool) {
        iamRoleStatements.push({
          Effect: 'Allow',
          Resource: `arn:aws:lambda:*:*:function:${FunctionName}`,
          Action: ['lambda:AddPermission', 'lambda:RemovePermission'],
        });
      }
    });

    if (iamRoleStatements.length) {
      return addCustomResourceToService.call(this, 'cognitoUserPool', iamRoleStatements);
    }

    return null;
  }

  findUserPoolsAndFunctions() {
    const userPools = [];
    const cognitoUserPoolTriggerFunctions = [];

    // Iterate through all functions declared in `serverless.yml`
    _.forEach(this.serverless.service.getAllFunctions(), functionName => {
      const functionObj = this.serverless.service.getFunction(functionName);

      if (functionObj.events) {
        _.forEach(functionObj.events, event => {
          if (event.cognitoUserPool) {
            // Check event definition for `cognitoUserPool` object
            if (typeof event.cognitoUserPool === 'object') {
              // Check `cognitoUserPool` object has required properties
              if (!event.cognitoUserPool.pool || !event.cognitoUserPool.trigger) {
                throw new this.serverless.classes.Error(
                  [
                    `Cognito User Pool event of function "${functionName}" is not an object.`,
                    'The correct syntax is an object with the "pool" and "trigger" properties.',
                    'Please check the docs for more info.',
                  ].join(' ')
                );
              }

              // Check `cognitoUserPool` trigger is valid
              if (!_.includes(validTriggerSources, event.cognitoUserPool.trigger)) {
                throw new this.serverless.classes.Error(
                  [
                    'Cognito User Pool trigger source is invalid, must be one of:',
                    `${validTriggerSources.join(', ')}.`,
                    'Please check the docs for more info.',
                  ].join(' ')
                );
              }

              // Save trigger functions so we can use them to generate
              // IAM permissions later
              cognitoUserPoolTriggerFunctions.push({
                functionName,
                poolName: event.cognitoUserPool.pool,
                triggerSource: event.cognitoUserPool.trigger,
              });

              // Save user pools so we can use them to generate
              // CloudFormation resources later
              userPools.push(event.cognitoUserPool.pool);
            } else {
              throw new this.serverless.classes.Error(
                [
                  `Cognito User Pool event of function "${functionName}" is not an object.`,
                  'The correct syntax is an object with the "pool" and "trigger" properties.',
                  'Please check the docs for more info.',
                ].join(' ')
              );
            }
          }
        });
      }
    });

    return { cognitoUserPoolTriggerFunctions, userPools };
  }

  generateTemplateForPool(poolName, currentPoolTriggerFunctions) {
    const lambdaConfig = _.reduce(
      currentPoolTriggerFunctions,
      (result, value) => {
        const lambdaLogicalId = this.provider.naming.getLambdaLogicalId(value.functionName);

        // Return a new object to avoid lint errors
        return Object.assign({}, result, {
          [value.triggerSource]: {
            'Fn::GetAtt': [lambdaLogicalId, 'Arn'],
          },
        });
      },
      {}
    );

    const userPoolLogicalId = this.provider.naming.getCognitoUserPoolLogicalId(poolName);

    // Attach `DependsOn` for any relevant Lambdas
    const DependsOn = _.map(currentPoolTriggerFunctions, value =>
      this.provider.naming.getLambdaLogicalId(value.functionName)
    );

    return {
      [userPoolLogicalId]: {
        Type: 'AWS::Cognito::UserPool',
        Properties: {
          UserPoolName: poolName,
          LambdaConfig: lambdaConfig,
        },
        DependsOn,
      },
    };
  }

  mergeWithCustomResources() {
    const result = this.findUserPoolsAndFunctions();
    const cognitoUserPoolTriggerFunctions = result.cognitoUserPoolTriggerFunctions;
    const userPools = result.userPools;

    _.forEach(userPools, poolName => {
      const currentPoolTriggerFunctions = _.filter(cognitoUserPoolTriggerFunctions, { poolName });
      const userPoolLogicalId = this.provider.naming.getCognitoUserPoolLogicalId(poolName);

      // If overrides exist in `Resources`, merge them in
      if (_.has(this.serverless.service.resources, userPoolLogicalId)) {
        const customUserPool = this.serverless.service.resources[userPoolLogicalId];
        const generatedUserPool = this.generateTemplateForPool(
          poolName,
          currentPoolTriggerFunctions
        )[userPoolLogicalId];

        // Merge `DependsOn` clauses
        const customUserPoolDependsOn = _.get(customUserPool, 'DependsOn', []);
        const DependsOn = generatedUserPool.DependsOn.concat(customUserPoolDependsOn);

        // Merge default and custom resources, and `DependsOn` clause
        const mergedTemplate = Object.assign({}, _.merge(generatedUserPool, customUserPool), {
          DependsOn,
        });

        // Merge resource back into `Resources`
        _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
          [userPoolLogicalId]: mergedTemplate,
        });
      }
    });
  }
}

module.exports = AwsCompileCognitoUserPoolEvents;
