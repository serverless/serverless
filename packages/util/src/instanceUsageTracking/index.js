import { log } from '@serverless/util'
import { platformEventClient } from '../telemetry/index.js'

class InstanceUsageTrackingClient {
  constructor() {
    this.eventClient = platformEventClient
    this.partialInstanceReportBodies = []
    this.logger = log.get('util:instance-usage-tracking')
  }

  trackUsage(event) {
    this.partialInstanceReportBodies.push(event)
  }

  async publishEventBatches({ accessKey, orgId, user, versionFramework }) {
    if (accessKey === undefined || accessKey === '') {
      throw new Error('Not authenticated')
    }

    if (!orgId) {
      this.logger.debug(
        'Skipping instance usage tracking events because org ID is unknown.',
      )
      this.partialInstanceReportBodies = []
      await this.eventClient.publishEventBatches({ accessKey })
      return
    }

    this.partialInstanceReportBodies.forEach((body) => {
      this.eventClient.addToPublishBatch({
        source: 'billing.instance.reported.v1',
        event: { ...body, orgId, user },
      })
    })

    this.partialInstanceReportBodies = []

    await this.eventClient.publishEventBatches({
      accessKey,
      versionFramework,
    })
  }
}

const instanceUsageTrackingClient = new InstanceUsageTrackingClient()

export { instanceUsageTrackingClient }
