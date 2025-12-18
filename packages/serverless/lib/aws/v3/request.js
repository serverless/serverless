import _ from 'lodash'
import memoize from 'memoizee'
import { requestQueue, MAX_RETRIES } from '../request-queue.js'
import ServerlessError from '../../serverless-error.js'
import { log } from '@serverless/util'
import deepSortObjectByKey from '../../utils/deep-sort-object-by-key.js'
import ensureString from 'type/string/ensure.js'
import isObject from 'type/object/is.js'
import wait from 'timers-ext/promise/sleep.js'
import { createPersistentRequest } from '../request-retry.js'
import { Upload } from '@aws-sdk/lib-storage'
import {
  createV3ClientFactory,
  canonicalizeServiceName,
  getNamespaceForService,
  pascalCase,
} from './client-factory.js'
import { handleV3Error } from './error-utils.js'

const awsLog = log.get('sls:aws:request')

const { getV3Client } = createV3ClientFactory()

let requestCounter = 0

async function awsRequest(service, method, ...args) {
  if (isObject(service)) {
    ensureString(service.name, { name: 'service.name' })
  } else {
    ensureString(service, { name: 'service' })
    service = { name: service }
  }
  const persistentRequest = createPersistentRequest(MAX_RETRIES, log, wait)
  const request = await requestQueue.add(() =>
    persistentRequest(async () => {
      const requestId = ++requestCounter
      awsLog.debug(
        `request: #${requestId} ${service.name}.${method} [v3]`,
        args,
      )
      try {
        const result = await execute(service, method, args)
        awsLog.debug(
          `request result: #${requestId} ${service.name}.${method} [v3]`,
          result,
        )
        return result
      } catch (err) {
        handleV3Error(err, {
          serviceName: service.name,
          method,
          requestId,
          awsLog,
          log,
        })
      }
    }),
  )
  return request
}

async function execute(service, method, args) {
  const client = getV3Client(service, method)
  const canonical = canonicalizeServiceName(service.name)
  if (canonical === 'S3' && method === 'upload') {
    const uploader = new Upload({ client, params: args[0] })
    return uploader.done()
  }
  const ns = getNamespaceForService(service.name)
  if (!ns) {
    throw new ServerlessError(
      `Unsupported AWS service for v3 request path: ${service.name}`,
      'AWS_V3_UNSUPPORTED_SERVICE',
    )
  }
  const commandName = `${pascalCase(method)}Command`
  const Cmd = ns[commandName]
  if (!Cmd) {
    throw new ServerlessError(
      `Cannot resolve v3 command constructor: ${canonical}.${commandName}`,
      'AWS_V3_COMMAND_NOT_FOUND',
    )
  }
  const command = new Cmd(args[0] || {})
  return client.send(command)
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
