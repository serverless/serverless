'use strict';

const _ = require('lodash');
const { getPlatformClientWithAccessKey } = require('../client-utils');
const platformClientVersion = require('@serverless/platform-client/package').version;

module.exports = class {
  constructor() {
    this.data = {
      /*
       * Versions
       */

      versionFramework: null,
      versionEnterprisePlugin: null,
      versionSDK: platformClientVersion,

      /*
       * Service Data
       * - Standard service data
       */

      serverlessFile: null,
      serverlessFileName: null,
      tenantUid: null,
      appUid: null,
      tenantName: null,
      appName: null,
      serviceName: null,
      stageName: null,
      regionName: null,

      // the arn generated for fetching constructed logs
      logsRoleArn: null,

      status: null, // success OR errror
      error: null,

      // IF ARCHIVED... everything below this will be null
      archived: false,

      /*
       * App Data
       * - Provider, functions, subscriptions, resources, etc...
       * - Function-defaults in `provider` will be replicated across each function
       */

      provider: { type: 'aws' },

      functions: {},
      subscriptions: [],
      resources: {},
      layers: {},
      plugins: [],
      safeguards: [],
      secrets: [],
      outputs: {},
      custom: {},
    };
  }

  get() {
    return this.data;
  }

  set(data) {
    _.merge(this.data, data);
    return this.data;
  }

  setFunction(data) {
    if (!data.name) {
      throw new Error("function 'name' is required");
    }

    const fn = {
      // Non-provider-specific data goes here
      name: null,
      description: null,
      type: 'awsLambda',
      timeout: null,
      // Provider-specific data goes here
      custom: {
        handler: null,
        memorySize: null,
        runtime: null,
        role: null,
        onError: null,
        awsKmsKeyArn: null,

        tags: {},

        vpc: {
          securityGroupIds: [],
          subnetIds: [],
        },

        layers: [],
      },
    };

    this.data.functions[data.name] = _.merge(fn, data);
    return this.data.functions[data.name];
  }

  setSubscription(data) {
    if (!data.type) {
      throw new Error("subscription 'type' is required");
    }
    if (!data.function) {
      throw new Error("subscription 'function' is required");
    }
    if (!this.data.functions[data.function]) {
      throw new Error(
        "subscription 'function' must be added to the deployment before subscriptions"
      );
    }

    const sub = {
      // Non-provider-specific data goes here
      type: null,
      function: null,
      // Provider-specific data goes here
      custom: {},
    };

    // Add custom subscription properties per event type
    switch (data.type) {
      case 'aws.apigateway.http':
        sub.custom.path = null;
        sub.custom.method = null;
        sub.custom.restApiId = null;
        sub.custom.cors = false;
        break;
      default:
        break;
    }

    _.merge(sub, data);
    this.data.subscriptions.push(sub);

    return sub;
  }

  async save() {
    const sdk = await getPlatformClientWithAccessKey(this.data.tenantName);

    await sdk.frameworkDeployments.create({
      orgName: this.data.tenantName,
      appName: this.data.appName,
      serviceName: this.data.serviceName,
      stageName: this.data.stageName,
      regionName: this.data.regionName,
      deploymentData: this.data,
    });
  }
};
