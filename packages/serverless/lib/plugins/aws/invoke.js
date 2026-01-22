import path from 'path'
import validate from './lib/validate.js'
import stdin from 'get-stdin'
import formatLambdaLogEvent from './utils/format-lambda-log-event.js'
import ServerlessError from '../../serverless-error.js'
import { writeText, style } from '@serverless/util'

class AwsInvoke {
  constructor(serverless, options, pluginUtils) {
    this.serverless = serverless
    this.options = options || {}
    this.provider = this.serverless.getProvider('aws')
    this.logger = pluginUtils.log
    this.progress = pluginUtils.progress

    Object.assign(this, validate)

    this.hooks = {
      'invoke:invoke': async () => {
        // Ensure at least one of --function or --agent is provided
        if (!this.options.function && !this.options.agent) {
          throw new ServerlessError(
            'One of the required options must be provided: --function (-f) or --agent (-a)',
            'INVOKE_MISSING_OPTION',
          )
        }

        // Skip if --agent is provided (handled by invoke-agent plugin)
        if (this.options.agent) {
          return
        }

        this.progress.notice('Invoking function')
        await this.extendedValidate()
        this.log(await this.invoke())
      },
    }
  }

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

  async extendedValidate() {
    this.validate()
    // validate function exists in service
    this.options.functionObj = this.serverless.service.getFunction(
      this.options.function,
    )
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

    if (!this.options.context && this.options.contextPath) {
      this.options.context = await this.validateFile('contextPath')
    }

    try {
      if (!this.options.raw) {
        this.options.data = JSON.parse(this.options.data)
      }
    } catch (exception) {
      // do nothing if it's a simple string or object already
    }

    try {
      if (!this.options.raw && this.options.context) {
        this.options.context = JSON.parse(this.options.context)
      }
    } catch (exception) {
      // do nothing if it's a simple string or object already
    }
  }

  async invoke() {
    const invocationType = this.options.type || 'RequestResponse'
    if (invocationType !== 'RequestResponse') {
      this.options.log = 'None'
    } else {
      this.options.log = this.options.log ? 'Tail' : 'None'
    }

    const params = {
      FunctionName: this.options.functionObj.name,
      InvocationType: invocationType,
      LogType: this.options.log,
      Payload: Buffer.from(JSON.stringify(this.options.data || {})),
    }

    if (this.options.context) {
      params.ClientContext = Buffer.from(
        JSON.stringify(this.options.context),
      ).toString('base64')
    }

    if (this.options.qualifier) {
      params.Qualifier = this.options.qualifier
    }

    if (this.options['tenant-id']) {
      params.TenantId = this.options['tenant-id']
    }

    if (this.options['durable-execution-name']) {
      params.DurableExecutionName = this.options['durable-execution-name']
    }

    return this.provider.request('Lambda', 'invoke', params)
  }

  // Normalize Lambda invoke payload to string for JSON.parse
  // AWS Node SDK v3 returns `Uint8Array` for `Lambda.invoke` Payload, while
  // AWS Node SDK v2 returns a Buffer or string. We normalize here without
  // introducing extra buffering. This keeps behavior consistent across v2/v3.
  payloadToString(payload) {
    if (payload instanceof Uint8Array) {
      return new TextDecoder().decode(payload)
    }
    if (Buffer.isBuffer(payload)) {
      return payload.toString()
    }
    return payload
  }

  log(invocationReply) {
    this.progress.remove()

    if (invocationReply.Payload) {
      const response = JSON.parse(this.payloadToString(invocationReply.Payload))

      writeText(JSON.stringify(response, null, 4))
    }

    if (invocationReply.LogResult) {
      this.logger.blankLine()
      writeText(style.aside('----------------------'))
      this.logger.blankLine()
      const logResult = Buffer.from(
        invocationReply.LogResult,
        'base64',
      ).toString()
      const logResultLines = logResult.split('\n')
      // Loop through and ensure the log that starts with "START" is always shown first
      // and the log that starts with "REPORT" is always shown last
      const startLog = logResultLines.find((line) => line.startsWith('START'))
      const reportLog = logResultLines.find((line) => line.startsWith('REPORT'))
      if (startLog) {
        this.logger.aside(formatLambdaLogEvent(startLog))
      }
      logResultLines.forEach((line) => {
        if (
          !line.startsWith('START') &&
          !line.startsWith('END') &&
          !line.startsWith('REPORT')
        ) {
          this.logger.aside(formatLambdaLogEvent(line))
        }
      })
      if (reportLog) {
        this.logger.aside(formatLambdaLogEvent(reportLog))
      }
    }

    if (invocationReply.FunctionError) {
      throw new ServerlessError(
        'Invoked function failed',
        'AWS_LAMBDA_INVOCATION_FAILED',
      )
    }
  }
}

export default AwsInvoke
