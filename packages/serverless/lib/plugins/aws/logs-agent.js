import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc.js'
import wait from 'timers-ext/promise/sleep.js'
import { style } from '@serverless/util'
import ServerlessError from '../../serverless-error.js'
import { getLogicalId } from './bedrock-agentcore/utils/naming.js'

dayjs.extend(utc)

/**
 * Plugin for viewing CloudWatch logs from AgentCore Runtime agents.
 * Follows the same pattern as invoke-agent.js for the invoke command.
 */
class AwsLogsAgent {
  constructor(serverless, options, pluginUtils) {
    this.serverless = serverless
    this.options = options || {}
    this.provider = this.serverless.getProvider('aws')
    this.logger = pluginUtils.log
    this.progress = pluginUtils.progress

    this.hooks = {
      'logs:logs': async () => {
        if (!this.options.agent) {
          return
        }

        if (this.options.function) {
          throw new ServerlessError(
            'Cannot specify both --function and --agent. Use --function to view Lambda function logs or --agent to view agent logs.',
            'LOGS_MUTUAL_EXCLUSIVITY',
          )
        }

        if (!this.options.tail) {
          this.progress.notice('Fetching agent logs')
        } else {
          this.logger.aside(
            `Streaming new logs for agent: "${this.options.agent}"`,
          )
          this.progress.notice('Listening')
        }

        this.validateAgent()
        this.options.interval = this.options.interval || 1000
        this.options.logGroupName = await this.resolveLogGroupName()
        const logStreamNames = await this.getLogStreams()
        await this.showLogs(logStreamNames)
      },
    }
  }

  /**
   * Validate the agent exists in ai.agents config
   */
  validateAgent() {
    const aiConfig = this.getAiConfig()
    const agents = aiConfig?.agents

    if (!agents) {
      throw new ServerlessError(
        'No agents defined in serverless.yml under ai.agents',
        'NO_AGENTS_DEFINED',
      )
    }

    const agentConfig = agents[this.options.agent]
    if (!agentConfig) {
      throw new ServerlessError(
        `Agent '${this.options.agent}' not found in serverless.yml. Available agents: ${Object.keys(agents).join(', ')}`,
        'AGENT_NOT_FOUND',
      )
    }
  }

  /**
   * Get ai configuration from service
   */
  getAiConfig() {
    const service = this.serverless.service

    if (service.ai) {
      return service.ai
    }

    if (service.initialServerlessConfig?.ai) {
      return service.initialServerlessConfig.ai
    }

    if (this.serverless.configurationInput?.ai) {
      return this.serverless.configurationInput.ai
    }

    return null
  }

  /**
   * Resolve the CloudWatch log group name for the agent runtime.
   * Gets the AgentRuntimeId from CloudFormation stack outputs and constructs
   * the log group path: /aws/bedrock-agentcore/runtimes/<AgentRuntimeId>-DEFAULT
   */
  async resolveLogGroupName() {
    const stackName = this.provider.naming.getStackName()
    const agentName = this.options.agent

    const result = await this.provider.request(
      'CloudFormation',
      'describeStacks',
      { StackName: stackName },
    )

    const stack = result.Stacks?.[0]
    if (!stack) {
      throw new ServerlessError(
        `Stack '${stackName}' not found. Please deploy the service first.`,
        'STACK_NOT_FOUND',
      )
    }

    const logicalId = getLogicalId(agentName, 'Runtime')
    const outputKey = `${logicalId}Id`

    const output = stack.Outputs?.find((o) => o.OutputKey === outputKey)
    if (!output) {
      throw new ServerlessError(
        `Agent '${agentName}' runtime ID not found in stack outputs. Make sure the agent is deployed.`,
        'AGENT_RUNTIME_ID_NOT_FOUND',
      )
    }

    const runtimeId = output.OutputValue
    return `/aws/bedrock-agentcore/runtimes/${runtimeId}-DEFAULT`
  }

  /**
   * Get log streams for the agent's log group
   */
  async getLogStreams() {
    const params = {
      logGroupName: this.options.logGroupName,
      descending: true,
      limit: 50,
      orderBy: 'LastEventTime',
    }

    try {
      const reply = await this.provider.request(
        'CloudWatchLogs',
        'describeLogStreams',
        params,
      )
      if (!reply || reply.logStreams.length === 0) {
        throw new ServerlessError(
          'No existing log streams for the agent. The agent may not have been invoked yet.',
          'NO_EXISTING_LOG_STREAMS',
          { stack: false },
        )
      }

      return reply.logStreams.map((logStream) => logStream.logStreamName)
    } catch (error) {
      if (error.code === 'NO_EXISTING_LOG_STREAMS') {
        throw error
      }
      if (
        error.providerError?.code === 'ResourceNotFoundException' ||
        error.message?.includes('ResourceNotFoundException')
      ) {
        throw new ServerlessError(
          `Log group not found for agent '${this.options.agent}'. The agent may not have been invoked yet.`,
          'LOG_GROUP_NOT_FOUND',
          { stack: false },
        )
      }
      throw error
    }
  }

  /**
   * Fetch and display log events
   */
  async showLogs(logStreamNames) {
    if (!logStreamNames || !logStreamNames.length) {
      if (this.options.tail) {
        const newLogStreamNames = await this.getLogStreams()
        return this.showLogs(newLogStreamNames)
      }
      return
    }

    const params = {
      logGroupName: this.options.logGroupName,
      interleaved: true,
      logStreamNames,
      startTime: this.options.startTime,
    }

    if (this.options.filter) params.filterPattern = this.options.filter
    if (this.options.nextToken) params.nextToken = this.options.nextToken
    if (this.options.startTime) {
      const since =
        ['m', 'h', 'd'].indexOf(
          this.options.startTime[this.options.startTime.length - 1],
        ) !== -1
      if (since) {
        params.startTime = dayjs()
          .subtract(
            this.options.startTime.replace(/\D/g, ''),
            this.options.startTime.replace(/\d/g, ''),
          )
          .valueOf()
      } else {
        params.startTime = dayjs.utc(this.options.startTime).valueOf()
      }
    } else {
      params.startTime = dayjs().subtract(10, 'm').valueOf()
      if (this.options.tail) {
        params.startTime = dayjs().subtract(15, 's').valueOf()
      }
    }

    const results = await this.provider.request(
      'CloudWatchLogs',
      'filterLogEvents',
      params,
    )

    const startTimeHumanReadable = dayjs(params.startTime).format(
      'YYYY-MM-DD HH:mm:ss',
    )

    this.progress.remove()

    if (!this.options.tail && (!results.events || !results.events.length)) {
      this.logger.aside(
        `No logs found from start time: ${startTimeHumanReadable}`,
      )
      return
    }

    if (results.events && results.events.length) {
      if (!this.options.tail) {
        this.logger.aside(`Logs Start Time: ${startTimeHumanReadable}`)
        this.logger.blankLine()
      }

      results.events.forEach((e) => {
        const msg = e.message.trimEnd()
        if (msg) {
          this.logger.notice(msg)
        }
      })
    }

    if (results.nextToken) {
      this.options.nextToken = results.nextToken
    } else {
      delete this.options.nextToken
    }

    if (this.options.tail) {
      this.progress.notice(`Listening ${style.aside(startTimeHumanReadable)}`)

      if (results.events && results.events.length) {
        this.options.startTime = results.events.at(-1).timestamp + 1
      }

      await wait(this.options.interval)
      const newLogStreamNames = await this.getLogStreams()
      await this.showLogs(newLogStreamNames)
    }
  }
}

export default AwsLogsAgent
