'use strict';

const path = require('path');
const BbPromise = require('bluebird');

module.exports = {
  create() {
    this.serverless.cli.log('Creating Stack...');
    const stackName = `${this.serverless.service.service}-${this.options.stage}`;
    const coreCloudFormationTemplate = this.loadCoreCloudFormationTemplate();

    const params = {
      StackName: stackName,
      OnFailure: 'DELETE',
      Capabilities: [
        'CAPABILITY_IAM',
      ],
      Parameters: [],
      TemplateBody: JSON.stringify(coreCloudFormationTemplate),
      Tags: [{
        Key: 'STAGE',
        Value: this.options.stage,
      }],
    };

    return this.sdk.request('CloudFormation',
      'createStack',
      params,
      this.options.stage,
      this.options.region);
  },

  createStack() {
    const stackName = `${this.serverless.service.service}-${this.options.stage}`;

    this.serverless.service.provider
      .compiledCloudFormationTemplate = this.loadCoreCloudFormationTemplate();

    return BbPromise.bind(this)
      // always write the template to disk, whether we are deploying or not
      .then(this.writeCreateTemplateToDisk)
      .then(() => {
        if (this.options.noDeploy) {
          return BbPromise.resolve();
        }

        return this.sdk.request('CloudFormation',
          'describeStackResources',
          { StackName: stackName },
          this.options.stage,
          this.options.region)
          .then(() => BbPromise.resolve('alreadyCreated'))
          .catch(e => {
            if (e.message.indexOf('does not exist') > -1) {
              return BbPromise.bind(this)
                .then(this.create);
            }

            throw new this.serverless.classes.Error(e);
          });
      });
  },

  // helper methods
  loadCoreCloudFormationTemplate() {
    return this.serverless.utils.readFileSync(
      path.join(this.serverless.config.serverlessPath,
        'plugins',
        'aws',
        'deploy',
        'lib',
        'core-cloudformation-template.json')
    );
  },

  writeCreateTemplateToDisk() {
    const cfTemplateFilePath = path.join(this.serverless.config.servicePath,
      '.serverless', 'cloudformation-template-create-stack.json');

    this.serverless.utils.writeFileSync(cfTemplateFilePath,
      this.serverless.service.provider.compiledCloudFormationTemplate);

    return BbPromise.resolve();
  },
};
