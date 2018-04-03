'use strict';

const _ = require('lodash');

class AwsCompileSNSEvents {
  constructor(serverless) {
    this.serverless = serverless;
    this.provider = this.serverless.getProvider('aws');

    this.hooks = {
      'package:compileEvents': this.compileSNSEvents.bind(this),
    };
  }

  compileSNSEvents() {
    const template = this.serverless.service.provider.compiledCloudFormationTemplate;

    this.serverless.service.getAllFunctions().forEach((functionName) => {
      const functionObj = this.serverless.service.getFunction(functionName);

      if (functionObj.events) {
        functionObj.events.forEach(event => {
          if (event.sns) {
            let topicArn;
            let topicName;
            let displayName = '';

            if (typeof event.sns === 'object') {
              if (event.sns.arn) {
                if (typeof event.sns.arn === 'object' ||
                  typeof event.sns.arn === 'string') {
                  if (event.sns.topicName && typeof event.sns.topicName === 'string') {
                    topicArn = event.sns.arn;
                    topicName = event.sns.topicName;
                  } else if (event.sns.arn.indexOf('arn:') === 0) {
                    topicArn = event.sns.arn;
                    const splitArn = topicArn.split(':');
                    topicName = splitArn[splitArn.length - 1];
                  } else {
                    const errorMessage = [
                      'Missing or invalid topicName property for sns event',
                      ` in function "${functionName}"`,
                      ' The correct syntax is: sns: topic-name-or-arn',
                      ' OR an object with ',
                      ' arn and topicName OR',
                      ' topicName and displayName.',
                      ' Please check the docs for more info.',
                    ].join('');
                    throw new this.serverless.classes
                      .Error(errorMessage);
                  }
                } else {
                  const errorMessage = [
                    'Invalid value type provided .arn property for sns event',
                    ` in function ${functionName}`,
                    ' The correct types are: object, string.',
                    ' Please check the docs for more info.',
                  ].join('');
                  throw new this.serverless.classes
                    .Error(errorMessage);
                }
              } else {
                ['topicName', 'displayName'].forEach((property) => {
                  if (typeof event.sns[property] === 'string') {
                    return;
                  }
                  const errorMessage = [
                    'Missing or invalid topicName property for sns event',
                    ` in function "${functionName}"`,
                    ' The correct syntax is: sns: topic-name-or-arn',
                    ' OR an object with ',
                    ' arn and topicName OR',
                    ' topicName and displayName.',
                    ' Please check the docs for more info.',
                  ].join('');
                  throw new this.serverless.classes
                    .Error(errorMessage);
                });
                displayName = event.sns.displayName;
                topicName = event.sns.topicName;
              }
            } else if (typeof event.sns === 'string') {
              if (event.sns.indexOf('arn:') === 0) {
                topicArn = event.sns;
                const splitArn = topicArn.split(':');
                topicName = splitArn[splitArn.length - 1];
              } else {
                topicName = event.sns;
              }
            } else {
              const errorMessage = [
                `SNS event of function ${functionName} is not an object nor a string`,
                ' The correct syntax is: sns: topic-name-or-arn',
                ' OR an object with "topicName" AND "displayName" properties.',
                ' Please check the docs for more info.',
              ].join('');
              throw new this.serverless.classes
                .Error(errorMessage);
            }

            const lambdaLogicalId = this.provider.naming
              .getLambdaLogicalId(functionName);

            const endpoint = {
              'Fn::GetAtt': [lambdaLogicalId, 'Arn'],
            };

            if (topicArn) {
              const subscriptionLogicalId = this.provider.naming
                .getLambdaSnsSubscriptionLogicalId(functionName, topicName);

              _.merge(template.Resources, {
                [subscriptionLogicalId]: {
                  Type: 'AWS::SNS::Subscription',
                  Properties: {
                    TopicArn: topicArn,
                    Protocol: 'lambda',
                    Endpoint: endpoint,
                  },
                },
              });
            } else {
              topicArn = {
                'Fn::Join': ['',
                  [
                    'arn:',
                    { Ref: 'AWS::Partition' },
                    ':sns:',
                    { Ref: 'AWS::Region' },
                    ':',
                    { Ref: 'AWS::AccountId' },
                    ':',
                    topicName,
                  ],
                ],
              };
              const topicLogicalId = this.provider.naming
                .getTopicLogicalId(topicName);

              const subscription = {
                Endpoint: endpoint,
                Protocol: 'lambda',
              };

              if (topicLogicalId in template.Resources) {
                template.Resources[topicLogicalId]
                  .Properties.Subscription.push(subscription);
              } else {
                _.merge(template.Resources, {
                  [topicLogicalId]: {
                    Type: 'AWS::SNS::Topic',
                    Properties: {
                      TopicName: topicName,
                      DisplayName: displayName,
                      Subscription: [subscription],
                    },
                  },
                });
              }
            }

            const lambdaPermissionLogicalId = this.provider.naming
              .getLambdaSnsPermissionLogicalId(functionName, topicName);

            _.merge(template.Resources, {
              [lambdaPermissionLogicalId]: {
                Type: 'AWS::Lambda::Permission',
                Properties: {
                  FunctionName: endpoint,
                  Action: 'lambda:InvokeFunction',
                  Principal: { 'Fn::Join': ['', ['sns.', { Ref: 'AWS::URLSuffix' }]] },
                  SourceArn: topicArn,
                },
              },
            });
          }
        });
      }
    });
  }
}

module.exports = AwsCompileSNSEvents;
