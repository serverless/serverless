import { describe, expect, it } from '@jest/globals'
import fs from 'fs'
import os from 'os'
import path from 'path'

const { default: Service } = await import('../../../../lib/classes/service.js')

const createServerlessStub = ({ version, configurationInput }) => ({
  configurationFilename: 'serverless.yml',
  configurationInput: {
    service: 'test-service',
    provider: { name: 'aws' },
    ...configurationInput,
  },
  utils: {
    getVersion: () => version,
  },
})

const loadService = ({ version = '4.32.0', ...configurationInput } = {}) => {
  const service = new Service(
    createServerlessStub({ version, configurationInput }),
  )
  service.loadServiceFileParam()
  return service
}

describe('Service', () => {
  describe('frameworkVersion validation', () => {
    it('should accept "*" (any version)', () => {
      expect(() => loadService({ frameworkVersion: '*' })).not.toThrow()
    })

    it('should accept a caret range covering the current version', () => {
      expect(() =>
        loadService({ frameworkVersion: '^4.0.0', version: '4.32.0' }),
      ).not.toThrow()
    })

    it('should accept an exact pin equal to the current version', () => {
      expect(() =>
        loadService({ frameworkVersion: '4.32.0', version: '4.32.0' }),
      ).not.toThrow()
    })

    it('should accept a different version within the same major', () => {
      expect(() =>
        loadService({ frameworkVersion: '4.1.0', version: '4.32.0' }),
      ).not.toThrow()
    })

    it('should reject a version pin with a different major', () => {
      expect(() =>
        loadService({ frameworkVersion: '3.38.0', version: '4.32.0' }),
      ).toThrow(expect.objectContaining({ code: 'FRAMEWORK_VERSION_MISMATCH' }))
    })

    // A pin this CLI cannot run is a configuration state: one line naming the
    // file, both versions, and both ways out, with no stack trace.
    it('explains a pin from an older major and how to keep or upgrade it', () => {
      let error
      try {
        loadService({ frameworkVersion: '3', version: '4.32.0' })
      } catch (e) {
        error = e
      }
      expect(error.message).toBe(
        'frameworkVersion "3" in serverless.yml does not match this Serverless Framework version (4.32.0). To keep using "3", install it in the project with "npm install --save-dev serverless@3". To use 4.32.0, change frameworkVersion to "4", then run "serverless agent skills read serverless-upgrade".',
      )
      expect(error.stack).toBeUndefined()
    })

    it('does not point a newer pin at the upgrade skill', () => {
      expect(() =>
        loadService({ frameworkVersion: '5', version: '4.32.0' }),
      ).toThrow(
        'frameworkVersion "5" in serverless.yml does not match this Serverless Framework version (4.32.0). To keep using "5", run this service with a CLI that matches it. To use 4.32.0, change frameworkVersion to a range that includes it (for example "4").',
      )
    })

    // The framework is handed the config name without its extension; the
    // message names the file that exists.
    it('names the config file with its extension', () => {
      const serviceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'svc-'))
      fs.writeFileSync(path.join(serviceDir, 'serverless.yml'), '')
      const service = new Service({
        ...createServerlessStub({
          version: '4.32.0',
          configurationInput: { frameworkVersion: '3' },
        }),
        configurationFilename: 'serverless',
        serviceDir,
      })
      expect(() => service.loadServiceFileParam()).toThrow(
        /^frameworkVersion "3" in serverless\.yml does not match/,
      )
    })

    it('should skip validation for an invalid version string by default', () => {
      expect(() => loadService({ frameworkVersion: 'latest' })).not.toThrow()
    })

    it('should reject an invalid version string when configValidationMode is "error"', () => {
      expect(() =>
        loadService({
          frameworkVersion: 'latest',
          configValidationMode: 'error',
        }),
      ).toThrow(expect.objectContaining({ code: 'INVALID_FRAMEWORK_VERSION' }))
    })
  })
})

describe('Service customer-managed runtimes', () => {
  const aliasArn =
    'arn:aws:lambda:us-east-1:123456789012:runtime/companyphp8/alias/prod'

  it('converts a function runtime alias ARN to custom and keeps the value', () => {
    const service = loadService({
      functions: {
        api: { handler: 'index.handler', runtime: aliasArn },
        legacy: { handler: 'index.handler', runtime: 'nodejs24.x' },
      },
    })
    const input = service.serverless.configurationInput
    service.convertCustomerManagedRuntimes()

    expect(service.functions.api.runtime).toBe('custom')
    expect(service.functions.legacy.runtime).toBe('nodejs24.x')
    expect(service.getCustomerManagedRuntime('api')).toBe(aliasArn)
    expect(service.getCustomerManagedRuntime('legacy')).toBeUndefined()
    // `serverless print` reads the configuration input: it keeps what the user wrote
    expect(input.functions.api.runtime).toBe(aliasArn)
  })

  it('applies a provider-level value to functions without their own runtime', () => {
    const ref = { Ref: 'RuntimeStable' }
    const service = loadService({
      provider: { name: 'aws', runtime: ref },
      functions: {
        api: { handler: 'index.handler' },
        legacy: { handler: 'index.handler', runtime: 'python3.14' },
      },
    })
    const input = service.serverless.configurationInput
    service.convertCustomerManagedRuntimes()

    expect(service.provider.runtime).toBe('custom')
    expect(input.provider.runtime).toBe(ref)
    expect(service.getCustomerManagedRuntime('api')).toBe(ref)
    expect(service.getCustomerManagedRuntime('legacy')).toBeUndefined()
  })

  it('keeps the provider-level value after the compiler resolves runtime', () => {
    const service = loadService({
      provider: { name: 'aws', runtime: aliasArn },
      functions: { api: { handler: 'index.handler' } },
    })
    service.convertCustomerManagedRuntimes()
    // compile/functions.js writes the resolved runtime to each function
    service.functions.api.runtime = 'custom'

    expect(service.getCustomerManagedRuntime('api')).toBe(aliasArn)
  })

  it.each(['toString', 'constructor', 'hasOwnProperty'])(
    'has no value for a function named %s on a Lambda-managed runtime',
    (functionName) => {
      const service = loadService({
        provider: { name: 'aws', runtime: 'nodejs24.x' },
        functions: { [functionName]: { handler: 'index.handler' } },
      })
      service.convertCustomerManagedRuntimes()

      expect(service.getCustomerManagedRuntime(functionName)).toBeUndefined()
    },
  )

  it('does not treat a literal custom runtime as customer-managed', () => {
    const service = loadService({
      functions: { api: { handler: 'index.handler', runtime: 'custom' } },
    })
    service.convertCustomerManagedRuntimes()
    expect(service.functions.api.runtime).toBe('custom')
    expect(service.getCustomerManagedRuntime('api')).toBeUndefined()
  })

  it('keeps the stored values out of serialized output', () => {
    const service = loadService({
      functions: { api: { handler: 'index.handler', runtime: aliasArn } },
    })
    service.convertCustomerManagedRuntimes()
    expect(JSON.stringify(service.functions)).not.toContain(aliasArn)
    expect(Object.keys(service)).not.toContain('customerManagedRuntimes')
  })
})
