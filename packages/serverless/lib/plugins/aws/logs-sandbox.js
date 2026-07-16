'use strict'

import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc.js'
import ServerlessError from '../../serverless-error.js'
import { getResourceName } from './sandboxes/utils/naming.js'

dayjs.extend(utc)

class AwsLogsSandbox {
  constructor(serverless, options, pluginUtils) {
    this.serverless = serverless
    this.options = options || {}
    this.provider = this.serverless.getProvider('aws')
    this.logger = pluginUtils.log

    this.hooks = {
      'logs:logs': async () => {
        if (!this.options.sandbox) return
        if (this.options.function || this.options.agent) {
          throw new ServerlessError(
            'Cannot combine --sandbox with --function or --agent.',
            'LOGS_MUTUAL_EXCLUSIVITY',
          )
        }
        await this.printLogs()
      },
    }
  }

  getSandboxesConfig() {
    return (
      this.serverless.service.sandboxes ||
      this.serverless.configurationInput?.sandboxes ||
      null
    )
  }

  resolveTarget() {
    const sandboxes = this.getSandboxesConfig()
    if (!sandboxes || Object.keys(sandboxes).length === 0) {
      throw new ServerlessError(
        'No sandboxes defined in serverless.yml under `sandboxes`.',
        'NO_SANDBOXES_DEFINED',
      )
    }
    const names = Object.keys(sandboxes)
    if (typeof this.options.sandbox !== 'string' || !this.options.sandbox) {
      throw new ServerlessError(
        `Specify which sandbox with --sandbox <name>. Available: ${names.join(', ')}`,
        'SANDBOX_NAME_REQUIRED',
      )
    }
    if (!sandboxes[this.options.sandbox]) {
      throw new ServerlessError(
        `Sandbox '${this.options.sandbox}' not found. Available: ${names.join(', ')}`,
        'SANDBOX_NOT_FOUND',
      )
    }
    return this.options.sandbox
  }

  logGroupName(name) {
    const resourceName = getResourceName(
      this.serverless.service.service,
      name,
      this.provider.getStage(),
    )
    return `/aws/lambda-microvms/${resourceName}`
  }

  async printLogs() {
    const name = this.resolveTarget()
    const logGroupName = this.logGroupName(name)
    const { CloudWatchLogsClient, FilterLogEventsCommand } =
      await import('@aws-sdk/client-cloudwatch-logs')
    const creds = await this.provider.getCredentials()
    const client = new CloudWatchLogsClient({
      region: this.provider.getRegion(),
      credentials: creds.credentials,
    })

    let startTime
    if (this.options.startTime) {
      const since =
        ['m', 'h', 'd'].indexOf(
          this.options.startTime[this.options.startTime.length - 1],
        ) !== -1
      if (since) {
        startTime = dayjs()
          .subtract(
            this.options.startTime.replace(/\D/g, ''),
            this.options.startTime.replace(/\d/g, ''),
          )
          .valueOf()
      } else {
        startTime = dayjs.utc(this.options.startTime).valueOf()
      }
    } else {
      startTime = dayjs().subtract(10, 'm').valueOf() // last 10 min by default
    }
    const printPage = async (nextToken) => {
      let res
      try {
        res = await client.send(
          new FilterLogEventsCommand({
            logGroupName,
            startTime,
            nextToken,
            ...(this.options.filter
              ? { filterPattern: this.options.filter }
              : {}),
          }),
        )
      } catch (err) {
        if (err.name === 'ResourceNotFoundException') {
          throw new ServerlessError(
            `Log group '${logGroupName}' not found. The sandbox may not have ` +
              `been built or run yet.`,
            'SANDBOX_LOG_GROUP_NOT_FOUND',
          )
        }
        throw err
      }
      for (const e of res.events || []) process.stdout.write(`${e.message}\n`)
      return res.nextToken
    }

    let token = await printPage(undefined)
    while (token) token = await printPage(token)

    if (this.options.tail) {
      this.logger.notice(
        '`--tail` (follow) is not available for sandbox logs; printed the recent window.',
      )
    }
  }
}

export default AwsLogsSandbox
