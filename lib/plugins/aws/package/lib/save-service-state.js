'use strict';

const path = require('path');
const _ = require('lodash');
const findReferences = require('../../utils/find-references');

module.exports = {
  async saveServiceState() {
    const serviceStateFileName = this.provider.naming.getServiceStateFileName();

    const serviceStateFilePath = path.join(
      this.serverless.serviceDir,
      '.serverless',
      serviceStateFileName
    );

    const artifact = _.last(_.get(this.serverless.service, 'package.artifact', '').split(path.sep));

    // TODO: Store `serverless.configurationInput` without any tweaks and strips
    // (probably should be considered as breaking change)
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

    if (this.console.isEnabled) {
      state.console = {
        schemaVersion: this.console.stateSchemaVersion,
        otelIngestionToken: await this.console.deferredOtelIngestionToken,
        layerVersion: this.console.layerVersion,
        service: this.console.service,
        stage: this.console.stage,
        region: this.console.region,
        orgId: this.console.orgId,
      };
    }

    this.serverless.utils.writeFileSync(serviceStateFilePath, state, true);
  },
};
