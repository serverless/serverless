'use strict'

import { validateSandboxes } from '../../../../../../../lib/plugins/aws/sandboxes/validators/config.js'
const err = () => {
  const f = (m) => {
    throw new Error(m)
  }
  return f
}
describe('validateSandboxes', () => {
  test('requires artifact', () => {
    expect(() => validateSandboxes({ a: {} }, { throwError: err() })).toThrow(
      /artifact.*required/i,
    )
  })
  test('rejects ECR / non-s3 artifact URI', () => {
    expect(() =>
      validateSandboxes(
        { a: { artifact: '123.dkr.ecr.us-east-1.amazonaws.com/x:latest' } },
        { throwError: err() },
      ),
    ).toThrow(/must be a local directory or an s3:\/\/ URI/i)
  })
  test('rejects invalid memory', () => {
    expect(() =>
      validateSandboxes(
        { a: { artifact: './x', minimumMemory: 3000 } },
        { throwError: err() },
      ),
    ).toThrow(/memory must be one of/i)
  })
  test('accepts a valid minimal config', () => {
    expect(() =>
      validateSandboxes({ a: { artifact: './x' } }, { throwError: err() }),
    ).not.toThrow()
  })
  test('with a non-throwing error collector, a missing-artifact sandbox does not cascade', () => {
    const errors = []
    const collect = (m) => errors.push(m)
    expect(() =>
      validateSandboxes(
        { a: { minimumMemory: 3000 } },
        { throwError: collect },
      ),
    ).not.toThrow()
    expect(errors).toEqual([expect.stringMatching(/artifact.*required/i)])
  })
  test('vpc with subnetIds but no securityGroupIds → error', () => {
    expect(() =>
      validateSandboxes(
        {
          a: {
            artifact: './x',
            vpc: { subnetIds: ['subnet-aaa'] },
          },
        },
        { throwError: err() },
      ),
    ).toThrow(/securityGroup/i)
  })
  test('vpc with empty securityGroupIds array → error', () => {
    expect(() =>
      validateSandboxes(
        {
          a: {
            artifact: './x',
            vpc: { subnetIds: ['subnet-aaa'], securityGroupIds: [] },
          },
        },
        { throwError: err() },
      ),
    ).toThrow(/securityGroup/i)
  })
  test('vpc with both subnetIds and securityGroupIds → ok', () => {
    expect(() =>
      validateSandboxes(
        {
          a: {
            artifact: './x',
            vpc: { subnetIds: ['subnet-aaa'], securityGroupIds: ['sg-111'] },
          },
        },
        { throwError: err() },
      ),
    ).not.toThrow()
  })

  test('alarms without notify is an error', () => {
    const errors = []
    validateSandboxes(
      { a: { artifact: './x', observability: { alarms: { thresholds: {} } } } },
      { throwError: (m) => errors.push(m) },
    )
    expect(errors.join('\n')).toMatch(/alarms.*notify/i)
  })

  test('alarms with notify is ok', () => {
    const errors = []
    validateSandboxes(
      { a: { artifact: './x', observability: { alarms: { notify: 'arn' } } } },
      { throwError: (m) => errors.push(m) },
    )
    expect(errors).toHaveLength(0)
  })

  test('invalid retentionDays is an error', () => {
    const errors = []
    validateSandboxes(
      {
        a: { artifact: './x', observability: { logs: { retentionDays: 13 } } },
      },
      { throwError: (m) => errors.push(m) },
    )
    expect(errors.join('\n')).toMatch(/retentionDays/i)
  })

  test('alarms with metrics.enabled:false is an error (no backing metric)', () => {
    const errors = []
    validateSandboxes(
      {
        a: {
          artifact: './x',
          observability: {
            metrics: { enabled: false },
            alarms: { notify: 'arn' },
          },
        },
      },
      { throwError: (m) => errors.push(m) },
    )
    expect(errors.join('\n')).toMatch(/alarms requires metrics/i)
  })

  test('alarms with logs.enabled:false is an error (logging disabled)', () => {
    const errors = []
    validateSandboxes(
      {
        a: {
          artifact: './x',
          observability: {
            logs: { enabled: false },
            alarms: { notify: 'arn' },
          },
        },
      },
      { throwError: (m) => errors.push(m) },
    )
    expect(errors.join('\n')).toMatch(/alarms requires metrics/i)
  })
})
