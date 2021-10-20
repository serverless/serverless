'use strict';

const BbPromise = require('bluebird');
const { flattenDeep, get } = require('lodash');
const { legacy, log } = require('@serverless/utils/log');

module.exports = {
  async disassociateUsagePlan() {
    console.log('disassociateUsagePlan');
    console.log('disassociateUsagePlan');
    console.log('disassociateUsagePlan');
    console.log('disassociateUsagePlan');
    console.log('disassociateUsagePlan');
    console.log('disassociateUsagePlan');

    const apiKeys =
      get(this.serverless.service.provider.apiGateway, 'apiKeys') ||
      this.serverless.service.provider.apiKeys;

    if (apiKeys && apiKeys.length) {
      legacy.log('Removing usage plan association...');
      log.info('Removing usage plan association');
      const stackName = `${this.provider.naming.getStackName()}`;
      const [describeStackResource, getUsagePlans] = await BbPromise.all([
        this.provider
          .request('CloudFormation', 'describeStackResource', {
            StackName: stackName,
            LogicalResourceId: this.provider.naming.getRestApiLogicalId(),
          })
          .catch((e) => {
            console.log('ERROROR!!');

            /**
             * If the stack cannot be found, assume it to be externally handled / removed.
             *
             * @see https://github.com/serverless/serverless/issues/7922
             */
            if (e.code === 'AWS_CLOUD_FORMATION_DESCRIBE_STACK_RESOURCE_VALIDATION_ERROR') {
              return null;
            }

            throw e;
          }),
        this.provider.request('APIGateway', 'getUsagePlans', {}),
      ]);

      if (!describeStackResource) return [];

      const items = getUsagePlans.items.filter((item) =>
        item.apiStages
          .map((apistage) => apistage.apiId)
          .includes(describeStackResource.StackResourceDetail.PhysicalResourceId)
      );

      return BbPromise.all(
        flattenDeep(
          items.map((item) =>
            item.apiStages.map((apiStage) =>
              this.provider.request('APIGateway', 'updateUsagePlan', {
                usagePlanId: item.id,
                patchOperations: [
                  {
                    op: 'remove',
                    path: '/apiStages',
                    value: `${apiStage.apiId}:${apiStage.stage}`,
                  },
                ],
              })
            )
          )
        )
      );
    }

    return [];
  },
};
