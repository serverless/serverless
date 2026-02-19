'use strict'

import path from 'path'
import stdin from 'get-stdin'
import ServerlessError from '../../serverless-error.js'
import { getLogicalId } from './bedrock-agentcore/utils/naming.js'
import {
  AGENTCORE_INVOKE_ACCEPT_HEADER,
  consumeSseTextStream,
  decodeAgentStreamChunk,
  isDoneSseEvent,
} from './bedrock-agentcore/utils/streaming.js'

/**
 * Plugin for invoking AgentCore Runtime agents
 */
class AwsInvokeAgent {
  constructor(serverless, options, pluginUtils) {
    this.serverless = serverless
    this.options = options || {}
    this.provider = this.serverless.getProvider('aws')
    this.logger = pluginUtils.log
    this.progress = pluginUtils.progress

    this.hooks = {
      'invoke:invoke': async () => {
        // Only handle agent invocations
        if (!this.options.agent) {
          return
        }

        // Check for mutual exclusivity with --function
        if (this.options.function) {
          throw new ServerlessError(
            'Cannot specify both --function and --agent. Use --function to invoke Lambda functions or --agent to invoke AgentCore agents.',
            'INVOKE_MUTUAL_EXCLUSIVITY',
          )
        }

        this.progress.notice('Invoking agent')
        await this.validateAgent()
        await this.invoke()
      },
    }
  }

  /**
   * Validate the agent exists and get input data
   */
  async validateAgent() {
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

    this.agentConfig = agentConfig

    // Validate session ID length if provided (AWS requirement: min 33 characters)
    if (this.options['session-id']) {
      const sessionId = this.options['session-id']
      if (sessionId.length < 33) {
        throw new ServerlessError(
          `Session ID must be at least 33 characters long. Provided: '${sessionId}' (${sessionId.length} characters)`,
          'INVALID_SESSION_ID_LENGTH',
        )
      }
    }

    // Get input data
    this.options.data = this.options.data || ''

    if (!this.options.data) {
      if (this.options.path) {
        this.options.data = await this.validateFile('path')
      } else {
        try {
          this.options.data = await stdin()
        } catch {
          // continue if no stdin was provided
        }
      }
    }

    // Parse data if it looks like JSON
    if (typeof this.options.data === 'string' && this.options.data.trim()) {
      try {
        this.options.data = JSON.parse(this.options.data)
      } catch {
        // Keep as string if not valid JSON
      }
    }
  }

  /**
   * Validate file exists and return contents
   */
  async validateFile(key) {
    const absolutePath = path.resolve(
      this.serverless.serviceDir,
      this.options[key],
    )
    try {
      return await this.serverless.utils.readFile(absolutePath)
    } catch (err) {
      if (err.code === 'ENOENT') {
        throw new ServerlessError(
          'The file you provided does not exist.',
          'FILE_NOT_FOUND',
        )
      }
      throw err
    }
  }

  /**
   * Get ai configuration
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
   * Get the runtime ARN from CloudFormation stack outputs
   */
  async getRuntimeArn() {
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

    // Look for the runtime ARN output
    const logicalId = getLogicalId(agentName, 'Runtime')
    const outputKey = `${logicalId}Arn`

    const output = stack.Outputs?.find((o) => o.OutputKey === outputKey)
    if (!output) {
      throw new ServerlessError(
        `Agent '${agentName}' runtime ARN not found in stack outputs. Make sure the agent is deployed.`,
        'AGENT_ARN_NOT_FOUND',
      )
    }

    return output.OutputValue
  }

  /**
   * Invoke the AgentCore Runtime
   */
  async invoke() {
    const runtimeArn = await this.getRuntimeArn()

    // Build the payload - if data is an object, send as-is; otherwise wrap string in { prompt: ... }
    const promptData = this.options.data
    const payload =
      typeof promptData === 'object'
        ? promptData
        : {
            prompt:
              typeof promptData === 'string' ? promptData : String(promptData),
          }

    this.logger.debug(`Invoking agent runtime: ${runtimeArn}`)
    this.logger.debug(`Payload: ${JSON.stringify(payload)}`)

    // Import AWS SDK
    const { BedrockAgentCoreClient, InvokeAgentRuntimeCommand } =
      await import('@aws-sdk/client-bedrock-agentcore')

    const region = this.provider.getRegion()
    const credentials = await this.provider.getCredentials()

    const client = new BedrockAgentCoreClient({
      region,
      credentials: credentials.credentials,
    })

    const params = {
      agentRuntimeArn: runtimeArn,
      contentType: 'application/json',
      accept: AGENTCORE_INVOKE_ACCEPT_HEADER,
      payload: Buffer.from(JSON.stringify(payload)),
    }

    // Add session ID if provided
    if (this.options['session-id']) {
      params.runtimeSessionId = this.options['session-id']
    }

    try {
      const command = new InvokeAgentRuntimeCommand(params)
      const response = await client.send(command)

      this.progress.remove()

      if (response.response) {
        const contentType = response.contentType || ''
        if (contentType.includes('text/event-stream')) {
          await this.#writeSseStream(response.response)
        } else {
          await this.#writeNonSseStream(response.response)
        }

        this.logger.blankLine()
        // Log session ID for subsequent calls
        if (response.runtimeSessionId) {
          this.logger.debug(`Session ID: ${response.runtimeSessionId}`)
        }
      }
    } catch (error) {
      this.progress.remove()

      if (error.name === 'ResourceNotFoundException') {
        throw new ServerlessError(
          `Agent runtime not found. Make sure the agent '${this.options.agent}' is deployed.`,
          'AGENT_RUNTIME_NOT_FOUND',
        )
      }

      if (error.name === 'AccessDeniedException') {
        throw new ServerlessError(
          `Access denied when invoking agent. Check your IAM permissions for bedrock-agentcore:InvokeAgentRuntime.`,
          'INVOKE_ACCESS_DENIED',
        )
      }

      throw new ServerlessError(
        `Failed to invoke agent: ${error.message}`,
        'AGENT_INVOKE_FAILED',
      )
    }
  }

  /**
   * Decode and write SSE events from invoke stream as raw passthrough output.
   * @private
   */
  async #writeSseStream(responseStream) {
    await consumeSseTextStream(
      this.#toTextChunks(responseStream),
      async ({ data }) => {
        if (isDoneSseEvent(data)) return
        if (data) {
          process.stdout.write(data)
        }
      },
    )
  }

  /**
   * Decode and write non-SSE output from invoke stream.
   * @private
   */
  async #writeNonSseStream(responseStream) {
    let output = ''
    for await (const chunk of this.#toTextChunks(responseStream)) {
      output += chunk
    }

    if (!output) return

    if (this.#writeAgentError(output)) {
      return
    }

    process.stdout.write(output)
  }

  /**
   * Render a structured agent error payload if present.
   * @private
   */
  #writeAgentError(output) {
    try {
      const parsed = JSON.parse(output)
      if (!parsed?.error && !parsed?.error_type) return false

      this.logger.blankLine()
      this.logger.error('Agent Error:')
      if (parsed.error_type) {
        this.logger.error(`  Type: ${parsed.error_type}`)
      }
      if (parsed.error) {
        this.logger.error(`  Error: ${parsed.error}`)
      }
      if (parsed.message && parsed.message !== parsed.error) {
        this.logger.error(`  Message: ${parsed.message}`)
      }
      this.logger.blankLine()
      return true
    } catch {
      return false
    }
  }

  /**
   * Convert a runtime response stream into decoded text chunks.
   * @private
   */
  async *#toTextChunks(responseStream) {
    const decoder = new TextDecoder()
    for await (const chunk of responseStream) {
      const decoded = decodeAgentStreamChunk(chunk, decoder)
      if (decoded) {
        yield decoded
      }
    }

    const tail = decoder.decode()
    if (tail) {
      yield tail
    }
  }
}

export default AwsInvokeAgent
