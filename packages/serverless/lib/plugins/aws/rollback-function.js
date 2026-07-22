import _ from 'lodash'
import ServerlessError from '../../serverless-error.js'
import validate from './lib/validate.js'
import { log, progress, style } from '@serverless/util'

const mainProgress = progress.get('main')

class AwsRollbackFunction {
  constructor(serverless, options) {
    this.serverless = serverless
    this.options = options || {}
    this.provider = this.serverless.getProvider('aws')

    Object.assign(this, validate)

    this.hooks = {
      'rollback:function:rollback': async () => {
        await this.validate()
        const func = await this.getFunctionToBeRestored()
        if (func.Code && func.Code.ResolvedS3Object) {
          await this.restoreReferenceFunction(func.Code.ResolvedS3Object)
          return
        }
        const zipBuffer = await this.fetchFunctionCode(func)
        await this.restoreFunction(zipBuffer)
      },
    }
  }

  async getFunctionToBeRestored() {
    const funcName = this.options.function
    let funcVersion = this.options['function-version']

    // versions need to be string so that AWS understands it
    funcVersion = String(this.options['function-version'])

    log.notice()
    log.notice(`Rolling back function ${funcName} to version "${funcVersion}"`)
    log.info() // Ensure gap between verbose logging

    mainProgress.notice('Updating', { isMainEvent: true })

    const funcObj = this.serverless.service.getFunction(funcName)

    const params = {
      FunctionName: funcObj.name,
      Qualifier: funcVersion,
    }

    return (
      this.provider
        // The response's Code.ResolvedS3Object field (used to detect
        // reference-mode functions below) is unknown to the frozen v2
        // `aws-sdk` Lambda API model, which silently drops it. Mode must be
        // detected FROM the response, so this call always uses the v3 SDK
        // path, regardless of which mode the target function is actually in.
        .request('Lambda', 'getFunction', params, { sdkVersion: 3 })
        .then((func) => func)
        .catch((error) => {
          if (
            error.message.match(/not found/) ||
            _.get(error, 'providerError.code') === 'ResourceNotFoundException'
          ) {
            const errorMessage = [
              `Function "${funcName}" with version "${funcVersion}" not found.`,
              ` Please check if you've deployed "${funcName}"`,
              ` and version "${funcVersion}" is available for this function.`,
              ' Please check the docs for more info.',
            ].join('')
            throw new ServerlessError(errorMessage, 'AWS_FUNCTION_NOT_FOUND')
          }
          throw new ServerlessError(
            `Cannot resolve function "${funcName}": ${error.message}`,
            'AWS_FUNCTION_NOT_ACCESIBLE',
          )
        })
    )
  }

  async fetchFunctionCode(func) {
    const codeUrl = func.Code.Location

    return fetch(codeUrl)
      .then((response) => response.arrayBuffer())
      .then((buffer) => Buffer.from(buffer))
  }

  async restoreFunction(zipBuffer) {
    const funcName = this.options.function

    const funcObj = this.serverless.service.getFunction(funcName)

    const params = {
      FunctionName: funcObj.name,
      ZipFile: zipBuffer,
    }

    return this.provider
      .request('Lambda', 'updateFunctionCode', params)
      .then(() => {
        log.notice()
        log.success(
          `Successfully rolled back function ${funcName} to version "${
            this.options['function-version']
          }" ${style.aside(
            `(${Math.floor(
              (Date.now() - this.serverless.pluginManager.commandRunStartTime) /
                1000,
            )}s)`,
          )}`,
        )
      })
  }

  async restoreReferenceFunction(resolvedS3Object) {
    const funcName = this.options.function
    const funcObj = this.serverless.service.getFunction(funcName)

    const params = {
      FunctionName: funcObj.name,
      S3Bucket: resolvedS3Object.S3Bucket,
      S3Key: resolvedS3Object.S3Key,
      S3ObjectVersion: resolvedS3Object.S3ObjectVersion,
      S3ObjectStorageMode: 'REFERENCE',
    }

    // S3ObjectStorageMode is unknown to the frozen v2 `aws-sdk` Lambda API
    // model and is rejected client-side, so this call must use the v3 SDK
    // path.
    await this.provider.request('Lambda', 'updateFunctionCode', params, {
      sdkVersion: 3,
    })
    log.notice()
    log.success(
      `Successfully rolled back function ${funcName} to version "${
        this.options['function-version']
      }" ${style.aside(
        `(${Math.floor(
          (Date.now() - this.serverless.pluginManager.commandRunStartTime) /
            1000,
        )}s)`,
      )}`,
    )
  }
}

export default AwsRollbackFunction
