'use strict';

const path = require('path');
const _ = require('lodash');
const BbPromise = require('bluebird');

module.exports = {
  createFunctions() {
    const createFunctionPromises = [];

    this.serverless.service.getAllFunctions().forEach((functionName) => {
      const functionObject = this.serverless.service.getFunction(functionName);

      this.serverless.cli
        .log(`Creating function "${functionName}"…`);

      const project = process.env.GCLOUD_PROJECT;
      const region = this.options.region;
      const bucketName = this.deploymentBucketName;
      const artifactDirectoryName = this.serverless.service.package.artifactDirectoryName;
      const artifactName = this.serverless.service.package.artifact.split(path.sep).pop();
      const handler = functionObject.handler;

      // right now only one event per function is supported
      const eventType = Object.keys(functionObject.events[0])[0];

      let event;

      if (eventType === 'http') {
        event = {
          httpsTrigger: {
            url: `https://${region}-${project}.cloudfunctions.net/${handler}`,
          },
        };
      } else if (eventType === 'pubSub') {
        event = {
          pubsubTrigger: `projects/${project}/topics/${functionObject.events[0].pubSub}`,
        };
      } else if (eventType === 'bucket') {
        event = {
          gcsTrigger: `gs://${functionObject.events[0].bucket}/`,
        };
      } else {
        const errorMessage = [
          `Invalid event type for the function "${functionName}".`,
          ' supported event types are "http", "pusSub" or "bucket".',
          ' Please check the docs for more info.',
        ].join('');
        throw new this.serverless.classes.Error(errorMessage);
      }

      const params = {
        location: `projects/${project}/locations/${region}`,
        resource: {
          gcsUrl: `gs://${bucketName}/${artifactDirectoryName}/${artifactName}`,
          entryPoint: handler,
          name: `projects/${project}/locations/${region}/functions/${functionName}`,
        },
      };

      _.merge(params.resource, event);

      createFunctionPromises.push(this.provider.request('functions', 'create', params));
    });

    return BbPromise.all(createFunctionPromises);
  },
};
