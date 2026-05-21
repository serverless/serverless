'use strict'

import naming from '../../../../../../lib/plugins/aws/lib/naming.js'

describe('aws naming', () => {
  describe('getLogGroupName', () => {
    test('returns the AWS-default Lambda log group path for a plain name', () => {
      expect(naming.getLogGroupName('my-fn')).toBe('/aws/lambda/my-fn')
    })

    test('passes the function name through unchanged', () => {
      expect(naming.getLogGroupName('serviceName-stage-fn')).toBe(
        '/aws/lambda/serviceName-stage-fn',
      )
    })

    test('handles underscores in the function name', () => {
      expect(naming.getLogGroupName('my_fn')).toBe('/aws/lambda/my_fn')
    })
  })

  describe('getLogGroupLogicalId', () => {
    test('appends LogGroup to the normalized function name', () => {
      expect(naming.getLogGroupLogicalId('myFn')).toBe('MyFnLogGroup')
    })

    test('replaces hyphens with Dash in the normalized name', () => {
      expect(naming.getLogGroupLogicalId('my-fn')).toBe('MyDashfnLogGroup')
    })

    test('replaces underscores with Underscore in the normalized name', () => {
      expect(naming.getLogGroupLogicalId('my_fn')).toBe(
        'MyUnderscorefnLogGroup',
      )
    })

    test('upper-cases the first character of the normalized name', () => {
      expect(naming.getLogGroupLogicalId('hello')).toBe('HelloLogGroup')
    })
  })

  describe('getNormalizedFunctionName', () => {
    test('matches the behavior used to build log group logical ids', () => {
      const fn = 'orders-api'
      expect(naming.getLogGroupLogicalId(fn)).toBe(
        `${naming.getNormalizedFunctionName(fn)}LogGroup`,
      )
    })
  })

  describe('getLogGroupName with INFREQUENT_ACCESS class', () => {
    test('appends -ia suffix to the function name', () => {
      expect(
        naming.getLogGroupName('my-fn', { logGroupClass: 'INFREQUENT_ACCESS' }),
      ).toBe('/aws/lambda/my-fn-ia')
    })

    test('returns the standard name when logGroupClass is STANDARD', () => {
      expect(
        naming.getLogGroupName('my-fn', { logGroupClass: 'STANDARD' }),
      ).toBe('/aws/lambda/my-fn')
    })

    test('returns the standard name when no options are provided', () => {
      expect(naming.getLogGroupName('my-fn')).toBe('/aws/lambda/my-fn')
    })
  })

  describe('getLogGroupLogicalId with INFREQUENT_ACCESS class', () => {
    test('appends IA to the normalized name before the LogGroup suffix', () => {
      expect(
        naming.getLogGroupLogicalId('my-fn', {
          logGroupClass: 'INFREQUENT_ACCESS',
        }),
      ).toBe('MyDashfnIALogGroup')
    })

    test('returns the standard logical id when logGroupClass is STANDARD', () => {
      expect(
        naming.getLogGroupLogicalId('my-fn', { logGroupClass: 'STANDARD' }),
      ).toBe('MyDashfnLogGroup')
    })

    test('returns the standard logical id when no options are provided', () => {
      expect(naming.getLogGroupLogicalId('my-fn')).toBe('MyDashfnLogGroup')
    })
  })
})
