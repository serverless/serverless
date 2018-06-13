'use strict';

/* eslint-disable no-console */

const BbPromise = require('bluebird');
const crypto = require('crypto');
const _ = require('lodash');
const platform = require('@serverless/platform-sdk');
const getAccessKey = require('../../utils/getAccessKey');

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
        'after:deploy:deploy': this.publishService.bind(this),
        'after:remove:remove': this.archiveService.bind(this),
      };
    }
  }

  publishService() {
    return getAccessKey(this.config.tenant).then(accessKey => {
      if (!accessKey || !this.config.app || !this.config.tenant) {
        return BbPromise.resolve();
      }

      this.serverless.cli.log('Publishing service to Serverless Platform...');

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

      Object.keys(service.functions).forEach(fn => {
        const fnObj = _.omit(service.functions[fn], ['events']);
        fnObj.functionId = this.serverless.service.getFunction(fn).name;
        data.functions.push(fnObj);

        this.serverless.service.getAllEventsInFunction(fn).forEach(event => {
          const subscription = {
            functionId: this.serverless.service.getFunction(fn).name,
          };

          // in case of sls custom event type...
          if (typeof event === 'string') {
            subscription.type = event;
            subscription.subscriptionId = crypto.createHash('md5')
              .update(`${subscription.functionId}-${event}`).digest('hex');
            // in case of aws apigateway
          } else if (Object.keys(event)[0] === 'http') {
            subscription.type = 'aws.apigateway.http';
            if (typeof event.http === 'string') {
              // todo http shortcut
            } else if (typeof event.http === 'object') {
              subscription.method = event.http.method;
              subscription.path = event.http.path;
              subscription.subscriptionId = crypto.createHash('md5')
                .update(JSON.stringify(subscription)).digest('hex');
            }
          }
          // todo support aws events and http
          data.subscriptions.push(subscription);
        });
      });

      return new BbPromise((resolve, reject) => {
        platform.publishService(data)
          .then(() => {
            this.serverless.cli
              .log('Successfully published your service on the Serverless Platform');
            resolve();
            process.exit(0);
          })
          .catch(err => {
            this.serverless.cli.log('Failed to published your service on the Serverless Platform');
            reject(err.message);
          });
      });
    });
  }

  getServiceData() {
    const serviceData = {
      name: this.serverless.service.service,
      stage: this.serverless.processedInput.options.stage
      || this.serverless.service.provider.stage,
      provider: this.serverless.service.provider,
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
          process.exit(0);
        })
        .catch(err => {
          this.serverless.cli.log('Failed to archived your service on the Serverless Platform');
          throw new this.serverless.classes.Error(err.message);
        });
    });
  }
}

module.exports = Platform;
