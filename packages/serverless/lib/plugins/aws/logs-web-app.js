'use strict'

import {
  getLogStreamNames,
  noLogStreamsError,
  showLogEvents,
} from './lib/log-streams.js'
import { isResourceNotFound } from './lib/not-found-errors.js'
import { resolveWebApp } from './web-apps/utils.js'
import { getWebAppFunctionName } from './web-apps/compilers/function.js'
import { getWebAppLogGroupNames } from './web-apps/compilers/logGroups.js'

/**
 * `serverless logs --web-app <name>`: the web app's lines from its `.local` log group
 * (`/aws/lambda/web/<FunctionName>.local` in the home Region), where they arrive first. It reads
 * them the way `logs --function` reads a function's group, with the same options (`--tail`,
 * `--startTime`, `--filter`, `--interval`).
 */
class AwsLogsWebApp {
  constructor(serverless, options, pluginUtils) {
    this.serverless = serverless
    this.options = options || {}
    this.provider = this.serverless.getProvider('aws')
    this.logger = pluginUtils.log
    this.progress = pluginUtils.progress

    this.hooks = {
      'logs:logs': async () => {
        const name = this.options['web-app']
        if (!name) return
        await this.printLogs(name)
      },
    }
  }

  async printLogs(name) {
    const logGroupName = this.webAppLogGroupName(name)
    const noLogStreamsMessage = `No logs yet for web app "${name}". Send it a request, then run this command again.`
    // The functions path's lookup, where a `.local` group that does not exist yet (no request
    // has been logged) means the same as one without streams
    const getLogStreams = async () => {
      try {
        return await getLogStreamNames({
          provider: this.provider,
          logGroupName,
          noLogStreamsMessage,
        })
      } catch (error) {
        if (isResourceNotFound(error)) {
          throw noLogStreamsError(noLogStreamsMessage)
        }
        throw error
      }
    }

    if (!this.options.tail) {
      this.progress.notice('Fetching logs')
    } else {
      this.logger.aside(`Streaming new logs for web app: "${name}"`)
      this.progress.notice('Listening')
    }
    const logStreamNames = await getLogStreams()
    await showLogEvents({
      provider: this.provider,
      logger: this.logger,
      progress: this.progress,
      // Paging state for --tail lives on this copy, not on the command's options
      options: { ...this.options, interval: this.options.interval || 1000 },
      logGroupName,
      logStreamNames,
      getLogStreams,
    })
  }

  webAppLogGroupName(name) {
    const webApp = resolveWebApp(this.serverless, name)
    const functionName = getWebAppFunctionName(
      {
        serviceName: this.serverless.service.service,
        stage: this.provider.getStage(),
      },
      name,
      webApp,
    )
    return getWebAppLogGroupNames(functionName).localLogGroupName
  }
}

export default AwsLogsWebApp
