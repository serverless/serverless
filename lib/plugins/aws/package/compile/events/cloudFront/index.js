'use strict';

const _ = require('lodash');
const url = require('url');
const chalk = require('chalk');
const { ServerlessError } = require('../../../../../../classes/Error');

const originLimits = { maxTimeout: 30, maxMemorySize: 3008 };
const viewerLimits = { maxTimeout: 5, maxMemorySize: 128 };

class AwsCompileCloudFrontEvents {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = this.serverless.getProvider('aws');
    this.lambdaEdgeLimits = {
      'origin-request': originLimits,
      'origin-response': originLimits,
      'viewer-request': viewerLimits,
      'viewer-response': viewerLimits,
      'default': viewerLimits,
    };
    this.hooks = {
      'package:initialize': this.validate.bind(this),
      'before:package:compileFunctions': this.prepareFunctions.bind(this),
      'package:compileEvents': this.compileCloudFrontEvents.bind(this),
      'before:remove:remove': this.logRemoveReminder.bind(this),
    };
  }

  logRemoveReminder() {
    if (this.serverless.processedInput.commands[0] === 'remove') {
      let isEventUsed = false;
      const funcKeys = this.serverless.service.getAllFunctions();
      if (funcKeys.length) {
        isEventUsed = funcKeys.some(funcKey => {
          const func = this.serverless.service.getFunction(funcKey);
          return func.events && func.events.find(e => Object.keys(e)[0] === 'cloudFront');
        });
      }
      if (isEventUsed) {
        const message = [
          "Don't forget to manually remove your Lambda@Edge functions ",
          'once the CloudFront distribution removal is successfully propagated!',
        ].join('');
        this.serverless.cli.log(message, 'Serverless', { color: 'orange' });
      }
    }
  }

  validate() {
    this.serverless.service.getAllFunctions().forEach(functionName => {
      const functionObj = this.serverless.service.getFunction(functionName);
      functionObj.events.forEach(({ cloudFront }) => {
        if (!cloudFront) return;
        const { eventType = 'default' } = cloudFront;
        const { maxMemorySize, maxTimeout } = this.lambdaEdgeLimits[eventType];
        if (functionObj.memorySize && functionObj.memorySize > maxMemorySize) {
          throw new Error(
            `"${functionName}" memorySize is greater than ${maxMemorySize} which is not supported by Lambda@Edge functions of type "${eventType}"`
          );
        }
        if (functionObj.timeout && functionObj.timeout > maxTimeout) {
          throw new Error(
            `"${functionName}" timeout is greater than ${maxTimeout} which is not supported by Lambda@Edge functions of type "${eventType}"`
          );
        }
      });
    });
  }

  prepareFunctions() {
    // Lambda@Edge functions need to be versioned
    this.serverless.service.getAllFunctions().forEach(functionName => {
      const functionObj = this.serverless.service.getFunction(functionName);
      if (functionObj.events.find(event => event.cloudFront)) {
        // ensure that functions are versioned
        Object.assign(functionObj, { versionFunction: true });
        // set the maximum memory size if not explicitly configured
        if (!functionObj.memorySize) {
          Object.assign(functionObj, { memorySize: 128 });
        }
        // set the maximum timeout if not explicitly configured
        if (!functionObj.timeout) {
          Object.assign(functionObj, { timeout: 5 });
        }
      }
    });
  }

  compileCloudFrontEvents() {
    this.cloudFrontDistributionLogicalId = this.provider.naming.getCloudFrontDistributionLogicalId();

    this.cloudFrontDistributionDomainNameLogicalId = this.provider.naming.getCloudFrontDistributionDomainNameLogicalId();

    const lambdaAtEdgeFunctions = [];

    const origins = [];
    const behaviors = [];

    const Resources = this.serverless.service.provider.compiledCloudFormationTemplate.Resources;
    const Outputs = this.serverless.service.provider.compiledCloudFormationTemplate.Outputs;

    // helper function for joining origins and behaviors
    function extendDeep(object, source) {
      return _.assignWith(object, source, (a, b) => {
        if (Array.isArray(a)) {
          return _.uniq(a.concat(b));
        }
        if (_.isObject(a)) {
          extendDeep(a, b);
        }
        return a;
      });
    }

    function createOrigin(functionName, origin, naming) {
      const originObj = {};
      if (typeof origin === 'string') {
        const originUrl = url.parse(origin);
        Object.assign(originObj, {
          DomainName: originUrl.hostname,
        });

        if (originUrl.pathname && originUrl.pathname.length > 1) {
          Object.assign(originObj, { OriginPath: originUrl.pathname });
        }

        if (originUrl.protocol === 's3:') {
          Object.assign(originObj, { S3OriginConfig: {} });
        } else {
          Object.assign(originObj, {
            CustomOriginConfig: {
              OriginProtocolPolicy: 'match-viewer',
            },
          });
        }
      } else {
        Object.assign(originObj, origin);
      }

      Object.assign(originObj, {
        Id: naming.getCloudFrontOriginId(functionName, originObj.OriginPath),
      });
      return originObj;
    }

    this.serverless.service.getAllFunctions().forEach(functionName => {
      const functionObj = this.serverless.service.getFunction(functionName);
      if (functionObj.events) {
        functionObj.events.forEach(event => {
          if (event.cloudFront) {
            if (!_.isObject(event.cloudFront)) {
              throw new Error('cloudFront event has to be an object');
            }

            const lambdaFunctionLogicalId = Object.keys(Resources).find(
              key =>
                Resources[key].Type === 'AWS::Lambda::Function' &&
                Resources[key].Properties.FunctionName === functionObj.name
            );

            // Retain Lambda@Edge functions to avoid issues when removing the CloudFormation stack
            Object.assign(Resources[lambdaFunctionLogicalId], { DeletionPolicy: 'Retain' });

            const lambdaVersionLogicalId = _.findKey(Resources, {
              Type: 'AWS::Lambda::Version',
              Properties: {
                FunctionName: {
                  Ref: this.provider.naming.getLambdaLogicalId(functionName),
                },
              },
            });

            const pathPattern =
              typeof event.cloudFront.pathPattern === 'string'
                ? event.cloudFront.pathPattern
                : undefined;

            let origin = createOrigin(functionName, event.cloudFront.origin, this.provider.naming);

            const existingOrigin = _.find(
              origins,
              o => o.DomainName === origin.DomainName && o.OriginPath === origin.OriginPath
            );

            if (!existingOrigin) {
              origins.push(origin);
            } else {
              origin = extendDeep(existingOrigin, origin);
            }

            let behavior = {
              ViewerProtocolPolicy: 'allow-all',
              TargetOriginId: origin.Id,
              ForwardedValues: {
                QueryString: false,
              },
              LambdaFunctionAssociations: [
                {
                  EventType: event.cloudFront.eventType,
                  LambdaFunctionARN: {
                    Ref: lambdaVersionLogicalId,
                  },
                },
              ],
            };

            if (pathPattern) {
              Object.assign(behavior, { PathPattern: pathPattern });
            }

            const existingBehaviour = behaviors.find(
              o =>
                o.PathPattern === behavior.PathPattern &&
                o.TargetOriginId === behavior.TargetOriginId
            );

            if (!existingBehaviour) {
              behaviors.push(behavior);
            } else {
              behavior = extendDeep(existingBehaviour, behavior);
            }

            lambdaAtEdgeFunctions.push(
              Object.assign({}, functionObj, { functionName, lambdaVersionLogicalId })
            );
          }
        });
      }
    });

    // sort that first is without PathPattern if available
    behaviors.sort((a, b) => {
      if (b.PathPattern) {
        return -1;
      }
      return 0;
    });

    if (lambdaAtEdgeFunctions.length) {
      if (this.provider.getRegion() !== 'us-east-1') {
        throw new ServerlessError(
          'CloudFront associated functions have to be deployed to the us-east-1 region.'
        );
      }

      const lambdaInvokePermissions = lambdaAtEdgeFunctions.reduce(
        (permissions, lambdaAtEdgeFunction) => {
          const invokePermissionName = this.provider.naming.getLambdaAtEdgeInvokePermissionLogicalId(
            lambdaAtEdgeFunction.functionName
          );
          const invokePermission = {
            Type: 'AWS::Lambda::Permission',
            Properties: {
              FunctionName: {
                Ref: lambdaAtEdgeFunction.lambdaVersionLogicalId,
              },
              Action: 'lambda:InvokeFunction',
              Principal: 'edgelambda.amazonaws.com',
              SourceArn: {
                'Fn::Join': [
                  '',
                  [
                    '',
                    'arn:aws:cloudfront::',
                    { Ref: 'AWS::AccountId' },
                    ':distribution/',
                    { Ref: this.provider.naming.getCloudFrontDistributionLogicalId() },
                  ],
                ],
              },
            },
          };
          return Object.assign(permissions, {
            [invokePermissionName]: invokePermission,
          });
        },
        {}
      );

      Object.assign(Resources, lambdaInvokePermissions);

      if (!Resources.IamRoleLambdaExecution) {
        this.serverless.cli.log(
          chalk.magenta('Remember to add required lambda@edge permissions to your execution role.')
        );
        this.serverless.cli.log(
          chalk.magenta(
            'https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-edge-permissions.html'
          )
        );
      } else {
        const lambdaAssumeStatement = Resources.IamRoleLambdaExecution.Properties.AssumeRolePolicyDocument.Statement.find(
          statement => statement.Principal.Service.includes('lambda.amazonaws.com')
        );
        if (lambdaAssumeStatement) {
          lambdaAssumeStatement.Principal.Service.push('edgelambda.amazonaws.com');
        }

        // Lambda creates CloudWatch Logs log streams
        // in the CloudWatch Logs regions closest
        // to the locations where the function is executed.
        // The format of the name for each log stream is
        // /aws/lambda/us-east-1.function-name where
        // function-name is the name that you gave
        // to the function when you created it.
        Resources.IamRoleLambdaExecution.Properties.Policies[0].PolicyDocument.Statement.push({
          Effect: 'Allow',
          Action: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
          Resource: ['arn:aws:logs:*:*:*'],
        });
      }

      const CacheBehaviors = behaviors.slice(1);

      const CloudFrontDistribution = {
        Type: 'AWS::CloudFront::Distribution',
        Properties: {
          DistributionConfig: {
            Comment: `${this.serverless.service.service} ${this.serverless.service.provider.stage}`,
            Enabled: true,
            DefaultCacheBehavior: behaviors[0],
            Origins: origins,
          },
        },
      };

      if (CacheBehaviors.length > 0) {
        Object.assign(CloudFrontDistribution.Properties.DistributionConfig, { CacheBehaviors });
      }

      Object.assign(Resources, { [this.cloudFrontDistributionLogicalId]: CloudFrontDistribution });

      _.merge(Outputs, {
        [this.cloudFrontDistributionLogicalId]: {
          Description: 'CloudFront Distribution Id',
          Value: {
            Ref: this.provider.naming.getCloudFrontDistributionLogicalId(),
          },
        },
        [this.cloudFrontDistributionDomainNameLogicalId]: {
          Description: 'CloudFront Distribution Domain Name',
          Value: {
            'Fn::GetAtt': [this.provider.naming.getCloudFrontDistributionLogicalId(), 'DomainName'],
          },
        },
      });
    }
  }
}

module.exports = AwsCompileCloudFrontEvents;
