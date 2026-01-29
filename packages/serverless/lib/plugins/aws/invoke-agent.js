'use strict'

import path from 'path'
import stdin from 'get-stdin'
import ServerlessError from '../../serverless-error.js'
import { writeText } from '@serverless/util'
import { getLogicalId } from './bedrock-agentcore/utils/naming.js'

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
    const agents = this.getAgentsConfig()

    if (!agents) {
      throw new ServerlessError(
        'No agents defined in serverless.yml',
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

    // Default to 'runtime' if not specified
    if (!agentConfig.type) {
      agentConfig.type = 'runtime'
    }

    if (agentConfig.type !== 'runtime') {
      throw new ServerlessError(
        `Agent '${this.options.agent}' is of type '${agentConfig.type}', but only 'runtime' agents can be invoked.`,
        'INVALID_AGENT_TYPE',
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
   * Get agents configuration
   */
  getAgentsConfig() {
    const service = this.serverless.service

    if (service.agents) {
      return service.agents
    }

    if (service.initialServerlessConfig?.agents) {
      return service.initialServerlessConfig.agents
    }

    if (service.custom?.agents) {
      return service.custom.agents
    }

    if (this.serverless.configurationInput?.agents) {
      return this.serverless.configurationInput.agents
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

    // Build the payload - wrap in { prompt: ... } format
    let promptData = this.options.data
    if (typeof promptData === 'object') {
      // If data is already an object with prompt, use as-is
      if (!promptData.prompt) {
        promptData = JSON.stringify(promptData)
      }
    }

    const payload = {
      prompt:
        typeof promptData === 'string'
          ? promptData
          : JSON.stringify(promptData),
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
      accept: 'application/json',
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

      // Handle streaming response
      if (response.response) {
        let buffer = ''
        const decoder = new TextDecoder()

        for await (const chunk of response.response) {
          // The SDK yields raw Uint8Array/Buffer chunks directly
          let data = null

          // Check if chunk is a Buffer or Uint8Array (array-like with numeric keys)
          if (chunk instanceof Uint8Array || Buffer.isBuffer(chunk)) {
            data = decoder.decode(chunk, { stream: true })
          }
          // Fallback: chunk.chunk.bytes (other Bedrock APIs)
          else if (chunk.chunk?.bytes) {
            data = decoder.decode(chunk.chunk.bytes, { stream: true })
          }
          // Fallback: Direct bytes on chunk
          else if (chunk.bytes) {
            data = decoder.decode(chunk.bytes, { stream: true })
          }

          if (data) {
            buffer += data

            // Bedrock AgentCore returns SSE-style "data: " lines
            if (buffer.includes('\n')) {
              const lines = buffer.split('\n')
              buffer = lines.pop() // Keep the last partial line in buffer

              for (const line of lines) {
                const trimmed = line.trim()
                if (trimmed.startsWith('data:')) {
                  const lineData = trimmed.slice(5).trim()
                  if (lineData && lineData !== '[DONE]') {
                    this.#processStreamData(lineData)
                  }
                } else if (trimmed) {
                  // Fallback for non-SSE JSON
                  this.#processStreamData(trimmed)
                }
              }
            }
          }
        }

        // Process any remaining data in buffer
        if (buffer.trim()) {
          this.#processStreamData(buffer.trim())
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
   * Process a single data chunk from the stream
   * @private
   */
  #processStreamData(data) {
    if (!data) return

    try {
      const parsed = JSON.parse(data)

      // Check for error response from the agent
      if (parsed.error || parsed.error_type) {
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
        this.logger.notice(
          'Tip: Check agent logs with: sls logs --agent <name>',
        )
        return
      }

      const text = this.#extractTextFromEvent(parsed)
      if (text) {
        process.stdout.write(text)
      }
    } catch {
      // If not JSON, it might contain raw data or partial JSON
      // We skip raw debug data like Python reprs that were reported by the user
      if (data.includes("'data':") || data.includes('<strands.')) {
        return
      }
      // If it looks like a simple string, output it
      if (!data.startsWith('{') && !data.startsWith('[')) {
        process.stdout.write(data)
      }
    }
  }

  /**
   * Extract text content from an SSE event
   * @private
   */
  #extractTextFromEvent(event) {
    // BedrockAgentCore format: {"event": {"contentBlockDelta": {"delta": {"text": "Hello"}}}}
    if (event.event?.contentBlockDelta?.delta?.text !== undefined) {
      return event.event.contentBlockDelta.delta.text
    }

    // Strands result format
    if (event.result && typeof event.result === 'string') {
      return event.result + '\n'
    }

    // Skip non-content events (init, start, messageStart, etc.)
    if (
      event.init_event_loop ||
      event.start ||
      event.start_event_loop ||
      event.event?.messageStart ||
      event.event?.contentBlockStart ||
      event.event?.contentBlockStop ||
      event.event?.messageStop ||
      event.event?.metadata
    ) {
      return null
    }

    // If we can't identify it but it has data, check if it's the 'data' field itself
    if (event.data && typeof event.data === 'string') {
      // Filter out technical data events
      if (event.data.includes("'data':") || event.data.includes('<strands.')) {
        return null
      }
      return event.data
    }

    return null
  }
}

export default AwsInvokeAgent
