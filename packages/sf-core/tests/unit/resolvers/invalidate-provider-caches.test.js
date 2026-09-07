import { Readable } from 'node:stream'
import { jest } from '@jest/globals'
import { DescribeStacksCommand } from '@aws-sdk/client-cloudformation'
import { HttpResponse } from '@smithy/core/protocols'
import { variables } from '../../../src/lib/resolvers/index.js'
import { providerRegistry } from '../../../src/lib/resolvers/registry/index.js'
import { Aws } from '../../../src/lib/resolvers/providers/aws/aws.js'
import {
  sendAwsRequest,
  resetAwsResolverState,
} from '../../../src/lib/resolvers/providers/aws/clients.js'

/**
 * The runners' cache-invalidation hook: `variables.invalidateProviderCaches()`
 * fans out to every registered provider, and the AWS provider forwards it to
 * the resolvers' shared response cache. Compose calls it after a service run
 * that may have changed the stacks a later service reads.
 */

const CFN_NS = 'http://cloudformation.amazonaws.com/doc/2010-05-15/'
const describeStacksXml = (stackName) =>
  `<DescribeStacksResponse xmlns="${CFN_NS}"><DescribeStacksResult><Stacks><member>` +
  `<StackName>${stackName}</StackName><CreationTime>2020-01-01T00:00:00Z</CreationTime>` +
  `<StackStatus>CREATE_COMPLETE</StackStatus><Outputs><member>` +
  `<OutputKey>OutA</OutputKey><OutputValue>a-one</OutputValue>` +
  `</member></Outputs></member></Stacks></DescribeStacksResult>` +
  `<ResponseMetadata><RequestId>req-1</RequestId></ResponseMetadata></DescribeStacksResponse>`

/** Fake SDK request handler that always replays one DescribeStacks response. */
const fakeHandler = () => {
  const handle = jest.fn(async () => ({
    response: new HttpResponse({
      statusCode: 200,
      headers: { 'content-type': 'text/xml' },
      body: Readable.from([Buffer.from(describeStacksXml('stack-a'))]),
    }),
  }))
  return {
    handle,
    destroy() {},
    updateHttpClientConfig() {},
    httpHandlerConfigs() {
      return {}
    },
    metadata: { handlerProtocol: 'http/1.1' },
  }
}

describe('variables.invalidateProviderCaches', () => {
  const registered = []

  const register = (provider) => {
    registered.push(provider.type)
    providerRegistry.register(provider.type, provider)
    return provider
  }

  afterEach(() => {
    for (const type of registered.splice(0)) {
      delete providerRegistry.providers[type]
    }
  })

  test('calls the hook once on every provider that implements it', () => {
    const caching = register(
      class {
        static type = 'test-caching-provider'
        static invalidateCaches = jest.fn()
      },
    )
    const alsoCaching = register(
      class {
        static type = 'test-second-caching-provider'
        static invalidateCaches = jest.fn()
      },
    )

    variables.invalidateProviderCaches()

    expect(caching.invalidateCaches).toHaveBeenCalledTimes(1)
    expect(alsoCaching.invalidateCaches).toHaveBeenCalledTimes(1)
  })

  test('a provider without the hook is skipped rather than throwing', () => {
    register(
      class {
        static type = 'test-hookless-provider'
      },
    )
    const caching = register(
      class {
        static type = 'test-caching-provider'
        static invalidateCaches = jest.fn()
      },
    )

    expect(() => variables.invalidateProviderCaches()).not.toThrow()
    // The hookless provider did not abort the fan-out.
    expect(caching.invalidateCaches).toHaveBeenCalledTimes(1)
  })

  test('the Aws provider forwards the hook to the resolvers response cache', async () => {
    const handler = fakeHandler()
    resetAwsResolverState({ requestHandler: handler })
    const logger = { info: jest.fn(), debug: jest.fn() }
    const describeStack = () =>
      sendAwsRequest({
        service: 'cloudformation',
        credentials: {
          accessKeyId: 'AKIAEXAMPLE',
          secretAccessKey: 'secret',
        },
        region: 'us-east-1',
        logger,
        command: new DescribeStacksCommand({ StackName: 'stack-a' }),
        target: 'stack-a',
        cache: true,
      })

    await describeStack()
    await describeStack()
    expect(handler.handle).toHaveBeenCalledTimes(1)

    Aws.invalidateCaches()

    await describeStack()
    expect(handler.handle).toHaveBeenCalledTimes(2)
    resetAwsResolverState()
  })
})
