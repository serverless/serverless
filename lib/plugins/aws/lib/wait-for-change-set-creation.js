import wait from 'timers-ext/promise/sleep.js'
import ServerlessError from '../../../serverless-error.js'
import isChangeSetWithoutChanges from '../utils/is-change-set-without-changes.js'
import utils from '@serverlessinc/sf-core/src/utils.js'
import getMonitoringFrequency from '../utils/get-monitoring-frequency.js'

const { log } = utils

export default {
  async waitForChangeSetCreation(changeSetName, stackName) {
    const params = {
      ChangeSetName: changeSetName,
      StackName: stackName,
    }

    const callWithRetry = async () => {
      const changeSetDescription = await this.provider.request(
        'CloudFormation',
        'describeChangeSet',
        params,
      )
      if (
        changeSetDescription.Status === 'CREATE_COMPLETE' ||
        isChangeSetWithoutChanges(changeSetDescription)
      ) {
        return changeSetDescription
      }

      if (
        changeSetDescription.Status === 'CREATE_PENDING' ||
        changeSetDescription.Status === 'CREATE_IN_PROGRESS'
      ) {
        log.info('Change Set did not reach desired state, retrying')
        await wait(getMonitoringFrequency())
        return await callWithRetry()
      }

      throw new ServerlessError(
        `Could not create Change Set "${changeSetDescription.ChangeSetName}" due to: ${changeSetDescription.StatusReason}`,
        'AWS_CLOUD_FORMATION_CHANGE_SET_CREATION_FAILED',
      )
    }

    return await callWithRetry()
  },
}
