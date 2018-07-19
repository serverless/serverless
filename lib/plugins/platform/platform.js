'use strict';

/* eslint-disable no-console */

const BbPromise = require('bluebird');
const path = require('path');
const fs = require('fs');
const fsExtra = require('../../utils/fs/fse');
const crypto = require('crypto');
const platform = require('@serverless/platform-sdk');
const getAccessKey = require('../../utils/getAccessKey');
const isLoggedIn = require('../../utils/isLoggedIn');

class Platform {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = this.serverless.getProvider('aws');
    // NOTE for the time being we only track services published to AWS
    if (this.provider) {
      this.hooks = {
        'after:deploy:finalize': this.publishService.bind(this),
        'after:remove:remove': this.archiveService.bind(this),
      };
    }
  }

  getReadme() {
    const readmePath = path.join(this.serverless.config.servicePath, 'README.md');
    if (fs.existsSync(readmePath)) {
      return fsExtra.readFileSync(readmePath).toString('utf8');
    }
    return null;
  }

  getS3Type(s3Event) {
    const splittedS3Event = s3Event.split(':');
    if (splittedS3Event[1] === 'ReducedRedundancyLostObject') {
      return 'aws.s3.ReducedRedundancyLostObject';
    } else if (splittedS3Event[1] === 'ObjectCreated' || splittedS3Event[1] === 'ObjectRemoved') {
      if (splittedS3Event[2] === '*') {
        return `aws.s3.${splittedS3Event[1]}`;
      } else if (typeof splittedS3Event[2] === 'string') {
        return `aws.s3.${splittedS3Event[1]}.${splittedS3Event[2]}`;
      }
    }
    return `aws.s3.${splittedS3Event[1]}`;
  }

  getFunctionData(fn) {
    const fnData = {
      functionId: this.serverless.service.getFunction(fn).name,
      details: {
        runtime: this.serverless.service.functions[fn].runtime,
        memory: this.serverless.service.functions[fn].memory,
        timeout: this.serverless.service.functions[fn].timeout,
      },
      package: {
        handler: this.serverless.service.functions[fn].handler,
        name: this.serverless.service.functions[fn].name,
        arn: `arn:aws:lambda:${this.serverless.service.provider.region}:${
          this.data.service.provider.accountId}:function:${
          this.serverless.service.getFunction(fn).name}`,
      },
    };
    return fnData;
  }

  getServiceData() {
    const serviceData = {
      name: this.serverless.service.service,
      stage: this.serverless.processedInput.options.stage
      || this.serverless.service.provider.stage,
      provider: {
        name: this.serverless.service.provider.name,
        region: this.serverless.service.provider.region,
        accountId: this.serverless.service.provider.accountId,
      },
      pluginsData: this.serverless.service.pluginsData,
      readme: this.getReadme(),
    };
    if (this.serverless.service.serviceObject.description) {
      serviceData.description = this.serverless.service.serviceObject.description;
    }
    if (this.serverless.service.serviceObject.license) {
      serviceData.license = this.serverless.service.serviceObject.license;
    }
    if (this.serverless.service.serviceObject.bugs) {
      serviceData.bugs = this.serverless.service.serviceObject.bugs;
    }
    if (this.serverless.service.serviceObject.repository) {
      serviceData.repository = this.serverless.service.serviceObject.repository;
    }
    if (this.serverless.service.serviceObject.homepage) {
      serviceData.homepage = this.serverless.service.serviceObject.homepage;
    }
    return serviceData;
  }

  getScheduledSubscription(event, fn) {
    const provider = this.data.service.provider;
    const subscription = {
      functionId: this.serverless.service.getFunction(fn).name,
      type: 'aws.cloudwatch.scheduled',
      details: {
        function: this.serverless.service.getFunction(fn).name,
        source: 'AWS::CloudWatch::Scheduled',
      },
      provider,
      permissions: {
        type: 'aws IAM',
        action: 'lambda:InvokeFunction',
        sourceAccount: 'Amazon',
      },
    };
    if (typeof event === 'string') {
      subscription.details.rate = event;
      subscription.details.name = null;
      subscription.details.description = null;
    } else if (typeof event === 'object') {
      subscription.details.rate = event.rate;
      subscription.details.name = event.name;
      subscription.details.description = event.description;
    }
    subscription.event = event;
    return subscription;
  }

  getS3Subscription(event, fn) {
    const provider = this.data.service.provider;
    const subscription = {
      functionId: this.serverless.service.getFunction(fn).name,
      details: {
        function: this.serverless.service.getFunction(fn).name,
      },
      provider,
      permissions: {
        type: 'aws IAM',
        action: 'lambda:InvokeFunction',
        sourceAccount: 'Amazon',
      },
    };
    if (typeof event === 'string') {
      subscription.type = 'aws.s3.ObjectCreated';
      subscription.details.source = `AWS::S3::${event}`;
      subscription.details.bucket = event;
      subscription.details.event = 's3:ObjectCreated:*';
      subscription.details.rules = null;
      subscription.permissions.sourceArn = `arn:aws:s3:::${event}`;
    } else if (typeof event === 'object') {
      subscription.type = this.getS3Type(event.event);
      subscription.details.source = `AWS::S3::${event.bucket}`;
      subscription.details.bucket = event.bucket;
      subscription.details.event = event.event;
      subscription.details.rules = event.rules || null;
      subscription.permissions.sourceArn = `arn:aws:s3:::${event.bucket}`;
    }
    subscription.event = event;
    return subscription;
  }

  getSnsSubscription(event, fn) {
    // todo existing topic arn
    const provider = this.data.service.provider;
    const subscription = {
      functionId: this.serverless.service.getFunction(fn).name,
      type: 'aws.sns',
      details: {
        function: this.serverless.service.getFunction(fn).name,
      },
      provider,
      permissions: {
        type: 'aws IAM',
        action: 'lambda:InvokeFunction',
        sourceAccount: 'Amazon',
      },
    };

    if (typeof event === 'string') {
      subscription.details.source = `AWS::SNS::${event}`;
      subscription.details.topic = event;
      subscription.permissions.sourceArn = `arn:aws:sns:${this.provider.getRegion()
        }:${provider.accountId}:${event}`;
    } else if (typeof event === 'object') {
      subscription.details.source = `AWS::SNS::${event.topicName}`;
      subscription.details.topic = event.topicName;
      subscription.details.displayName = event.displayName;
      subscription.permissions.sourceArn = `arn:aws:sns:${this.provider.getRegion()
      }:${provider.accountId}:${event.topicName}`;
    }
    subscription.event = event;
    return subscription;
  }

  getEGSubscription(event, fn) {
    const subscription = {
      functionId: this.serverless.service.getFunction(fn).name,
      details: {
        function: this.serverless.service.getFunction(fn).name,
        type: event.type,
        app: this.data.app,
        service: this.data.service.name,
        stage: this.serverless.service.provider.stage,
      },
      provider: {
        name: 'Serverless',
        tenant: this.data.tenant,
      },
      properties: {
        name: event.eventType,
        service: this.data.service.name,
        stage: this.serverless.service.provider.stage,
      },
    };

    if (event.type === 'sync') {
      subscription.type = 'com.serverless.http';
      subscription.details.source = 'Sls::EventGateway::http';
      subscription.details.path = event.path;
      subscription.details.method = event.method;
    } else if (event.type === 'async') {
      subscription.type = event.eventType;
      subscription.details.source = 'sls/eventgateway/com';
    }
    subscription.event = event;
    return subscription;
  }

  getApigSubscription(event, fn) {
    const apiId = this.serverless.service.deployment.apiId;
    const provider = this.data.service.provider;
    const subscription = {
      functionId: this.serverless.service.getFunction(fn).name,
      type: 'aws.apigateway.http',
      details: {
        function: this.serverless.service.getFunction(fn).name,
        type: 'http',
        source: 'AWS::APIGateway::http',
        apiId,
      },
      provider,
      permissions: {
        type: 'aws IAM',
        action: 'lambda:InvokeFunction',
        sourceAccount: 'Amazon',
      },
    };

    if (event.cros) {
      subscription.details.cors = true;
    } else {
      subscription.details.cors = false;
    }
    if (event.integration === 'lambda') {
      subscription.details.lambdaProxy = false;
    } else {
      subscription.details.lambdaProxy = true;
    }

    if (typeof event === 'string') {
      subscription.details.method = event.split(' ')[0];
      subscription.details.path = event.split(' ')[1];
      subscription.permissions.sourceArn = this.provider
        .getMethodArn(provider.accountId, apiId, event.split(' ')[0], event.split(' ')[1]);
      subscription.details.cors = false;
      subscription.details.lambdaProxy = true;
    } else if (typeof event === 'object') {
      subscription.details.method = event.mathod;
      subscription.details.path = event.path;
      subscription.permissions.sourceArn = this.provider
        .getMethodArn(provider.accountId, apiId, event.method, event.path);
      if (event.cors) {
        subscription.details.cors = true;
      } else {
        subscription.details.cors = false;
      }
      if (event.integration === 'lambda') {
        subscription.details.lambdaProxy = false;
      } else {
        subscription.details.lambdaProxy = true;
      }
    }
    subscription.event = event;
    return subscription;
  }

  publishService() {
    if (!this.serverless.service.deployment.deploymentId) {
      return BbPromise.resolve();
    }
    this.serverless.cli.log('Publishing service to Serverless Platform...');

    return this.provider.getAccountId()
      .then(accountId => {
        const service = this.serverless.service;

        this.data = {
          app: this.serverless.service.app,
          tenant: this.serverless.service.tenant,
          accessKey: this.serverless.service.deployment.accessKey,
          version: '0.1.0',
          service: this.getServiceData(),
          functions: [],
          subscriptions: [],
        };

        this.data.service.provider.accountId = accountId;

        Object.keys(service.functions).forEach(fn => {
          const fnData = this.getFunctionData(fn);
          this.data.functions.push(fnData);
          this.serverless.service.getAllEventsInFunction(fn).forEach(event => {
            let subscription = {
              functionId: this.serverless.service.getFunction(fn).name,
              details: {},
              provider: this.data.service.provider,
              permissions: {},
            };

            if (Object.keys(event)[0] === 'eventgateway') {
              subscription = this.getEGSubscription(event.eventgateway, fn);
            } else if (Object.keys(event)[0] === 'http') {
              subscription = this.getApigSubscription(event.http, fn);
            } else if (Object.keys(event)[0] === 'stream') {
              if (typeof event.stream === 'string') {
                const streamType = event.stream.split(':')[2];
                subscription.type = `aws.${streamType}`;
              } else if (typeof event.stream === 'object') {
                if (event.stream.type === 'dynamodb') {
                  subscription.type = 'aws.dynamodb';
                } else if (event.stream.type === 'kinesis') {
                  subscription.type = 'aws.kinesis';
                }
              }
              subscription.event = event.stream;
            } else if (Object.keys(event)[0] === 's3') {
              subscription = this.getS3Subscription(event.s3, fn);
            } else if (Object.keys(event)[0] === 'schedule') {
              subscription = this.getScheduledSubscription(event.schedule, fn);
            } else if (Object.keys(event)[0] === 'sns') {
              subscription = this.getSnsSubscription(event.sns, fn);
            } else if (Object.keys(event)[0] === 'alexaSkill') {
              subscription.type = 'aws.alexa.skill';
              subscription.event = event.alexaSkill;
            } else if (Object.keys(event)[0] === 'iot') {
              subscription.type = 'aws.iot';
              subscription.event = event.iot;
            } else if (Object.keys(event)[0] === 'cloudwatchEvent') {
              subscription.type = 'aws.cloudwatch';
              subscription.event = event.cloudwatchEvent;
            } else if (Object.keys(event)[0] === 'cloudwatchLog') {
              subscription.type = 'aws.cloudwatch.log';
              subscription.event = event.cloudwatchLog;
            } else if (Object.keys(event)[0] === 'cognitoUserPool') {
              subscription.type = 'aws.cognito';
              subscription.event = event.cognitoUserPool;
            } else if (Object.keys(event)[0] === 'alexaSmartHome') {
              subscription.type = 'aws.alexa.home';
              subscription.event = event.alexaSmartHome;
            }

            subscription.subscriptionId = crypto.createHash('md5')
              .update(JSON.stringify(subscription)).digest('hex');
            this.data.subscriptions.push(subscription);
          });
        });

        console.log(JSON.stringify(this.data.subscriptions, null, 4));

        const deploymentData = this.serverless.service.deployment;
        deploymentData.status = 'Success';
        deploymentData.state = this.data;
        return platform.updateDeployment(deploymentData)
          .then((serviceUrl) => {
            this.serverless.cli
              .log('Successfully published your service on the Serverless Platform');
            this.serverless.cli.log(`Service URL:  ${serviceUrl}`);
          });
      });
  }

  archiveService() {
    if (!isLoggedIn()) {
      return BbPromise.resolve();
    }

    return getAccessKey(this.serverless.service.tenant).then(accessKey => {
      if (!accessKey || !this.serverless.service.app || !this.serverless.service.tenant) {
        return BbPromise.resolve();
      }
      const data = {
        name: this.serverless.service.service,
        tenant: this.serverless.service.tenant,
        app: this.serverless.service.app,
        accessKey,
      };
      return platform.archiveService(data)
        .then(() => {
          this.serverless.cli.log('Successfully archived your service on the Serverless Platform');
          // process.exit(0);
        })
        .catch(err => {
          this.serverless.cli.log('Failed to archived your service on the Serverless Platform');
          throw new this.serverless.classes.Error(err.message);
        });
    });
  }
}

module.exports = Platform;
