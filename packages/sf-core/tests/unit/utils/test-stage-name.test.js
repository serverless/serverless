import { jest } from '@jest/globals'
import { getTestRunId, getTestStageName } from '../../utils/testStageName.js'

// The stage becomes part of CloudFormation stack names, which allow only
// letters, digits and hyphens. CI sets TEST_STAGE from the pull request
// author's login, and GitHub App logins look like `name[bot]`.
const STACK_NAME_SAFE = /^[a-z0-9-]+$/
// Some suites derive another stage by adding up to two characters, and
// default Lambda role names (`<service>-<stage>-<region>-lambdaRole`) are
// limited to 64 characters, so a generated stage stays within 15.
const MAX_STAGE_LENGTH = 15
// Seconds since the epoch in base36 (6 characters), then 3 random characters.
const RUN_ID = '[0-9a-z]{9}'

describe('getTestRunId', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('is the current time in base36 seconds followed by 3 random characters', () => {
    jest.spyOn(Date, 'now').mockReturnValue(1790000000000)
    const id = getTestRunId()
    expect(id).toMatch(new RegExp(`^${RUN_ID}$`))
    expect(parseInt(id.slice(0, 6), 36)).toBe(1790000000)
  })

  // A later run never reuses an earlier run's stage, so it can't collide with
  // stacks an earlier run left behind.
  test('sorts after any id generated earlier', () => {
    jest.spyOn(Date, 'now').mockReturnValueOnce(1790000000000)
    const earlier = getTestRunId()
    jest.spyOn(Date, 'now').mockReturnValueOnce(1790000001000)
    const later = getTestRunId()
    expect(later.slice(0, 6) > earlier.slice(0, 6)).toBe(true)
  })

  test('differs between calls in the same second', () => {
    jest.spyOn(Date, 'now').mockReturnValue(1790000000000)
    const ids = new Set(Array.from({ length: 50 }, () => getTestRunId()))
    expect(ids.size).toBeGreaterThan(45)
  })
})

describe('getTestStageName', () => {
  const originalTestStage = process.env.TEST_STAGE

  afterEach(() => {
    if (originalTestStage === undefined) delete process.env.TEST_STAGE
    else process.env.TEST_STAGE = originalTestStage
  })

  test('is just the run id when TEST_STAGE is unset', () => {
    delete process.env.TEST_STAGE
    expect(getTestStageName()).toMatch(new RegExp(`^${RUN_ID}$`))
  })

  test('is just the run id when TEST_STAGE is empty', () => {
    process.env.TEST_STAGE = ''
    expect(getTestStageName()).toMatch(new RegExp(`^${RUN_ID}$`))
  })

  test.each([
    ['pr-czubocha', 'pr-czt'],
    ['mr-Czubocha', 'mr-czt'],
    ['pr-dependabot[bot]', 'pr-det'],
    ['pr-', 'pr-t'],
  ])('keeps a five-character prefix of %s', (testStage, prefix) => {
    process.env.TEST_STAGE = testStage
    expect(getTestStageName()).toMatch(new RegExp(`^${prefix}${RUN_ID}$`))
  })

  test.each([
    ['pr-cursor[bot]', 'pr-cut'],
    ['pr-a_b_c', 'pr-a-t'],
    ['pr--double', 'pr-dot'],
  ])('replaces characters a stack name rejects in %s', (testStage, prefix) => {
    process.env.TEST_STAGE = testStage
    expect(getTestStageName()).toMatch(new RegExp(`^${prefix}${RUN_ID}$`))
  })

  test.each([
    'pr-cursor[bot]',
    'pr-renovate[bot]',
    'pr-copilot-swe-agent[bot]',
    'pr-a.b/c d',
    'mr-github-actions[bot]',
  ])(
    'produces a stack-name-safe stage of at most 15 characters for %s',
    (testStage) => {
      process.env.TEST_STAGE = testStage
      const stage = getTestStageName()
      expect(stage).toMatch(STACK_NAME_SAFE)
      expect(stage.length).toBeLessThanOrEqual(MAX_STAGE_LENGTH)
    },
  )
})
