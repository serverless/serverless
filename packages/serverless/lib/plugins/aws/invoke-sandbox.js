'use strict'

import ServerlessError from '../../serverless-error.js'
import {
  makeClient,
  resolveSandboxOutputs,
  runMicrovm,
  waitUntilRunning,
  createAuthToken,
  terminateMicrovm,
} from './sandboxes/runtime/dataplane.js'

class AwsInvokeSandbox {
  constructor(serverless, options, pluginUtils) {
    this.serverless = serverless
    this.options = options || {}
    this.provider = this.serverless.getProvider('aws')
    this.logger = pluginUtils.log
    this.progress = pluginUtils.progress

    this.hooks = {
      'invoke:invoke': async () => {
        if (!this.options.sandbox) return // not our target
        if (this.options.function || this.options.agent) {
          throw new ServerlessError(
            'Cannot combine --sandbox with --function or --agent.',
            'INVOKE_MUTUAL_EXCLUSIVITY',
          )
        }
        this.progress.notice('Invoking sandbox')
        await this.invoke()
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

  // Returns the sandbox name to invoke, or throws (mirrors --agent target rules).
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

  async invoke() {
    try {
      const name = this.resolveTarget()
      const port = Number(this.options.port) || 8080
      const reqPath = this.options.path || '/'
      const method = (this.options.method || 'GET').toUpperCase()

      const { imageArn, executionRoleArn, connectorArn } =
        await resolveSandboxOutputs(this.provider, name)
      const client = await makeClient(this.provider)

      let microvmId
      try {
        const run = await runMicrovm(client, {
          imageArn,
          executionRoleArn,
          egressConnectorArn: connectorArn,
        })
        microvmId = run.microvmId
        const { endpoint } = await waitUntilRunning(client, microvmId)
        const token = await createAuthToken(client, microvmId, port)

        // Insert a leading slash when reqPath doesn't already have one.
        const url = `https://${endpoint}${reqPath.startsWith('/') ? '' : '/'}${reqPath}`
        const headers = {
          'X-aws-proxy-auth': token,
          'X-aws-proxy-port': String(port),
        }
        const init = { method, headers }
        if (this.options.data != null && method !== 'GET') {
          init.body =
            typeof this.options.data === 'string'
              ? this.options.data
              : JSON.stringify(this.options.data)
        }
        // Intentionally unbounded: a sandbox invoke may be a long-running
        // operation, so we don't impose a client timeout. A MicroVM that's
        // abandoned (e.g. the user interrupts the CLI) is reaped by the one-shot
        // idle policy in runMicrovm rather than a fixed deadline here.
        const res = await fetch(url, init)
        const body = await res.text()
        process.stdout.write(body.endsWith('\n') ? body : body + '\n')
        if (res.status >= 400) {
          throw new ServerlessError(
            `Sandbox '${name}' returned HTTP ${res.status}`,
            'SANDBOX_INVOKE_HTTP_ERROR',
          )
        }
      } catch (err) {
        if (err.name === 'AccessDeniedException') {
          throw new ServerlessError(
            `Access denied invoking sandbox '${name}'. The caller identity needs ` +
              `lambda:RunMicrovm, GetMicrovm, CreateMicrovmAuthToken, TerminateMicrovm, ` +
              `iam:PassRole and lambda:PassNetworkConnector.`,
            'SANDBOX_INVOKE_ACCESS_DENIED',
          )
        }
        throw err
      } finally {
        if (microvmId) await terminateMicrovm(client, microvmId, this.logger)
      }
    } finally {
      this.progress.remove()
    }
  }
}

export default AwsInvokeSandbox
