import path from 'path'
import validate from './lib/validate.js'
import stdin from 'get-stdin'
import formatLambdaLogEvent from './utils/format-lambda-log-event.js'
import ServerlessError from '../../serverless-error.js'
import utils from '@serverlessinc/sf-core/src/utils.js'

const { writeText, style } = utils

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

    return this.provider.request('Lambda', 'invoke', params)
  }

  log(invocationReply) {
    this.progress.remove()

    if (invocationReply.Payload) {
      const response = JSON.parse(invocationReply.Payload)

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
