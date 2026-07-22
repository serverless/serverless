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
    test('appends IA to the normalized name after the LogGroup suffix', () => {
      expect(
        naming.getLogGroupLogicalId('my-fn', {
          logGroupClass: 'INFREQUENT_ACCESS',
        }),
      ).toBe('MyDashfnLogGroupIA')
    })

    test('returns the standard logical id when logGroupClass is STANDARD', () => {
      expect(
        naming.getLogGroupLogicalId('my-fn', { logGroupClass: 'STANDARD' }),
      ).toBe('MyDashfnLogGroup')
    })

    test('returns the standard logical id when no options are provided', () => {
      expect(naming.getLogGroupLogicalId('my-fn')).toBe('MyDashfnLogGroup')
    })

    test('IA logical id of one function cannot equal the standard logical id of another', () => {
      // A function key ending in "IA" used to collide with the IA logical id of another
      // function. With the suffix placed after "LogGroup", no normalized function name can
      // produce an id that ends with another function's IA id, so collisions are structurally
      // impossible.
      const standardOfFnIa = naming.getLogGroupLogicalId('fnIA')
      const iaOfFn = naming.getLogGroupLogicalId('fn', {
        logGroupClass: 'INFREQUENT_ACCESS',
      })
      expect(standardOfFnIa).not.toBe(iaOfFn)

      const standardOfFnLogGroupIa = naming.getLogGroupLogicalId('fnLogGroupIA')
      expect(standardOfFnLogGroupIa).not.toBe(iaOfFn)
    })
  })

  describe('#getLambdaLayerS3ObjectVersionOutputLogicalId()', () => {
    it('should normalize the layer name and add the S3ObjectVersion suffix', () => {
      expect(
        naming.getLambdaLayerS3ObjectVersionOutputLogicalId('test'),
      ).toEqual('TestLambdaLayerS3ObjectVersion')
    })
  })
})
