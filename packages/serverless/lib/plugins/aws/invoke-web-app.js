'use strict'

import { createHash } from 'node:crypto'
import { STATUS_CODES } from 'node:http'
import { SignatureV4 } from '@smithy/signature-v4'
import ServerlessError from '../../serverless-error.js'
import formatLambdaLogEvent from './utils/format-lambda-log-event.js'
import { Sha256 } from './lib/sigv4.js'
import { isResourceNotFound, isStackNotFound } from './lib/not-found-errors.js'
import { resolveWebApp } from './web-apps/utils.js'
import {
  getWebAppFunctionName,
  getWebAppLogicalIds,
} from './web-apps/compilers/function.js'
import { getWebAppLogGroupNames } from './web-apps/compilers/logGroups.js'
import { getWebAppAuthType } from './web-apps/compilers/endpoint.js'
import { listWebAppDomains } from './web-apps/compilers/domain.js'
import { parseHeaderOptions } from './lib/invoke-options.js'
import { findHandledRequest, handledLine } from './dev/state/handled.js'
import { setCliNames, shownPath } from './dev/commands/cli-names.js'

/** How often `--log` looks for the request's lines. */
const LOG_POLL_INTERVAL_MS = 1000
/** How long `--log` waits for the first line: about three times the slowest arrival seen. */
const LOG_WAIT_MS = 30000
/** Lines are searched from this long before the request was sent. */
const LOG_START_MARGIN_MS = 5000

/** The headers the Framework sets on every request, and `--header` cannot. */
const RESERVED_HEADERS = { host: "from the web app's endpoint" }

/** The headers the Framework sets to sign a request to an `IamAuth` endpoint. */
const SIGNING_HEADERS = Object.fromEntries(
  [
    'authorization',
    'x-amz-date',
    'x-amz-security-token',
    'x-amz-content-sha256',
  ].map((name) => [name, 'to sign the request']),
)

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * The query as it goes on the wire, for the signer: each `key=value` pair of the raw query string,
 * percent-decoded but with `+` kept as `+` (URLSearchParams would read it as a space, and the
 * signature would then cover a different query than the one sent). Repeated keys become arrays.
 */
const rawQueryOf = (url) => {
  const decode = (part) => {
    try {
      return decodeURIComponent(part)
    } catch {
      return part
    }
  }
  const query = Object.create(null)
  for (const pair of url.search.slice(1).split('&')) {
    if (!pair) continue
    const separator = pair.indexOf('=')
    const key = decode(separator === -1 ? pair : pair.slice(0, separator))
    const value = separator === -1 ? '' : decode(pair.slice(separator + 1))
    if (!Object.hasOwn(query, key)) query[key] = value
    else query[key] = [].concat(query[key], value)
  }
  return query
}

/**
 * `serverless invoke --web-app <name>`: one HTTP request to the web app's endpoint (`--path`,
 * default `/`; `--method`, default `GET`; `--data`, the body; `--header`, repeatable), printing the status line and
 * headers, then the body to stdout as it streams. An `IamAuth` endpoint (`url.authorizer:
 * aws_iam`, or a web app behind a custom domain) gets a SigV4-signed request. `--log` prints the
 * request's log lines afterwards. A response with status 400 or above fails the command, as
 * `invoke --sandbox` does.
 */
class AwsInvokeWebApp {
  constructor(serverless, options, pluginUtils) {
    this.serverless = serverless
    this.options = options || {}
    this.provider = this.serverless.getProvider('aws')
    this.logger = pluginUtils.log
    this.progress = pluginUtils.progress
    this.findHandledRequest = findHandledRequest

    this.hooks = {
      'invoke:invoke': async () => {
        if (!this.options['web-app']) return
        await this.invoke(this.options['web-app'])
      },
    }
  }

  async invoke(name) {
    const webApp = resolveWebApp(this.serverless, name)
    const functionName = getWebAppFunctionName(
      {
        serviceName: this.serverless.service.service,
        stage: this.provider.getStage(),
      },
      name,
      webApp,
    )

    const iamAuth = this.isIamAuth(name, webApp)
    const headers = parseHeaderOptions(
      this.options.header,
      iamAuth ? { ...RESERVED_HEADERS, ...SIGNING_HEADERS } : RESERVED_HEADERS,
    )

    this.progress.notice('Invoking web app')
    let response
    let sentAt
    try {
      const url = await this.resolveUrl(name)
      const init = await this.requestInit({ url, iamAuth, headers })
      sentAt = Date.now()
      try {
        // A redirect is printed, not followed: following it would send the signed headers to
        // another URL
        response = await fetch(url, { ...init, redirect: 'manual' })
      } catch (error) {
        throw new ServerlessError(
          `Could not reach web app "${name}" at ${url}: ${error.cause?.message ?? error.message}`,
          'WEB_APPS_INVOKE_REQUEST_FAILED',
          { stack: false },
        )
      }
    } finally {
      this.progress.remove()
    }

    this.printHead(response)
    await this.printBody(response)
    await this.logDevMode({ name, sentAt })

    if (this.options.log) {
      await this.printRequestLogs({ name, functionName, response, sentAt })
    }

    if (response.status >= 400) {
      throw new ServerlessError(
        `Web app "${name}" returned HTTP ${response.status}.`,
        'WEB_APPS_INVOKE_HTTP_ERROR',
        { stack: false },
      )
    }
  }

  /**
   * When this directory's Dev Mode session ran the request on the working copy: one line naming
   * the request and its file, as `invoke --function` prints for an invocation. stderr only; stdout
   * and the exit code never change, and a failed lookup is a debug line.
   */
  async logDevMode({ name, sentAt }) {
    try {
      const reqPath = this.options.path || '/'
      const handled = await this.findHandledRequest({
        serviceDir: this.serverless.serviceDir,
        service: this.serverless.service.service,
        stage: this.provider.getStage(),
        region: this.provider.getRegion(),
        webApp: name,
        method: this.options.method || 'GET',
        path: reqPath.startsWith('/') ? reqPath : `/${reqPath}`,
        sentAt,
      })
      if (!handled) return
      // Named as it is reached from where the CLI runs (a Compose root, --config).
      setCliNames({ serverless: this.serverless, options: this.options })
      this.logger.aside(
        handledLine({
          requestId: handled.requestId,
          file: shownPath(handled.file),
        }),
      )
    } catch (error) {
      this.logger.debug(
        `Dev Mode could not tell whether it ran this request: ${error?.message ?? error}`,
      )
    }
  }

  /** The request URL: the web app's endpoint from its stack output, plus `--path`. */
  async resolveUrl(name) {
    const stackName = this.provider.naming.getStackName()
    const notDeployed = () =>
      new ServerlessError(
        `Web app "${name}" has no endpoint in stack "${stackName}". Deploy the service with serverless deploy first.`,
        'WEB_APPS_NOT_DEPLOYED',
        { stack: false },
      )
    let result
    try {
      result = await this.provider.request('CloudFormation', 'describeStacks', {
        StackName: stackName,
      })
    } catch (error) {
      if (isStackNotFound(error)) throw notDeployed()
      throw error
    }
    const outputKey = getWebAppLogicalIds(name).urlOutput
    const endpoint = result?.Stacks?.[0]?.Outputs?.find(
      (output) => output.OutputKey === outputKey,
    )?.OutputValue
    if (!endpoint) throw notDeployed()
    const reqPath = this.options.path || '/'
    return new URL(`${endpoint}${reqPath.startsWith('/') ? '' : '/'}${reqPath}`)
  }

  /** Whether the web app's endpoint takes SigV4-signed requests only (`IamAuth`). */
  isIamAuth(name, webApp) {
    const behindDomain = listWebAppDomains(
      this.serverless.service.provider || {},
      { warn: (message) => this.logger.warning(message) },
    ).some((domain) => domain.webApp === name)
    return getWebAppAuthType(webApp, behindDomain) === 'IamAuth'
  }

  /**
   * `fetch` options: the method, the `--header` headers, the body (not on `GET` or `HEAD`, as
   * `invoke --sandbox`), and for an `IamAuth` endpoint the SigV4 headers (service `lambda`, with
   * `X-Amz-Content-SHA256`), signed over the `--header` headers too.
   */
  async requestInit({ url, iamAuth, headers }) {
    const method = (this.options.method || 'GET').toUpperCase()
    const body =
      this.options.data != null && method !== 'GET' && method !== 'HEAD'
        ? String(this.options.data)
        : undefined

    if (!iamAuth) return { method, headers: { ...headers }, body }

    const query = rawQueryOf(url)
    const signer = new SignatureV4({
      service: 'lambda',
      region: this.provider.getRegion(),
      credentials: await this.provider.getCredentials(),
      sha256: Sha256,
    })
    const signed = await signer.sign({
      method,
      protocol: url.protocol,
      hostname: url.hostname,
      path: url.pathname,
      query,
      headers: {
        ...headers,
        host: url.host,
        'x-amz-content-sha256': createHash('sha256')
          .update(body ?? '')
          .digest('hex'),
      },
      body,
    })
    // fetch sets the same Host header itself
    const signedHeaders = { ...signed.headers }
    delete signedHeaders.host
    return { method, headers: signedHeaders, body }
  }

  printHead(response) {
    const statusText = response.statusText || STATUS_CODES[response.status]
    this.logger.notice(
      `HTTP ${response.status}${statusText ? ` ${statusText}` : ''}`,
    )
    for (const [header, value] of response.headers) {
      this.logger.aside(`${header}: ${value}`)
    }
    this.logger.blankLine()
  }

  /** Writes the body to stdout as it arrives, ending it with a newline. */
  async printBody(response) {
    if (!response.body) return
    let last
    for await (const chunk of response.body) {
      if (chunk.length === 0) continue
      process.stdout.write(chunk)
      last = chunk[chunk.length - 1]
    }
    if (last !== undefined && last !== 0x0a) process.stdout.write('\n')
  }

  /**
   * The log lines of this request, from the `.local` group, where they arrive first: polled every
   * second by request ID within the response's log stream; after the first lines one more poll
   * picks up stragglers, then all print in timestamp order. Gives up after 30 seconds and points
   * to `serverless logs --web-app`, without failing the command.
   */
  async printRequestLogs({ name, functionName, response, sentAt }) {
    const requestId = response.headers.get('lambda-web-request-id')
    const logStream = response.headers.get('lambda-web-logstream')
    const pointer = `Run "serverless logs --web-app ${name}" to see the web app's logs.`
    if (!requestId || !logStream) {
      this.logger.notice(
        `The response has no lambda-web-request-id or lambda-web-logstream header, so its log lines cannot be looked up. ${pointer}`,
      )
      return
    }

    const params = {
      logGroupName: getWebAppLogGroupNames(functionName).localLogGroupName,
      logStreamNamePrefix: logStream,
      filterPattern: `{ ($.requestId = "${requestId}") || ($.record.requestId = "${requestId}") }`,
      startTime: sentAt - LOG_START_MARGIN_MS,
    }
    const events = new Map()
    let found = false
    const deadline = Date.now() + LOG_WAIT_MS
    this.progress.notice('Waiting for log lines')
    try {
      for (;;) {
        await sleep(LOG_POLL_INTERVAL_MS)
        for (const event of await this.filterLogEvents(params)) {
          events.set(
            event.eventId ?? `${event.timestamp}:${event.message}`,
            event,
          )
        }
        if (found) break
        if (events.size > 0) found = true
        else if (Date.now() >= deadline) break
      }
    } finally {
      this.progress.remove()
    }

    if (!found) {
      this.logger.notice(
        `No log lines for this request arrived within ${LOG_WAIT_MS / 1000} seconds. ${pointer}`,
      )
      return
    }
    this.logger.blankLine()
    for (const event of [...events.values()].sort(
      (a, b) => a.timestamp - b.timestamp,
    )) {
      this.logger.aside(formatLambdaLogEvent(event.message))
    }
  }

  /** Every page of one search; a log group or stream that does not exist yet has no lines. */
  async filterLogEvents(params) {
    const events = []
    let nextToken
    do {
      let page
      try {
        page = await this.provider.request(
          'CloudWatchLogs',
          'filterLogEvents',
          nextToken ? { ...params, nextToken } : params,
        )
      } catch (error) {
        if (isResourceNotFound(error)) return events
        throw error
      }
      events.push(...(page?.events || []))
      nextToken = page?.nextToken
    } while (nextToken)
    return events
  }
}

export default AwsInvokeWebApp
