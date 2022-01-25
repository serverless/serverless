'use strict';

const path = require('path');
const _ = require('lodash');
const findReferences = require('../../utils/find-references');

module.exports = {
  saveServiceState() {
    const serviceStateFileName = this.provider.naming.getServiceStateFileName();

    const serviceStateFilePath = path.join(
      this.serverless.serviceDir,
      '.serverless',
      serviceStateFileName
    );

    const artifact = _.last(_.get(this.serverless.service, 'package.artifact', '').split(path.sep));

    const strippedService = Object.assign(
      {},
      _.omit(this.serverless.service, ['serverless', 'package'])
    );
    const selfReferences = findReferences(strippedService, this.serverless.service);
    selfReferences.forEach((refPath) => _.set(strippedService, refPath, '${self:}'));

    const state = {
      service: strippedService,
      package: {
        individually: this.serverless.service.package.individually,
        artifactDirectoryName: this.serverless.service.package.artifactDirectoryName,
        artifact,
      },
    };

    this.serverless.utils.writeFileSync(serviceStateFilePath, state, true);
  },
};
