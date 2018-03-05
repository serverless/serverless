'use strict';

const _ = require('lodash');
const url = require('url');
const chalk = require('chalk');


class AwsCompileCloudFrontEvents {
  constructor(serverless) {
    this.serverless = serverless;
    this.provider = this.serverless.getProvider('aws');
    this.hooks = {
      'before:package:compileFunctions': this.prepareFunctions.bind(this),
      'package:compileEvents': this.compileCloudFrontEvents.bind(this),
    };
  }

  prepareFunctions() {
    // force Lambda@Edge functions to be versioned
    this.serverless.service.getAllFunctions().forEach((functionName) => {
      const functionObj = this.serverless.service.getFunction(functionName);
      if (_.find(functionObj.events, event => _.has(event, 'cloudFront'))) {
        _.merge(functionObj, { versionFunction: true });
      }
    });
  }

  compileCloudFrontEvents() {
    this.cloudFrontDistributionLogicalId =
      this.provider.naming.getCloudFrontDistributionLogicalId();

    this.cloudFrontDistributionDomainNameLogicalId =
      this.provider.naming.getCloudFrontDistributionDomainNameLogicalId();

    const lambdaAtEdgeFunctions = [];

    const origins = [];
    const behaviors = [];

    const Resources = this.serverless.service.provider.compiledCloudFormationTemplate.Resources;
    const Outputs = this.serverless.service.provider.compiledCloudFormationTemplate.Outputs;

    // helper function for joining origins and behaviors
    function extendDeep(object, source) {
      return _.assignWith(object, source, (a, b) => {
        if (_.isArray(a)) {
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
        _.merge(originObj, {
          DomainName: originUrl.hostname,
        });

        if (originUrl.pathname && originUrl.pathname.length > 1) {
          _.merge(originObj, { OriginPath: originUrl.pathname });
        }

        if (originUrl.protocol === 's3:') {
          _.merge(originObj, { S3OriginConfig: {} });
        } else {
          _.merge(originObj, {
            CustomOriginConfig: {
              OriginProtocolPolicy: 'match-viewer',
            },
          });
        }
      } else {
        _.merge(originObj, origin);
      }

      _.merge(originObj, {
        Id: naming.getCloudFrontOriginId(functionName, originObj.OriginPath),
      });
      return originObj;
    }

    this.serverless.service.getAllFunctions().forEach((functionName) => {
      const functionObj = this.serverless.service.getFunction(functionName);
      if (functionObj.events) {
        functionObj.events.forEach(event => {
          if (event.cloudFront) {
            if (_.isObject(event.cloudFront) === false || _.isArray(event.cloudFront)) {
              throw new Error('cloudFront event has to be an object');
            }
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

            let origin =
              createOrigin(functionName, event.cloudFront.origin, this.provider.naming);

            const existingOrigin =
              _.find(origins, o => o.OriginPath === origin.OriginPath);

            if (_.isUndefined(existingOrigin)) {
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
              LambdaFunctionAssociations: [{
                EventType: event.cloudFront.eventType,
                LambdaFunctionARN: {
                  Ref: lambdaVersionLogicalId,
                },
              }],
            };

            if (!_.isUndefined(pathPattern)) {
              _.merge(behavior, { PathPattern: pathPattern });
            }

            const existingBehaviour =
              _.find(behaviors, o =>
                o.PathPattern === behavior.PathPattern
                  && o.TargetOriginId === behavior.TargetOriginId);

            if (_.isUndefined(existingBehaviour)) {
              behaviors.push(behavior);
            } else {
              behavior = extendDeep(existingBehaviour, behavior);
            }

            lambdaAtEdgeFunctions.push(_.merge({},
              functionObj, { functionName, lambdaVersionLogicalId }));
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

    if (!_.isEmpty(lambdaAtEdgeFunctions)) {
      if (this.provider.getRegion() !== 'us-east-1') {
        throw new
          Error('CloudFront associated functions have to be deployed to the us-east-1 region.');
      }

      const lambdaInvokePermissions =
        lambdaAtEdgeFunctions.reduce((permissions, lambdaAtEdgeFunction) => {
          const invokePermissionName =
            this.provider.naming
              .getLambdaAtEdgeInvokePermissionLogicalId(lambdaAtEdgeFunction.functionName);
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
                  ['', 'arn:aws:cloudfront::',
                    { Ref: 'AWS::AccountId' },
                    ':distribution/',
                    { Ref: this.provider.naming.getCloudFrontDistributionLogicalId() }],
                ],
              },
            },
          };
          return Object.assign(permissions, {
            [invokePermissionName]: invokePermission,
          });
        }, {});

      _.merge(Resources, lambdaInvokePermissions);

      if (_.isUndefined(Resources.IamRoleLambdaExecution)) {
        this.serverless.cli
          .log(chalk
            .magenta('Remember to add required lambda@edge permissions to your execution role.'));
        this.serverless.cli
          .log(chalk
            .magenta('https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-edge-permissions.html'));
      } else {
        const lambdaAssumeStatement = _.find(Resources
          .IamRoleLambdaExecution
          .Properties
          .AssumeRolePolicyDocument
          .Statement, statement =>
            _.includes(statement.Principal.Service, 'lambda.amazonaws.com'));
        if (!_.isUndefined(lambdaAssumeStatement)) {
          lambdaAssumeStatement.Principal.Service.push('edgelambda.amazonaws.com');
        }

        // Lambda creates CloudWatch Logs log streams
        // in the CloudWatch Logs regions closest
        // to the locations where the function is executed.
        // The format of the name for each log stream is
        // /aws/lambda/us-east-1.function-name where
        // function-name is the name that you gave
        // to the function when you created it.
        _.first(Resources
          .IamRoleLambdaExecution
          .Properties
          .Policies)
            .PolicyDocument
            .Statement.push({
              Effect: 'Allow',
              Action: [
                'logs:CreateLogGroup',
                'logs:CreateLogStream',
                'logs:PutLogEvents',
              ],
              Resource: [
                'arn:aws:logs:*:*:*',
              ],
            });
      }

      const CacheBehaviors =
        behaviors.slice(1);

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
        _.merge(CloudFrontDistribution.Properties.DistributionConfig, { CacheBehaviors });
      }

      _.merge(Resources, { [this.cloudFrontDistributionLogicalId]: CloudFrontDistribution });

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
