'use strict';

const _ = require('lodash');
const path = require('path');
const BbPromise = require('bluebird');

module.exports = {
  update() {
    const templateUrl = `https://s3.amazonaws.com/${
        this.bucketName
      }/${
        this.serverless.service.package.artifactDirectoryName
      }/compiled-cloudformation-template.json`;

    this.serverless.cli.log('Updating Stack…');
    const stackName = `${this.serverless.service.service}-${this.options.stage}`;
    let stackTags = { STAGE: this.options.stage };

    // Merge additional stack tags
    if (typeof this.serverless.service.provider.stackTags === 'object') {
      stackTags = _.extend(stackTags, this.serverless.service.provider.stackTags);
    }

    const params = {
      StackName: stackName,
      Capabilities: [
        'CAPABILITY_IAM',
      ],
      Parameters: [],
      TemplateURL: templateUrl,
      Tags: Object.keys(stackTags).map((key) => ({ Key: key, Value: stackTags[key] })),
    };

    // Policy must have at least one statement, otherwise no updates would be possible at all
    if (this.serverless.service.provider.stackPolicy &&
        this.serverless.service.provider.stackPolicy.length) {
      params.StackPolicyBody = JSON.stringify({
        Statement: this.serverless.service.provider.stackPolicy,
      });
    }

    return this.provider.request('CloudFormation',
      'updateStack',
      params,
      this.options.stage,
      this.options.region);
  },

  updateStack() {
    // just write the template to disk if a deployment should not be performed
    return BbPromise.bind(this)
      .then(this.writeUpdateTemplateToDisk)
      .then(() => {
        if (this.options.noDeploy) {
          return BbPromise.resolve();
        }
        return BbPromise.bind(this)
          .then(this.update);
      });
  },

  // helper methods
  writeUpdateTemplateToDisk() {
    const cfTemplateFilePath = path.join(this.serverless.config.servicePath,
      '.serverless', 'cloudformation-template-update-stack.json');

    this.serverless.utils.writeFileSync(cfTemplateFilePath,
      this.serverless.service.provider.compiledCloudFormationTemplate);

    return BbPromise.resolve();
  },
};
