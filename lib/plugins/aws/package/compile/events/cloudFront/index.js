'use strict';

const _ = require('lodash');
const { URL } = require('url');

class AwsCompileCloudFrontEvents {
  constructor(serverless) {
    this.serverless = serverless;
    this.provider = this.serverless.getProvider('aws');
    this.hooks = {
      'package:compileEvents': this.compileCloudFrontEvents.bind(this),
    };
  }

  compileCloudFrontEvents() {
    const lambdaAtEdgeFunctions = [];
    const { Resources, Outputs } = this.serverless.service.provider.compiledCloudFormationTemplate;

    function createOrigin(functionName, origin, naming) {
      const originObj = {
        Id: naming.getNormalizedFunctionName(functionName),
      };
      if (typeof origin === 'string') {
        const originUrl = new URL(origin);
        _.merge(originObj, {
          DomainName: originUrl.hostname,
        });

        if (originUrl.pathname && originUrl.pathname.length > 0) {
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

      return originObj;
    }

    this.serverless.service.getAllFunctions().forEach((functionName) => {
      const functionObj = this.serverless.service.getFunction(functionName);
      if (functionObj.events) {
        functionObj.events.forEach(event => {
          if (event.cloudFront) {
            // console.log(event.cloudFront);
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

            const behavior = {
              ViewerProtocolPolicy: 'allow-all',
              TargetOriginId: this.provider.naming.getNormalizedFunctionName(functionName),
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

            if (typeof pathPattern !== undefined) {
              _.merge(behavior, { PathPattern: pathPattern });
            }

            const origin =
              createOrigin(functionName, event.cloudFront.origin, this.provider.naming);

            lambdaAtEdgeFunctions.push(_.merge({
              cloudFront: { origin, behavior } },
              functionObj));
          }
        });
      }
    });

    if (lambdaAtEdgeFunctions.length > 0) {
      if (this.provider.getRegion() !== 'us-east-1') {
        throw new Error('CloudFront triggered functions has to be deployed to the us-east-1 region.');
      }

      Resources
        .IamRoleLambdaExecution
        .Properties
        .AssumeRolePolicyDocument
        .Statement.push({
          Effect: 'Allow',
          Principal: {
            Service: ['edgelambda.amazonaws.com'],
          },
          Action: ['sts:AssumeRole'],
        });

      const CacheBehaviors =
        lambdaAtEdgeFunctions
          .filter(({ cloudFront }) => !!cloudFront.behavior.PathPattern)
          .map(({ cloudFront }) => cloudFront.behavior);

      const CloudFrontDistribution = {
        Type: 'AWS::CloudFront::Distribution',
        Properties: {
          DistributionConfig: {
            Enabled: true,
            DefaultCacheBehavior:
              lambdaAtEdgeFunctions
                .filter(({ cloudFront }) => !cloudFront.behavior.PathPattern)
                .map(({ cloudFront }) => cloudFront.behavior)[0],
            Origins: lambdaAtEdgeFunctions.map(({ cloudFront }) => cloudFront.origin),
          },
        },
      };

      if (typeof CacheBehaviors !== 'undefined') {
        _.merge(CloudFrontDistribution.Properties.DistributionConfig, { CacheBehaviors });
      }

      _.merge(Resources, { CloudFrontDistribution });

      _.merge(Outputs, {
        CloudFrontDistributionDomainName: {
          Description: 'CloudFront distribution domain name',
          Value: {
            'Fn::GetAtt': ['CloudFrontDistribution', 'DomainName'],
          },
        },
      });
    }
  }
}

module.exports = AwsCompileCloudFrontEvents;
