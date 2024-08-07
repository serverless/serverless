import _ from 'lodash'
import utils from '@serverlessinc/sf-core/src/utils.js'

const { log } = utils

export default {
  async disassociateUsagePlan() {
    const apiKeys = _.get(
      this.serverless.service.provider.apiGateway,
      'apiKeys',
    )

    if (apiKeys && apiKeys.length) {
      log.info('Removing usage plan association')
      const stackName = `${this.provider.naming.getStackName()}`
      return Promise.all([
        this.provider.request('CloudFormation', 'describeStackResource', {
          StackName: stackName,
          LogicalResourceId: this.provider.naming.getRestApiLogicalId(),
        }),
        this.provider.request('APIGateway', 'getUsagePlans', {}),
      ])
        .then((data) =>
          data[1].items.filter((item) =>
            item.apiStages
              .map((apistage) => apistage.apiId)
              .includes(data[0].StackResourceDetail.PhysicalResourceId),
          ),
        )
        .then((items) =>
          Promise.all(
            items
              .map((item) =>
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
                  }),
                ),
              )
              .flat(Infinity),
          ),
        )
    }

    return Promise.resolve()
  },
}
