'use strict';

const _ = require('lodash');

class AwsCompileSNSEvents {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.provider = this.serverless.getProvider('aws');
    this.options = options;
    this.hooks = {
      'package:compileEvents': this.compileSNSEvents.bind(this),
    };
  }

  invalidPropertyErrorMessage(functionName, property) {
    return [
      `Missing or invalid ${property} property for sns event`,
      ` in function "${functionName}"`,
      ' The correct syntax is: sns: topic-name-or-arn',
      ' OR an object with ',
      ' arn and topicName OR',
      ' topicName and displayName.',
      ' Please check the docs for more info.',
    ].join('');
  }

  isValidStackImport(variable) {
    if (Object.keys(variable).length !== 1) {
      return false;
    }
    if (
      _.has(variable, 'Fn::ImportValue') &&
      (_.has(variable, 'Fn::ImportValue.Fn::GetAtt') || _.has(variable, 'Fn::ImportValue.Ref'))
    ) {
      return false;
    }
    const intrinsicFunctions = ['Fn::ImportValue', 'Ref', 'Fn::GetAtt', 'Fn::Sub', 'Fn::Join'];
    return !!_.find(intrinsicFunctions, func => _.has(variable, func));
  }

  compileSNSEvents() {
    const template = this.serverless.service.provider.compiledCloudFormationTemplate;

    this.serverless.service.getAllFunctions().forEach(functionName => {
      const functionObj = this.serverless.service.getFunction(functionName);

      if (functionObj.events) {
        functionObj.events.forEach(event => {
          if (event.sns) {
            let topicArn;
            let topicName;
            let region;
            let displayName = '';
            if (typeof event.sns === 'object') {
              if (event.sns.arn) {
                topicArn = event.sns.arn;
                if (typeof topicArn === 'object') {
                  if (!this.isValidStackImport(topicArn)) {
                    throw new this.serverless.classes.Error(
                      this.invalidPropertyErrorMessage(functionName, 'arn')
                    );
                  }
                } else if (typeof topicArn === 'string') {
                  if (topicArn.indexOf('arn:') === 0) {
                    // NOTE: we need to process the topic ARN that way due to lacking
                    // support of regex lookbehind in Node.js 6.
                    // Once Node.js 6 support is dropped we can change this to:
                    // `const splitArn = topicArn.split(/(?<!:):(?!:)/);`
                    const splitArn = topicArn
                      .replace(/::/g, '@@')
                      .split(':')
                      .map(s => s.replace(/@@/g, '::'));
                    topicName = splitArn[splitArn.length - 1];
                    if (splitArn[3] !== this.options.region) {
                      region = splitArn[3];
                    }
                  } else {
                    throw new this.serverless.classes.Error(
                      this.invalidPropertyErrorMessage(functionName, 'arn')
                    );
                  }
                } else {
                  throw new this.serverless.classes.Error(
                    this.invalidPropertyErrorMessage(functionName, 'arn')
                  );
                }
                topicName = event.sns.topicName || topicName;
                if (!topicName || typeof topicName !== 'string') {
                  throw new this.serverless.classes.Error(
                    this.invalidPropertyErrorMessage(functionName, 'topicName')
                  );
                }
              } else {
                ['topicName', 'displayName'].forEach(property => {
                  if (typeof event.sns[property] === 'string') {
                    return;
                  }
                  throw new this.serverless.classes.Error(
                    this.invalidPropertyErrorMessage(functionName, property)
                  );
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
                ' OR an object with ',
                ' arn and topicName OR',
                ' topicName and displayName.',
                ' Please check the docs for more info.',
              ].join('');
              throw new this.serverless.classes.Error(errorMessage);
            }

            const lambdaLogicalId = this.provider.naming.getLambdaLogicalId(functionName);

            const endpoint = {
              'Fn::GetAtt': [lambdaLogicalId, 'Arn'],
            };

            const subscriptionLogicalId = this.provider.naming.getLambdaSnsSubscriptionLogicalId(
              functionName,
              topicName
            );

            if (topicArn) {
              _.merge(template.Resources, {
                [subscriptionLogicalId]: {
                  Type: 'AWS::SNS::Subscription',
                  Properties: {
                    TopicArn: topicArn,
                    Protocol: 'lambda',
                    Endpoint: endpoint,
                    FilterPolicy: event.sns.filterPolicy,
                    Region: region,
                  },
                },
              });
            } else {
              topicArn = {
                'Fn::Join': [
                  '',
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

              const topicLogicalId = this.provider.naming.getTopicLogicalId(topicName);

              const subscription = {
                Endpoint: endpoint,
                Protocol: 'lambda',
              };

              if (!(topicLogicalId in template.Resources)) {
                _.merge(template.Resources, {
                  [topicLogicalId]: {
                    Type: 'AWS::SNS::Topic',
                    Properties: {
                      TopicName: topicName,
                      DisplayName: displayName,
                    },
                  },
                });
              }

              if (event.sns.filterPolicy) {
                _.merge(template.Resources, {
                  [subscriptionLogicalId]: {
                    Type: 'AWS::SNS::Subscription',
                    Properties: _.merge(subscription, {
                      TopicArn: {
                        Ref: topicLogicalId,
                      },
                      FilterPolicy: event.sns.filterPolicy,
                    }),
                  },
                });
              } else {
                if (!template.Resources[topicLogicalId].Properties.Subscription) {
                  template.Resources[topicLogicalId].Properties.Subscription = [];
                }
                template.Resources[topicLogicalId].Properties.Subscription.push(subscription);
              }
            }

            const lambdaPermissionLogicalId = this.provider.naming.getLambdaSnsPermissionLogicalId(
              functionName,
              topicName
            );

            _.merge(template.Resources, {
              [lambdaPermissionLogicalId]: {
                Type: 'AWS::Lambda::Permission',
                Properties: {
                  FunctionName: endpoint,
                  Action: 'lambda:InvokeFunction',
                  Principal: 'sns.amazonaws.com',
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
