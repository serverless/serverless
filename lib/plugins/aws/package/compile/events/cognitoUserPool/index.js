'use strict';

const _ = require('lodash');

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
  constructor(serverless) {
    this.serverless = serverless;
    this.provider = this.serverless.getProvider('aws');

    this.hooks = {
      'package:compileEvents': this.compileCognitoUserPoolEvents.bind(this),
    };
  }

  compileCognitoUserPoolEvents() {
    const userPools = [];
    const cognitoUserPoolTriggerFunctions = [];

    // Iterate through all functions declared in `serverless.yml`
    this.serverless.service.getAllFunctions().forEach((functionName) => {
      const functionObj = this.serverless.service.getFunction(functionName);

      if (functionObj.events) {
        functionObj.events.forEach(event => {
          if (event.cognitoUserPool) {
            // Check event definition for `cognitoUserPool` object
            if (typeof event.cognitoUserPool === 'object') {
              // Check `cognitoUserPool` object has required properties
              if (!event.cognitoUserPool.pool || !event.cognitoUserPool.trigger) {
                throw new this.serverless.classes
                  .Error([
                    `Cognito User Pool event of function "${functionName}" is not an object.`,
                    'The correct syntax is an object with the "pool" and "trigger" properties.',
                    'Please check the docs for more info.',
                  ].join(' '));
              }

              // Check `cognitoUserPool` trigger is valid
              if (!_.includes(validTriggerSources, event.cognitoUserPool.trigger)) {
                throw new this.serverless.classes
                  .Error([
                    'Cognito User Pool trigger source is invalid, must be one of:',
                    `${validTriggerSources.join(', ')}.`,
                    'Please check the docs for more info.',
                  ].join(' '));
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
              throw new this.serverless.classes
                .Error([
                  `Cognito User Pool event of function "${functionName}" is not an object.`,
                  'The correct syntax is an object with the "pool" and "trigger" properties.',
                  'Please check the docs for more info.',
                ].join(' '));
            }
          }
        });
      }
    });

    // Generate CloudFormation templates for Cognito User Pool changes
    _.forEach(userPools, (poolName) => {
      // Create a `LambdaConfig` object for the CloudFormation template
      const currentPoolTriggerFunctions = _.filter(cognitoUserPoolTriggerFunctions, {
        poolName,
      });

      const lambdaConfig = _.reduce(currentPoolTriggerFunctions, (result, value) => {
        const lambdaLogicalId = this.provider.naming.getLambdaLogicalId(value.functionName);

        // Return a new object to avoid lint errors
        return Object.assign({}, result, {
          [value.triggerSource]: {
            'Fn::GetAtt': [
              lambdaLogicalId,
              'Arn',
            ],
          },
        });
      }, {});

      const userPoolLogicalId = this.provider.naming.getCognitoUserPoolLogicalId(poolName);

      const DependsOn = _.map(currentPoolTriggerFunctions, (value) => this
        .provider.naming.getLambdaLogicalId(value.functionName));

      const userPoolTemplate = {
        Type: 'AWS::Cognito::UserPool',
        Properties: {
          UserPoolName: poolName,
          LambdaConfig: lambdaConfig,
        },
        DependsOn,
      };

      const userPoolCFResource = {
        [userPoolLogicalId]: userPoolTemplate,
      };

      _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
        userPoolCFResource);
    });

    // Generate CloudFormation templates for IAM permissions to allow Cognito to trigger Lambda
    cognitoUserPoolTriggerFunctions.forEach((cognitoUserPoolTriggerFunction) => {
      const userPoolLogicalId = this.provider.naming
        .getCognitoUserPoolLogicalId(cognitoUserPoolTriggerFunction.poolName);
      const lambdaLogicalId = this.provider.naming
        .getLambdaLogicalId(cognitoUserPoolTriggerFunction.functionName);

      const permissionTemplate = {
        Type: 'AWS::Lambda::Permission',
        Properties: {
          FunctionName: {
            'Fn::GetAtt': [
              lambdaLogicalId,
              'Arn',
            ],
          },
          Action: 'lambda:InvokeFunction',
          Principal: 'cognito-idp.amazonaws.com',
          SourceArn: {
            'Fn::GetAtt': [
              userPoolLogicalId,
              'Arn',
            ],
          },
        },
      };
      const lambdaPermissionLogicalId = this.provider.naming
        .getLambdaCognitoUserPoolPermissionLogicalId(cognitoUserPoolTriggerFunction.functionName,
          cognitoUserPoolTriggerFunction.poolName, cognitoUserPoolTriggerFunction.triggerSource);
      const permissionCFResource = {
        [lambdaPermissionLogicalId]: permissionTemplate,
      };
      _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
        permissionCFResource);
    });
  }
}

module.exports = AwsCompileCognitoUserPoolEvents;
