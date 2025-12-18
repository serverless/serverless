/**
 * For now we are going to publish directly to the API instead of including the core-events SDK.
 * As we add event publishing into the platform SDK we can replace this logic.
 */
import _ from 'lodash'
import { log } from '@serverless/util'
import { getProxyDispatcher } from '../proxy/index.js'

class PlatformEventClient {
  constructor() {
    this.eventsToPublish = []
    if (
      process.env.SERVERLESS_PLATFORM_STAGE !== undefined &&
      process.env.SERVERLESS_PLATFORM_STAGE === 'dev'
    ) {
      this.apiBaseUrl = 'https://core.serverless-dev.com/api'
    } else {
      this.apiBaseUrl = 'https://core.serverless.com/api'
    }
  }

  addToPublishBatch(event) {
    this.eventsToPublish.push(event)
  }

  async publishEventBatches({ accessKey, versionFramework } = {}) {
    if (accessKey === undefined || accessKey === '') {
      throw new Error('Not authenticated')
    }
    let publishPath = '/events/publish/bulk'

    const eventBatches = _.chunk(this.eventsToPublish, 10)
    this.eventsToPublish = []

    const publishPromises = eventBatches.map(async (batch) => {
      log.debug('Sending batch of events', JSON.stringify(batch, null, 2))
      const url = `${this.apiBaseUrl}${publishPath}`
      const headers = {
        Authorization: `Bearer ${accessKey}`,
      }
      if (versionFramework) {
        headers['x-serverless-version'] = versionFramework
      }
      await fetch(url, {
        method: 'POST',
        headers,
        dispatcher: getProxyDispatcher(url),
        body: JSON.stringify({ events: batch }),
      })
    })

    await Promise.allSettled(publishPromises)
  }
}

const platformEventClient = new PlatformEventClient()

export { platformEventClient }
export * from './events.js'
export * from './helpers.js'
