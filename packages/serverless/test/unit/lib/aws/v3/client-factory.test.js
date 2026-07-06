import { jest } from '@jest/globals'

jest.unstable_mockModule('@serverless/util', () => ({
  addProxyToAwsClient: jest.fn((client) => client),
}))

jest.unstable_mockModule('../../../../../lib/aws/s3-acceleration.js', () => ({
  shouldS3Accelerate: jest.fn(() => false),
}))

const { getNamespaceForService, canonicalizeServiceName, pascalCase } =
  await import('../../../../../lib/aws/v3/client-factory.js')

import * as LambdaMicrovmsNS from '@aws-sdk/client-lambda-microvms'
import * as LambdaNS from '@aws-sdk/client-lambda'

describe('client-factory', () => {
  describe('getNamespaceForService', () => {
    it('resolves LambdaMicrovms to the @aws-sdk/client-lambda-microvms namespace', () => {
      const ns = getNamespaceForService('LambdaMicrovms')
      expect(ns).toBe(LambdaMicrovmsNS)
    })

    it('LambdaMicrovms namespace exposes ListManagedMicrovmImageVersionsCommand', () => {
      const ns = getNamespaceForService('LambdaMicrovms')
      expect(typeof ns.ListManagedMicrovmImageVersionsCommand).toBe('function')
    })

    it('resolves Lambda to the @aws-sdk/client-lambda namespace (regression)', () => {
      const ns = getNamespaceForService('Lambda')
      expect(ns).toBe(LambdaNS)
    })

    it('returns undefined for an unknown service', () => {
      expect(getNamespaceForService('NonExistentService')).toBeUndefined()
    })
  })

  describe('pascalCase', () => {
    it('converts listManagedMicrovmImageVersions to ListManagedMicrovmImageVersions', () => {
      expect(pascalCase('listManagedMicrovmImageVersions')).toBe(
        'ListManagedMicrovmImageVersions',
      )
    })
  })

  describe('canonicalizeServiceName', () => {
    it('passes LambdaMicrovms through unchanged', () => {
      expect(canonicalizeServiceName('LambdaMicrovms')).toBe('LambdaMicrovms')
    })
  })
})
