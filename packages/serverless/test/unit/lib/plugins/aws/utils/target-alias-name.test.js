import targetAliasName from '../../../../../../lib/plugins/aws/utils/target-alias-name.js'

describe('targetAliasName', () => {
  test.each([
    ['a function without an alias', {}, undefined],
    ['durableConfig', { durableConfig: { executionTimeout: 60 } }, 'durable'],
    ['snapStart', { snapStart: true }, 'snapstart'],
    [
      'durableConfig with snapStart',
      { durableConfig: { executionTimeout: 60 }, snapStart: true },
      'snapstart',
    ],
    [
      'provisionedConcurrency as a number',
      { provisionedConcurrency: 2 },
      'provisioned',
    ],
    [
      'provisionedConcurrency with its own alias',
      { provisionedConcurrency: { executions: 2, alias: 'live' } },
      'live',
    ],
    [
      'durableConfig with provisionedConcurrency',
      {
        durableConfig: { executionTimeout: 60 },
        provisionedConcurrency: { executions: 2, alias: 'live' },
      },
      'live',
    ],
  ])('names the alias for %s', (_, functionObject, expected) => {
    expect(targetAliasName(functionObject)).toBe(expected)
  })
})
