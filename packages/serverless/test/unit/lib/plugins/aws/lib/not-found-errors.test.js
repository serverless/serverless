import { describe, expect, it } from '@jest/globals'
import {
  isResourceNotFound,
  isStackNotFound,
  isStackResourceNotFound,
} from '../../../../../../lib/plugins/aws/lib/not-found-errors.js'

describe('isResourceNotFound', () => {
  it('matches the provider wrapper error code', () => {
    expect(
      isResourceNotFound(
        Object.assign(new Error('The specified log group does not exist.'), {
          providerError: { code: 'ResourceNotFoundException' },
        }),
      ),
    ).toBe(true)
  })

  it('matches an SDK client error name', () => {
    const error = new Error('not found')
    error.name = 'ResourceNotFoundException'
    expect(isResourceNotFound(error)).toBe(true)
  })

  it.each([
    undefined,
    null,
    new Error('ResourceNotFoundException'),
    Object.assign(new Error('denied'), {
      providerError: { code: 'AccessDeniedException' },
    }),
  ])('does not match %p', (error) => {
    expect(isResourceNotFound(error)).toBe(false)
  })
})

describe('isStackNotFound', () => {
  it("matches CloudFormation's missing-stack message", () => {
    expect(
      isStackNotFound(new Error('Stack with id shop-dev does not exist')),
    ).toBe(true)
  })

  it.each([
    undefined,
    new Error('Role arn:aws:iam::123456789012:role/x does not exist'),
    new Error('Stack with id shop-dev does not exist; and more'),
    new Error('Rate exceeded'),
  ])('does not match %p', (error) => {
    expect(isStackNotFound(error)).toBe(false)
  })
})

describe('isStackResourceNotFound', () => {
  // The messages describeStackResource answers with, as probed
  it.each([
    "Stack 'shop-dev' does not exist",
    'Resource ApiWebFunctionLogGroup does not exist for stack shop-dev',
  ])('matches %p', (message) => {
    expect(isStackResourceNotFound(new Error(message))).toBe(true)
  })

  it.each([
    undefined,
    new Error('Stack with id shop-dev does not exist'),
    new Error("Stack 'shop-dev' does not exist; and more"),
    new Error(
      'User is not authorized to perform: cloudformation:DescribeStackResource',
    ),
  ])('does not match %p', (error) => {
    expect(isStackResourceNotFound(error)).toBe(false)
  })
})
