import { describe, it, expect } from '@jest/globals'
import {
  getNamespaceForService,
  canonicalizeServiceName,
} from '../../../../../lib/aws/v3/client-factory.js'

describe('client-factory', () => {
  describe('getNamespaceForService', () => {
    it('should return the SESV2 namespace', () => {
      const ns = getNamespaceForService('SESV2')
      expect(ns).toBeDefined()
      expect(ns.SESv2Client).toBeDefined()
    })

    it('should return namespaces for existing services', () => {
      const services = [
        'S3',
        'STS',
        'ECR',
        'CloudFormation',
        'CloudWatch',
        'CloudWatchLogs',
        'Lambda',
        'IAM',
        'APIGateway',
        'ApiGatewayV2',
        'IoT',
      ]
      for (const service of services) {
        expect(getNamespaceForService(service)).toBeDefined()
      }
    })

    it('should return undefined for unknown services', () => {
      expect(getNamespaceForService('NonExistent')).toBeUndefined()
    })
  })

  describe('canonicalizeServiceName', () => {
    it('should convert Iot to IoT', () => {
      expect(canonicalizeServiceName('Iot')).toBe('IoT')
    })

    it('should convert SESV2 to SESv2', () => {
      expect(canonicalizeServiceName('SESV2')).toBe('SESv2')
    })

    it('should pass through other names unchanged', () => {
      expect(canonicalizeServiceName('S3')).toBe('S3')
      expect(canonicalizeServiceName('Lambda')).toBe('Lambda')
    })
  })
})
