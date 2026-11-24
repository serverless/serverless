/**
 * A function on a customer-managed runtime cannot run locally: the runtime's
 * contents are an image the consumer cannot read. `invoke local` says so and
 * names the remote command, before it reads input or credentials.
 */

import { jest } from '@jest/globals'

const { default: AwsInvokeLocal } =
  await import('../../../../../../lib/plugins/aws/invoke-local/index.js')

const contextFor = (functionObj, providerRuntime) => ({
  validate: jest.fn(),
  validateFile: jest.fn(),
  options: { function: 'api' },
  serverless: { service: { getFunction: () => functionObj } },
  provider: { getRuntime: (runtime) => runtime || providerRuntime },
})

describe('invoke local and customer-managed runtimes', () => {
  it('stops with a message that names serverless invoke', async () => {
    const context = contextFor({ handler: 'index.handler', runtime: 'custom' })
    await expect(
      AwsInvokeLocal.prototype.extendedValidate.call(context),
    ).rejects.toMatchObject({
      code: 'INVOKE_LOCAL_CUSTOMER_MANAGED_RUNTIME_UNSUPPORTED',
      message:
        'Function "api" uses a customer-managed runtime, which cannot run locally. Deploy and run "serverless invoke --function api" instead.',
    })
  })

  it('applies a provider-level customer-managed runtime', async () => {
    const context = contextFor({ handler: 'index.handler' }, 'custom')
    await expect(
      AwsInvokeLocal.prototype.extendedValidate.call(context),
    ).rejects.toMatchObject({
      code: 'INVOKE_LOCAL_CUSTOMER_MANAGED_RUNTIME_UNSUPPORTED',
    })
  })
})
