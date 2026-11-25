import _ from 'lodash'
import memoize from 'memoizee'
import pLimit from 'p-limit'
import sdk from './sdk.js'
import ServerlessError from '../../serverless-error.js'
import { log } from '@serverless/util'
// Imported by path, not from the package index, so tests that mock '@serverless/util' with a fixed
// list of exports keep loading this module.
import { getConfiguredAwsEndpoint } from '@serverless/util/src/aws/endpoint.js'
import { shouldBypassProxy } from '@serverless/util/src/proxy/index.js'
import { HttpsProxyAgent } from 'https-proxy-agent'
import https from 'https'
import { isIP } from 'net'
import fs from 'fs'
import deepSortObjectByKey from '../../utils/deep-sort-object-by-key.js'
import ensureString from 'type/string/ensure.js'
import isObject from 'type/object/is.js'
import wait from 'timers-ext/promise/sleep.js'

// Activate AWS SDK logging
const awsLog = log.get('sls:aws:request')

// Use HTTPS Proxy (Optional)
const proxyUrl =
  process.env.proxy ||
  process.env.HTTP_PROXY ||
  process.env.http_proxy ||
  process.env.HTTPS_PROXY ||
  process.env.https_proxy

const ca = process.env.ca || process.env.HTTPS_CA || process.env.https_ca

let caCerts = []

if (ca) {
  // Can be a single certificate or multiple, comma separated.
  const caArr = ca.split(',')
  // Replace the newline -- https://stackoverflow.com/questions/30400341
  caCerts = caCerts.concat(caArr.map((cert) => cert.replace(/\\n/g, '\n')))
}

const cafile =
  process.env.cafile || process.env.HTTPS_CAFILE || process.env.https_cafile

if (cafile) {
  // Can be a single certificate file path or multiple paths, comma separated.
  const caPathArr = cafile.split(',')
  caCerts = caCerts.concat(
    caPathArr.map((cafilePath) => fs.readFileSync(cafilePath.trim())),
  )
}

const tlsOptions = {}
if (caCerts.length > 0) {
  Object.assign(tlsOptions, {
    rejectUnauthorized: true,
    ca: caCerts,
  })
}

// Pass TLS options to either proxy agent or direct https agent
if (proxyUrl) {
  sdk.config.httpOptions.agent = new HttpsProxyAgent(proxyUrl, tlsOptions)
} else if (tlsOptions.ca) {
  // Update the agent -- http://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/node-registering-certs.html
  sdk.config.httpOptions.agent = new https.Agent(tlsOptions)
}

// Configure the AWS Client timeout (Optional).  The default is 120000 (2 minutes)
const timeout = process.env.AWS_CLIENT_TIMEOUT || process.env.aws_client_timeout
if (timeout) {
  sdk.config.httpOptions.timeout = parseInt(timeout, 10)
}
const requestQueue = pLimit(2)

const MAX_RETRIES = (() => {
  const userValue = Number(process.env.SLS_AWS_REQUEST_MAX_RETRIES)
  return userValue >= 0 ? userValue : 4
})()

const accelerationCompatibleS3Methods = new Set(['upload', 'putObject'])

const shouldS3Accelerate = (method, params) => {
  if (
    accelerationCompatibleS3Methods.has(method) &&
    params &&
    params.isS3TransferAccelerationEnabled
  ) {
    log.notice('Using S3 Transfer Acceleration Endpoint')
    return true
  }
  return false
}

/**
 * The SDK id of an AWS SDK v2 service class (`CloudFormation`, `CloudWatch Logs`), read from the
 * API model of its newest version without creating a client, or undefined.
 */
const getServiceId = (Service) => {
  try {
    const versions = (Service.apiVersions || []).filter(
      (version) => !version.endsWith('*'),
    )
    if (!Service.serviceIdentifier || versions.length === 0) return undefined
    return sdk.apiLoader(Service.serviceIdentifier, versions.at(-1))?.metadata
      ?.serviceId
  } catch {
    return undefined
  }
}

/**
 * The endpoint the user configured for a service with `AWS_ENDPOINT_URL`,
 * `AWS_ENDPOINT_URL_<SERVICE>` or `endpoint_url` in the shared config file, as the AWS SDK v3
 * clients read it, or undefined. Undefined too when the request or the SDK's own configuration
 * already sets an endpoint for the service (for example a plugin that calls
 * `provider.sdk.config.update({ s3: { endpoint } })`): that endpoint keeps applying.
 */
const resolveConfiguredEndpoint = async (service) => {
  if (service.params?.endpoint) return undefined
  const Service = _.get(sdk, service.name)
  if (!Service) return undefined
  if (sdk.config.endpoint || sdk.config[Service.serviceIdentifier]?.endpoint) {
    return undefined
  }
  const serviceId = getServiceId(Service)
  if (!serviceId) return undefined
  return getConfiguredAwsEndpoint(serviceId)
}

/**
 * The client options that send a service's requests to a configured endpoint, matching what the
 * AWS SDK v3 clients do with it: S3 puts the bucket in the path when the endpoint host is an IP
 * address (a bucket name can't be prefixed to one). When a proxy is set and NO_PROXY lists the
 * endpoint's host, requests to it go direct, as they do for the v3 clients.
 */
const configuredEndpointParams = (serviceName, endpoint) => {
  const params = { endpoint }
  if (serviceName === 'S3') {
    let hostname
    try {
      hostname = new URL(endpoint).hostname.replace(/^\[|\]$/g, '')
    } catch {
      hostname = ''
    }
    if (isIP(hostname)) params.s3ForcePathStyle = true
  }
  Object.assign(params, directHttpOptionsFor(endpoint))
  return params
}

/**
 * The client options that skip the proxy for requests to `endpoint`, when a proxy is set and
 * NO_PROXY lists the endpoint's host; empty otherwise. Applies to an endpoint the user configured
 * (AWS_ENDPOINT_URL and the like) or that a plugin set in the SDK configuration, such as
 * serverless-localstack does, never to AWS's own endpoints, which keep the proxy as before.
 */
const directHttpOptionsFor = (endpoint) => {
  if (!proxyUrl || typeof endpoint !== 'string') return {}
  if (!shouldBypassProxy(endpoint)) return {}
  return {
    httpOptions: {
      ...sdk.config.httpOptions,
      agent:
        tlsOptions.ca && /^https:/i.test(endpoint)
          ? new https.Agent(tlsOptions)
          : undefined,
    },
  }
}

const getServiceInstance = memoize(
  (service, method, configuredEndpoint) => {
    const Service = _.get(sdk, service.name)
    // we translate params to an object for the service creation by selecting keys of interest
    const serviceParams = { ...service.params }
    if (service.name === 'S3') {
      // Transfer Acceleration has its own AWS endpoint, which would bypass a configured one
      serviceParams.useAccelerateEndpoint = configuredEndpoint
        ? false
        : shouldS3Accelerate(method, service.params)
    }
    if (configuredEndpoint) {
      Object.assign(
        serviceParams,
        configuredEndpointParams(service.name, configuredEndpoint),
      )
    } else if (!serviceParams.endpoint) {
      Object.assign(
        serviceParams,
        directHttpOptionsFor(sdk.config[Service.serviceIdentifier]?.endpoint),
      )
    }
    return new Service(serviceParams)
  },
  {
    normalizer: ([service, method, configuredEndpoint]) => {
      const key = [JSON.stringify(deepSortObjectByKey(service)), method]
      if (configuredEndpoint) key.push(configuredEndpoint)
      return key.join('|')
    },
  },
)

const normalizerPattern = /(?<!^)([A-Z])/g
const normalizeErrorCodePostfix = (name) => {
  return name.replace(normalizerPattern, '_$1').toUpperCase()
}

let requestCounter = 0

/** Execute request to AWS service
 * @param {Object|string} [service] - Description of the service to call
 * @prop [service.name] - Name of the service to call, support subclasses
 * @prop [service.params] - Parameters to apply when creating the service and doing the request
 * @prop [service.params.credentials] - AWS Credentials to use
 * @prop [service.params.useCache ] - Wether to reuse result of the same request cached locally
 * @prop [service.params.region] - Region in which the call should be made (default to us-east-1)
 * @prop [service.params.isS3TransferAccelerationEnabled] - Use s3 acceleration when available for the request
 * @param {String} method - Method to call
 * @param {Array} args - Argument for the method call
 */
async function awsRequest(service, method, ...args) {
  // Checks regarding expectations on service object
  if (isObject(service)) {
    ensureString(service.name, { name: 'service.name' })
  } else {
    ensureString(service, { name: 'service' })
    service = { name: service }
  }
  const BASE_BACKOFF = 5000
  const persistentRequest = async (f, numTry = 0) => {
    try {
      return await f()
    } catch (e) {
      const { providerError } = e
      if (
        numTry < MAX_RETRIES &&
        providerError &&
        ((providerError.retryable &&
          providerError.statusCode !== 403 &&
          providerError.code !== 'CredentialsError' &&
          providerError.code !== 'ExpiredTokenException') ||
          providerError.statusCode === 429)
      ) {
        const nextTryNum = numTry + 1
        const jitter = Math.random() * 3000 - 1000
        // backoff is between 4 and 7 seconds
        const backOff = BASE_BACKOFF + jitter
        log.info(
          [
            `Recoverable error occurred (${
              e.message
            }), sleeping for ~${Math.round(backOff / 1000)} seconds.`,
            `Try ${nextTryNum} of ${MAX_RETRIES}`,
          ].join(' '),
        )
        await wait(backOff)
        return persistentRequest(f, nextTryNum)
      }
      throw e
    }
  }
  const request = await requestQueue(() =>
    persistentRequest(async () => {
      const requestId = ++requestCounter
      const configuredEndpoint = await resolveConfiguredEndpoint(service)
      const awsService = getServiceInstance(service, method, configuredEndpoint)
      awsLog.debug(
        `request: #${requestId} ${service.name}.${method}${
          configuredEndpoint ? ` (endpoint ${configuredEndpoint})` : ''
        }`,
        args,
      )
      const req = awsService[method](...args)
      try {
        const result = await req.promise()
        awsLog.debug(
          `request result: #${requestId} ${service.name}.${method}`,
          result,
        )
        return result
      } catch (err) {
        awsLog.debug(
          `request error: #${requestId} - ${service.name}.${method}`,
          err,
        )
        let message = err.message != null ? err.message : String(err.code)
        if (message.startsWith('Missing credentials in config')) {
          // Credentials error
          // If failed at last resort (EC2 Metadata check) expose a meaningful error
          // with link to AWS documentation
          // Otherwise, it's likely that user relied on some AWS creds, which appeared not correct
          // therefore expose an AWS message directly
          let bottomError = err
          while (
            bottomError.originalError &&
            !bottomError.message.startsWith('EC2 Metadata')
          ) {
            bottomError = bottomError.originalError
          }

          const errorMessage = bottomError.message.startsWith('EC2 Metadata')
            ? [
                'AWS provider credentials not found.',
                ' Learn how to set up AWS provider credentials',
                ` in our docs here: http://slss.io/aws-creds-setup`,
              ].join('')
            : bottomError.message
          message = errorMessage
          // We do not want to trigger the retry mechanism for credential errors
          throw Object.assign(
            new ServerlessError(errorMessage, 'AWS_CREDENTIALS_NOT_FOUND'),
            {
              providerError: Object.assign({}, err, { retryable: false }),
            },
          )
        }
        const providerErrorCodeExtension = (() => {
          if (!err.code) return 'ERROR'
          if (typeof err.code === 'number') return `HTTP_${err.code}_ERROR`
          return normalizeErrorCodePostfix(err.code)
        })()
        if (err.stack) {
          log.debug(`${err.stack}\n${'-'.repeat(100)}`)
        }
        throw Object.assign(
          new ServerlessError(
            message,
            `AWS_${normalizeErrorCodePostfix(
              service.name,
            )}_${normalizeErrorCodePostfix(
              method,
            )}_${providerErrorCodeExtension}`,
          ),
          {
            providerError: err,
            providerErrorCodeExtension,
          },
        )
      }
    }),
  )
  return request
}

awsRequest.memoized = memoize(awsRequest, {
  promise: true,
  normalizer: ([service, method, args]) => {
    if (!isObject(service)) service = { name: ensureString(service) }
    return [
      JSON.stringify(deepSortObjectByKey(service)),
      method,
      JSON.stringify(deepSortObjectByKey(args)),
    ].join('|')
  },
})

export default awsRequest
