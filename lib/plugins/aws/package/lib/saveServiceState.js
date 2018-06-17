'use strict';

const BbPromise = require('bluebird');
const path = require('path');
const _ = require('lodash');
const findReferences = require('../../utils/findReferences');

module.exports = {
  saveServiceState() {
    const serviceStateFileName = this.provider.naming.getServiceStateFileName();

    const serviceStateFilePath = path.join(
      this.serverless.config.servicePath,
      '.serverless',
      serviceStateFileName
    );

    const artifact = _.last(
      _.split(
        _.get(this.serverless.service, 'package.artifact', ''), path.sep
      )
    );

    const strippedService = _.assign(
      {}, _.omit(this.serverless.service, ['serverless', 'package'])
    );
    const selfReferences = findReferences(strippedService, this.serverless.service);
    _.forEach(selfReferences, refPath => _.set(strippedService, refPath, '${self:}'));

    const state = {
      service: strippedService,
      package: {
        individually: this.serverless.service.package.individually,
        artifactDirectoryName: this.serverless.service.package.artifactDirectoryName,
        artifact,
      },
    };

    this.serverless.utils.writeFileSync(serviceStateFilePath, state, true);

    return BbPromise.resolve();
  },
};
