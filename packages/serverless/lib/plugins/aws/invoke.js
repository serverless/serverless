import path from 'path'
import validate from './lib/validate.js'
import stdin from 'get-stdin'
import formatLambdaLogEvent from './utils/format-lambda-log-event.js'
import targetAliasName from './utils/target-alias-name.js'
import ServerlessError from '../../serverless-error.js'
import { assertInvokeOptionsAvailable } from './lib/invoke-options.js'
import { writeText, style } from '@serverless/util'
import { jsonFlagOn } from '@serverless/util/src/cli/json-flag.js'
import {
  LOCAL_LOG_HEADING,
  findHandledInvocation,
  handledLine,
  localLogLines,
  requestIdOf,
} from './dev/state/handled.js'
import { setCliNames, shownPath } from './dev/commands/cli-names.js'

class AwsInvoke {
  constructor(serverless, options, pluginUtils) {
    this.serverless = serverless
    this.options = options || {}
    this.provider = this.serverless.getProvider('aws')
    this.logger = pluginUtils.log
    this.progress = pluginUtils.progress
    // Whether this directory's Dev Mode session ran a call (replaced in tests).
    this.findHandledInvocation = findHandledInvocation

    Object.assign(this, validate)

    this.hooks = {
      'invoke:invoke': async () => {
        // Ensure at least one of --function, --agent, --sandbox, or --web-app is provided
        if (
          !this.options.function &&
          !this.options.agent &&
          !this.options.sandbox &&
          !this.options['web-app']
        ) {
          throw new ServerlessError(
            'One of the required options must be provided: --function (-f), --agent (-a), --sandbox, or --web-app',
            'INVOKE_MISSING_OPTION',
            { stack: false },
          )
        }

        // Checked here, in the first hook to run, so that no other target's plugin runs first
        if (
          this.options['web-app'] &&
          (this.options.function || this.options.agent || this.options.sandbox)
        ) {
          throw new ServerlessError(
            'Cannot combine --web-app with --function, --agent or --sandbox.',
            'INVOKE_MUTUAL_EXCLUSIVITY',
            { stack: false },
          )
        }

        assertInvokeOptionsAvailable(this.options)

        // Skip if --agent, --sandbox or --web-app is provided (handled by their dedicated plugins)
        if (
          this.options.agent ||
          this.options.sandbox ||
          this.options['web-app']
        ) {
          return
        }

        this.progress.notice('Invoking function')
        await this.extendedValidate()
        await this.log(await this.invoke())
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
          { stack: false },
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
    const { functionObj } = this.options

    // Lambda invokes a durable function only through a qualifier (a version or an alias), so
    // without --qualifier the call targets the alias the deploy published for the function.
    const defaultQualifier = functionObj.durableConfig
      ? targetAliasName(functionObj)
      : undefined
    this.qualifier = this.options.qualifier ?? defaultQualifier
    this.qualifierDefaulted =
      this.options.qualifier == null && defaultQualifier !== undefined

    const executionTimeout = Number(functionObj.durableConfig?.executionTimeout)
    if (invocationType === 'RequestResponse' && executionTimeout > 900) {
      throw new ServerlessError(
        `Function "${this.options.function}" is a durable function with an execution timeout of ${functionObj.durableConfig.executionTimeout} seconds. Lambda runs a durable function synchronously only when its execution timeout is 900 seconds (15 minutes) or less. Run the same command with --type Event to start it asynchronously.`,
        'INVOKE_DURABLE_SYNC_TIMEOUT',
        { stack: false },
      )
    }

    if (invocationType !== 'RequestResponse') {
      this.options.log = 'None'
    } else {
      this.options.log = this.options.log ? 'Tail' : 'None'
    }

    const params = {
      FunctionName: functionObj.name,
      InvocationType: invocationType,
      LogType: this.options.log,
      Payload: Buffer.from(JSON.stringify(this.options.data || {})),
    }

    if (this.options.context) {
      params.ClientContext = Buffer.from(
        JSON.stringify(this.options.context),
      ).toString('base64')
    }

    if (this.qualifier) {
      params.Qualifier = this.qualifier
    }

    if (this.options['tenant-id']) {
      params.TenantId = this.options['tenant-id']
    }

    if (this.options['durable-execution-name']) {
      params.DurableExecutionName = this.options['durable-execution-name']
    }

    // The request's DurableExecutionName and TenantId fields, and the
    // response's DurableExecutionArn field, are unknown to the frozen v2
    // `aws-sdk` Lambda API model, which silently drops them. This call
    // always uses the v3 SDK path so they reach Lambda and come back.
    try {
      return await this.provider.request('Lambda', 'invoke', params, {
        sdkVersion: 3,
      })
    } catch (error) {
      const providerErrorCode = error.providerError?.code
      let context
      if (
        providerErrorCode === 'ResourceNotFoundException' &&
        this.qualifierDefaulted
      ) {
        context = ` The "${this.qualifier}" alias is published by "serverless deploy": deploy the service, or pass --qualifier.`
      } else if (
        providerErrorCode === 'DurableExecutionAlreadyStartedException'
      ) {
        context =
          ' An execution with this name already exists with a different payload: use a new --durable-execution-name, or send the same payload to get the existing execution.'
      }
      if (context) {
        error.message += context
        // The CLI prints the stack when an error has one, and the stack holds the message from
        // before the context was added. The message now says what to do, so it prints alone.
        error.stack = undefined
      }
      throw error
    }
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

  /**
   * The `--json` result: always these keys, in this order, with `null` for a value the reply does
   * not carry. `payload` is the parsed response, or the text when it is not JSON; `log` is the
   * decoded log tail.
   */
  jsonResult(invocationReply) {
    const text = invocationReply.Payload
      ? this.payloadToString(invocationReply.Payload)
      : ''
    let payload = null
    if (text) {
      try {
        payload = JSON.parse(text)
      } catch {
        payload = text
      }
    }
    return {
      statusCode: invocationReply.StatusCode ?? null,
      qualifier: this.qualifier ?? null,
      executedVersion: invocationReply.ExecutedVersion ?? null,
      durableExecutionArn: invocationReply.DurableExecutionArn ?? null,
      functionError: invocationReply.FunctionError ?? null,
      payload,
      log: invocationReply.LogResult
        ? Buffer.from(invocationReply.LogResult, 'base64').toString()
        : null,
    }
  }

  async log(invocationReply) {
    this.progress.remove()

    if (jsonFlagOn(this.options.json)) {
      writeText(JSON.stringify(this.jsonResult(invocationReply)))
      await this.logDevMode(invocationReply)
      this.throwOnFunctionError(invocationReply)
      return
    }

    if (invocationReply.DurableExecutionArn) {
      const started = (this.options.type || 'RequestResponse') === 'Event'
      this.logger.notice(
        `${started ? 'Durable execution started' : 'Durable execution'}: ${invocationReply.DurableExecutionArn}`,
      )
    }

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

    await this.logDevMode(invocationReply)
    this.throwOnFunctionError(invocationReply)
  }

  throwOnFunctionError(invocationReply) {
    if (invocationReply.FunctionError) {
      throw new ServerlessError(
        'Invoked function failed',
        'AWS_LAMBDA_INVOCATION_FAILED',
        { stack: false },
      )
    }
  }

  /**
   * When this directory's Dev Mode session ran the call on the working copy: one line naming the
   * request and its invocation file, and with --log the handler's log lines from this machine,
   * after the CloudWatch tail. stderr only; stdout and the exit code never change, and a failed
   * lookup is a debug line.
   */
  async logDevMode(invocationReply) {
    try {
      const requestId = requestIdOf(invocationReply)
      const handled = await this.findHandledInvocation({
        serviceDir: this.serverless.serviceDir,
        service: this.serverless.service.service,
        stage: this.provider.getStage(),
        region: this.provider.getRegion(),
        functionKey: this.options.function,
        requestId,
        invocationType: this.options.type || 'RequestResponse',
        qualifier: this.qualifier,
      })
      if (!handled) return
      // Named as it is reached from where the CLI runs (a Compose root, --config).
      setCliNames({ serverless: this.serverless, options: this.options })
      this.logger.aside(
        handledLine({ requestId, file: shownPath(handled.file) }),
      )
      if (this.options.log === 'Tail') {
        this.logger.blankLine()
        this.logger.notice(LOCAL_LOG_HEADING)
        for (const line of localLogLines(handled.record))
          this.logger.aside(line)
      }
    } catch (error) {
      this.logger.debug(
        `Dev Mode could not tell whether it ran this invocation: ${error?.message ?? error}`,
      )
    }
  }
}

export default AwsInvoke
