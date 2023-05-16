'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');
const { addCustomResourceToService } = require('../../../custom-resources');
const ServerlessError = require('../../../../../serverless-error');
const resolveLambdaTarget = require('../../../utils/resolve-lambda-target');

const customSenderSources = ['CustomSMSSender', 'CustomEmailSender'];
const validTriggerSources = [
  'PreSignUp',
  'PostConfirmation',
  'PreAuthentication',
  'PostAuthentication',
  'PreTokenGeneration',
  'CustomMessage',
  'DefineAuthChallenge',
  'CreateAuthChallenge',
  'VerifyAuthChallengeResponse',
  'UserMigration',
].concat(customSenderSources);

const validLambdaVersions = ['V1_0'];

class AwsCompileCognitoUserPoolEvents {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = this.serverless.getProvider('aws');

    this.hooks = {
      'package:compileEvents': async () => {
        return BbPromise.bind(this)
          .then(this.newCognitoUserPools)
          .then(this.existingCognitoUserPools);
      },
      'after:package:finalize': async () => this.mergeWithCustomResources(),
    };

    this.serverless.configSchemaHandler.defineFunctionEvent('aws', 'cognitoUserPool', {
      type: 'object',
      properties: {
        pool: { type: 'string', maxLength: 128, pattern: '^[\\w\\s+=,.@-]+$' },
        trigger: { enum: validTriggerSources },
        existing: { type: 'boolean' },
        forceDeploy: { type: 'boolean' },
        kmsKeyId: { $ref: '#/definitions/awsKmsArn' },
      },
      required: ['pool', 'trigger'],
      additionalProperties: false,
    });
  }

  newCognitoUserPools() {
    const { service } = this.serverless;
    service.getAllFunctions().forEach((functionName) => {
      const functionObj = service.getFunction(functionName);
      if (functionObj.events) {
        functionObj.events.forEach((event) => {
          if (event.cognitoUserPool) {
            // return immediately if it's an existing Cognito User Pool event since we treat them differently
            if (event.cognitoUserPool.existing) return null;

            const result = this.findUserPoolsAndFunctions();
            const cognitoUserPoolTriggerFunctions = result.cognitoUserPoolTriggerFunctions;
            const userPools = result.userPools;

            // Generate CloudFormation templates for Cognito User Pool changes
            userPools.forEach((poolName) => {
              const currentPoolTriggerFunctions = cognitoUserPoolTriggerFunctions.filter(
                (triggerFn) => triggerFn.poolName === poolName
              );
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
            cognitoUserPoolTriggerFunctions.forEach((cognitoUserPoolTriggerFunction) => {
              const userPoolLogicalId = this.provider.naming.getCognitoUserPoolLogicalId(
                cognitoUserPoolTriggerFunction.poolName
              );

              const triggerFunctionObj = service.getFunction(
                cognitoUserPoolTriggerFunction.functionName
              );

              const permissionTemplate = {
                Type: 'AWS::Lambda::Permission',
                DependsOn: _.get(triggerFunctionObj.targetAlias, 'logicalId'),
                Properties: {
                  FunctionName: resolveLambdaTarget(
                    cognitoUserPoolTriggerFunction.functionName,
                    triggerFunctionObj
                  ),
                  Action: 'lambda:InvokeFunction',
                  Principal: 'cognito-idp.amazonaws.com',
                  SourceArn: {
                    'Fn::GetAtt': [userPoolLogicalId, 'Arn'],
                  },
                },
              };
              const lambdaPermissionLogicalId =
                this.provider.naming.getLambdaCognitoUserPoolPermissionLogicalId(
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
    const { Resources } = compiledCloudFormationTemplate;
    const iamRoleStatements = [];
    let usesExistingCognitoUserPool = false;

    // used to keep track of the custom resources created for each Cognito User Pool
    const poolResources = {};
    const poolKmsIdMap = new Map();

    service.getAllFunctions().forEach((functionName) => {
      let numEventsForFunc = 0;
      let currentPoolName = null;
      let funcUsesExistingCognitoUserPool = false;
      const functionObj = service.getFunction(functionName);
      const FunctionName = functionObj.name;

      if (functionObj.events) {
        functionObj.events.forEach((event) => {
          if (event.cognitoUserPool && event.cognitoUserPool.existing) {
            numEventsForFunc++;
            const { pool, trigger, forceDeploy, kmsKeyId, lambdaVersion } = event.cognitoUserPool;
            usesExistingCognitoUserPool = funcUsesExistingCognitoUserPool = true;

            if (!currentPoolName) {
              currentPoolName = pool;
            }
            if (pool !== currentPoolName) {
              const errorMessage = [
                'Only one Cognito User Pool can be configured per function.',
                ` In "${FunctionName}" you're attempting to configure "${currentPoolName}" and "${pool}" at the same time.`,
              ].join('');
              throw new ServerlessError(errorMessage, 'COGNITO_MULTIPLE_USER_POOLS_PER_FUNCTION');
            }

            const eventFunctionLogicalId = this.provider.naming.getLambdaLogicalId(functionName);
            const customResourceFunctionLogicalId =
              this.provider.naming.getCustomResourceCognitoUserPoolHandlerFunctionLogicalId();
            const customPoolResourceLogicalId =
              this.provider.naming.getCustomResourceCognitoUserPoolResourceLogicalId(functionName);

            // store how often the custom Cognito User Pool resource is used
            if (poolResources[pool]) {
              poolResources[pool] = _.union(poolResources[pool], [customPoolResourceLogicalId]);
            } else {
              Object.assign(poolResources, {
                [pool]: [customPoolResourceLogicalId],
              });
            }

            let customCognitoUserPoolResource;
            const forceDeployProperty = forceDeploy ? Date.now() : undefined;

            let userPoolConfig = {
              Trigger: trigger,
            };
            if (customSenderSources.includes(trigger)) {
              userPoolConfig = {
                ...userPoolConfig,
                ...{
                  LambdaVersion: lambdaVersion || validLambdaVersions[0],
                },
              };

              this.checkKmsArn(kmsKeyId, poolKmsIdMap, pool);
              userPoolConfig.KMSKeyID = kmsKeyId;
            }

            if (numEventsForFunc === 1) {
              if (customSenderSources.includes(trigger) && kmsKeyId) {
                iamRoleStatements.push({
                  Effect: 'Allow',
                  Resource: kmsKeyId,
                  Action: ['kms:CreateGrant'],
                });
              }
              customCognitoUserPoolResource = {
                [customPoolResourceLogicalId]: {
                  Type: 'Custom::CognitoUserPool',
                  Version: 1.0,
                  DependsOn: [eventFunctionLogicalId, customResourceFunctionLogicalId],
                  Properties: {
                    ServiceToken: {
                      'Fn::GetAtt': [customResourceFunctionLogicalId, 'Arn'],
                    },
                    FunctionName,
                    UserPoolName: pool,
                    UserPoolConfigs: [userPoolConfig],
                    ForceDeploy: forceDeployProperty,
                  },
                },
              };

              iamRoleStatements.push({
                Effect: 'Allow',
                Resource: '*',
                Action: [
                  'cognito-idp:ListUserPools',
                  'cognito-idp:DescribeUserPool',
                  'cognito-idp:UpdateUserPool',
                ],
              });
            } else {
              Resources[customPoolResourceLogicalId].Properties.UserPoolConfigs.push(
                userPoolConfig
              );
            }

            _.merge(Resources, customCognitoUserPoolResource);
          }
        });
      }

      if (funcUsesExistingCognitoUserPool) {
        iamRoleStatements.push({
          Effect: 'Allow',
          Resource: {
            'Fn::Sub': `arn:\${AWS::Partition}:lambda:*:*:function:${FunctionName}`,
          },
          Action: ['lambda:AddPermission', 'lambda:RemovePermission'],
        });
      }
    });

    if (usesExistingCognitoUserPool) {
      iamRoleStatements.push({
        Effect: 'Allow',
        Resource: {
          'Fn::Sub': 'arn:${AWS::Partition}:iam::*:role/*',
        },
        Action: ['iam:PassRole'],
      });
    }

    // check if we need to add DependsOn clauses in case more than 1
    // custom resources are created for one Cognito User Pool (to avoid race conditions)
    if (Object.keys(poolResources).length > 0) {
      Object.keys(poolResources).forEach((pool) => {
        const resources = poolResources[pool];
        if (resources.length > 1) {
          resources.forEach((currResourceLogicalId, idx) => {
            if (idx > 0) {
              const prevResourceLogicalId = resources[idx - 1];
              Resources[currResourceLogicalId].DependsOn.push(prevResourceLogicalId);
            }
          });
        }
      });
    }

    if (iamRoleStatements.length) {
      return addCustomResourceToService(this.provider, 'cognitoUserPool', iamRoleStatements);
    }

    return null;
  }

  checkKmsArn(kmsKeyId, poolKmsIdMap, currentPoolName) {
    // KMSKeyId is only used (and is required) with Custom Sender Sources
    if (!kmsKeyId) {
      throw new ServerlessError(
        `KMS Key must be set when using a Custom Sender Source Trigger (CustomSMSSender and/or CustomEmailSender). Affected Cognito User Pool: "${currentPoolName}".`,
        'COGNITO_KMS_KEY_NOT_SET'
      );
    }

    const previousKmsId = poolKmsIdMap.get(currentPoolName);
    if (
      previousKmsId !== undefined &&
      previousKmsId !== kmsKeyId &&
      JSON.stringify(previousKmsId) !== JSON.stringify(kmsKeyId)
    ) {
      throw new ServerlessError(
        `Only one KMS Key for can be configured per Cognito User Pool. Affected Cognito User Pool: "${currentPoolName}".`,
        'COGNITO_KMS_KEY_ID_NOT_SAME_FOR_SINGLE_USER_POOL'
      );
    }
    poolKmsIdMap.set(currentPoolName, kmsKeyId);
  }

  findUserPoolsAndFunctions() {
    const userPools = [];
    const cognitoUserPoolTriggerFunctions = [];

    // Iterate through all functions declared in `serverless.yml`
    this.serverless.service.getAllFunctions().forEach((functionName) => {
      const functionObj = this.serverless.service.getFunction(functionName);

      if (functionObj.events) {
        functionObj.events.forEach((event) => {
          if (event.cognitoUserPool) {
            if (event.cognitoUserPool.existing) return;

            // Save trigger functions so we can use them to generate
            // IAM permissions later
            cognitoUserPoolTriggerFunctions.push({
              functionName,
              poolName: event.cognitoUserPool.pool,
              triggerSource: event.cognitoUserPool.trigger,
              kmsKeyId: event.cognitoUserPool.kmsKeyId,
              lambdaVersion: event.cognitoUserPool.lambdaVersion,
            });

            // Save user pools so we can use them to generate
            // CloudFormation resources later
            userPools.push(event.cognitoUserPool.pool);
          }
        });
      }
    });

    return { cognitoUserPoolTriggerFunctions, userPools };
  }

  generateTemplateForPool(poolName, currentPoolTriggerFunctions) {
    const poolKmsIdMap = new Map();
    const lambdaConfig = currentPoolTriggerFunctions.reduce((result, value) => {
      const functionObj = this.serverless.service.getFunction(value.functionName);

      let triggerObject;
      if (customSenderSources.includes(value.triggerSource)) {
        triggerObject = {
          [value.triggerSource]: {
            LambdaArn: resolveLambdaTarget(value.functionName, functionObj),
            LambdaVersion: value.lambdaVersion || validLambdaVersions[0],
          },
        };
        this.checkKmsArn(value.kmsKeyId, poolKmsIdMap, poolName);
        triggerObject.KMSKeyID = value.kmsKeyId;
      } else {
        triggerObject = {
          [value.triggerSource]: resolveLambdaTarget(value.functionName, functionObj),
        };
      }

      // Return a new object to avoid lint errors
      return Object.assign({}, result, triggerObject);
    }, {});

    const userPoolLogicalId = this.provider.naming.getCognitoUserPoolLogicalId(poolName);

    // Attach `DependsOn` for any relevant Lambdas
    const DependsOn = currentPoolTriggerFunctions.map((value) => {
      const functionObj = this.serverless.service.getFunction(value.functionName);
      return (
        _.get(functionObj.targetAlias, 'logicalId') ||
        this.provider.naming.getLambdaLogicalId(value.functionName)
      );
    });

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

    userPools.forEach((poolName) => {
      const currentPoolTriggerFunctions = cognitoUserPoolTriggerFunctions.filter(
        (triggerFn) => triggerFn.poolName === poolName
      );
      const userPoolLogicalId = this.provider.naming.getCognitoUserPoolLogicalId(poolName);

      // If overrides exist in `Resources`, merge them in
      if (_.get(this.serverless.service.resources, userPoolLogicalId)) {
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
