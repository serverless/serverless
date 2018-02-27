'use strict';

const _ = require('lodash');
const { URL } = require('url');
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

      return originObj;
    }

    this.serverless.service.getAllFunctions().forEach((functionName) => {
      const functionObj = this.serverless.service.getFunction(functionName);
      if (functionObj.events) {
        functionObj.events.forEach(event => {
          if (event.cloudFront) {
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
              functionObj, { functionName, lambdaVersionLogicalId }));
          }
        });
      }
    });

    if (lambdaAtEdgeFunctions.length > 0) {
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
          // cloudfront handles replication permissions automatically?
          // const replicatorPermissionName = logicalId+'ReplicatorPermission';
          // const replicatorPermission = {
          //   Type: 'AWS::Lambda::Permission',
          //   Properties: {
          //     Action: 'lambda:GetFunction',
          //     FunctionName: {
          //       Ref: lambdaAtEdgeFunction.lambdaVersionLogicalId,
          //       // 'Fn::GetAtt': [
          //       //   logicalId,
          //       //   'Arn',
          //       // ],
          //     },
          //     Principal: 'replicator.lambda.amazonaws.com',
          //     // SourceAccount: {
          //     //   Ref: 'AWS::AccountId',
          //     // },
          //     SourceArn: {
          //       'Fn::Join': [
          //         '',
          //         ['', 'arn:aws:cloudfront::',
          //           { Ref: 'AWS::AccountId' },
          //           ':distribution/',
          //           { Ref: this.provider.naming.getCloudFrontDistributionLogicalId() }],
          //       ],
          //     },
          //   },
          // };

          // const replicatorStatement = {
          //   Sid: 'replicatorLambdaAtEdge',
          //   Action: 'lambda:GetFunction',
          //   Principal: { Service: 'replicator.lambda.amazonaws.com' },
          //   Resource: {
          //     Ref: lambdaAtEdgeFunction.lambdaVersionLogicalId,
          //   },
          // };

          // const policy = {
          //   Type: 'AWS::IAM::Policy',
          //   Properties: {
          //     PolicyName: 'lambdaAtEdgePolicy',
          //     PolicyDocument: {
          //       Version: '2012-10-17',
          //       Statement: [
          //         replicatorStatement,
          //       ],
          //     },
          //     Roles: [
          //       { Ref: this.provider.naming.getRoleLogicalId() },
          //     ],
          //   },
          // };

          return Object.assign(permissions, {
            [invokePermissionName]: invokePermission,
          });
        }, {});

      _.merge(Resources, lambdaInvokePermissions);

      if (typeof Resources.IamRoleLambdaExecution === 'undefined') {
        this.serverless.cli
          .log(chalk
            .magenta('Remember to add "edgelambda.amazonaws.com" to your Lambda execution role'));
      } else {
        const lambdaAssumeStatement = _.find(Resources
          .IamRoleLambdaExecution
          .Properties
          .AssumeRolePolicyDocument
          .Statement, statement =>
            _.includes(statement.Principal.Service, 'lambda.amazonaws.com'));
        if (typeof lambdaAssumeStatement !== 'undefined') {
          lambdaAssumeStatement.Principal.Service.push('edgelambda.amazonaws.com');
        }
      }

      const CacheBehaviors =
        lambdaAtEdgeFunctions
          .filter(({ cloudFront }) => !!cloudFront.behavior.PathPattern)
          .map(({ cloudFront }) => cloudFront.behavior);

      const CloudFrontDistribution = {
        Type: 'AWS::CloudFront::Distribution',
        Properties: {
          DistributionConfig: {
            Comment: `${this.serverless.service.service} ${this.serverless.service.provider.stage}`,
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
