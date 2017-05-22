'use strict';

const CF = require('aws-sdk/clients/cloudformation');
const BbPromise = require('bluebird');
const _ = require('lodash');

module.exports = {
  validateCompiledTemplate() {
    const cf = new CF();
    BbPromise.promisifyAll(cf, { suffix: 'Promised' });

    const compiledTemplate = _.cloneDeep(
      this.serverless.service.provider.compiledCloudFormationTemplate);

    const params = {
      TemplateBody: JSON.stringify(compiledTemplate),
    };

    return cf.validateTemplatePromised(params)
      .then((data) => {
        this.serverless.service.provider.compiledCloudFormationTemplate = data;
      })
      .catch((error) => {
        throw new this.serverless.classes
          .Error([
            'The CloudFormation template is invalid. Please fix it.',
            ` ${error.message}`,
            ' Please check the docs for more info.',
          ].join(''));
      });
  },
};
