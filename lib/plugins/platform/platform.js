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
    this.config = {
      app: this.serverless.service.app,
      tenant: this.serverless.service.tenant,
    };

    // NOTE for the time being we only track services published to AWS
    if (this.provider) {
      this.hooks = {
        'after:deploy:finalize': this.publishService.bind(this),
        'after:remove:remove': this.archiveService.bind(this),
      };
    }
  }

  publishService() {
    if (!isLoggedIn()) {
      return BbPromise.resolve();
    }

    return getAccessKey(this.config.tenant).then(accessKey => {
      if (!accessKey || !this.config.app || !this.config.tenant) {
        return BbPromise.resolve();
      }
      this.serverless.cli.log('Publishing service to Serverless Platform...');

      return this.provider.getAccountId().then(accountId => {
        const service = this.serverless.service;

        const data = {
          app: this.config.app,
          tenant: this.config.tenant,
          accessKey,
          version: '0.1.0',
          service: this.getServiceData(),
          functions: [],
          subscriptions: [],
        };

        data.service.provider.accountId = accountId;

        Object.keys(service.functions).forEach(fn => {
          const fnData = {
            functionId: this.serverless.service.getFunction(fn).name,
            details: {
              runtime: service.functions[fn].runtime,
              memory: service.functions[fn].memory,
              timeout: service.functions[fn].timeout,
            },
            package: {
              handler: service.functions[fn].handler,
              name: service.functions[fn].name,
              arn: `arn:aws:lambda:${data.service.provider.region}:${
                data.service.provider.accountId}:function:${
                this.serverless.service.getFunction(fn).name}`,
            },
          };
          data.functions.push(fnData);
          this.serverless.service.getAllEventsInFunction(fn).forEach(event => {
            const subscription = {
              functionId: this.serverless.service.getFunction(fn).name,
            };

            if (Object.keys(event)[0] === 'eventgateway') {
              if (event.eventgateway.event === 'http') {
                subscription.type = 'com.serverless.http';
              } else {
                subscription.type = event.eventgateway.event;
              }
              subscription.event = event.eventgateway;
            } else if (Object.keys(event)[0] === 'http') {
              subscription.type = 'aws.apigateway.http';
              subscription.event = event.http;
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
              if (typeof event.s3 === 'string') {
                subscription.type = 'aws.s3.ObjectCreated';
              } else if (typeof event.s3 === 'object') {
                subscription.type = this.getS3Type(event.s3.event);
              }
              subscription.event = event.s3;
            } else if (Object.keys(event)[0] === 'schedule') {
              subscription.type = 'aws.cloudwatch.scheduled';
              subscription.event = event.schedule;
            } else if (Object.keys(event)[0] === 'sns') {
              subscription.type = 'aws.sns';
              subscription.event = event.sns;
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
            data.subscriptions.push(subscription);
          });
        });

        return platform.publishService(data)
          .then((serviceUrl) => {
            this.serverless.cli
              .log('Successfully published your service on the Serverless Platform');
            this.serverless.cli.log(`Service URL:  ${serviceUrl}`);
          })
          .catch(() => {
            this.serverless.cli.log('Failed to publish your service on the Serverless Platform');
          });
      });
    });
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

  archiveService() {
    if (!isLoggedIn()) {
      return BbPromise.resolve();
    }

    if (!this.config.tenant && !this.config.app) {
      this.serverless.cli.log('WARNING: Missing "tenant" and "app" properties in serverless.yml');
    } else if (this.config.tenant && !this.config.app) {
      const errorMessage = ['Missing "app" property in serverless.yml'].join('');
      throw new this.serverless.classes.Error(errorMessage);
    } else if (!this.config.tenant && this.config.app) {
      const errorMessage = ['Missing "tenant" property in serverless.yml'].join('');
      throw new this.serverless.classes.Error(errorMessage);
    }

    return getAccessKey(this.config.tenant).then(accessKey => {
      if (!accessKey || !this.config.app || !this.config.tenant) {
        return BbPromise.resolve();
      }
      const data = {
        name: this.serverless.service.service,
        tenant: this.config.tenant,
        app: this.config.app,
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
