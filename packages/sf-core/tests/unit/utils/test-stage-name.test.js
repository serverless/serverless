import { getTestStageName } from '../../utils/testStageName.js'

// The stage becomes part of CloudFormation stack names, which allow only
// letters, digits and hyphens. CI sets TEST_STAGE from the pull request
// author's login, and GitHub App logins look like `name[bot]`.
const STACK_NAME_SAFE = /^[a-z0-9-]+$/

describe('getTestStageName', () => {
  const originalTestStage = process.env.TEST_STAGE

  afterEach(() => {
    if (originalTestStage === undefined) delete process.env.TEST_STAGE
    else process.env.TEST_STAGE = originalTestStage
  })

  test('returns a random four-digit id when TEST_STAGE is unset', () => {
    delete process.env.TEST_STAGE
    expect(getTestStageName()).toMatch(/^\d{4}$/)
  })

  test('returns a random four-digit id when TEST_STAGE is empty', () => {
    process.env.TEST_STAGE = ''
    expect(getTestStageName()).toMatch(/^\d{4}$/)
  })

  test.each([
    ['pr-czubocha', 'pr-czubocht'],
    ['mr-Czubocha', 'mr-czubocht'],
    ['pr-dependabot[bot]', 'pr-dependat'],
    ['pr-', 'pr-t'],
  ])('keeps the existing prefix for %s', (testStage, prefix) => {
    process.env.TEST_STAGE = testStage
    expect(getTestStageName()).toMatch(new RegExp(`^${prefix}\\d{4}$`))
  })

  test.each([
    ['pr-cursor[bot]', 'pr-cursor-t'],
    ['pr-a_b_c', 'pr-a-b-ct'],
    ['pr--double', 'pr-doublet'],
  ])('replaces characters a stack name rejects in %s', (testStage, prefix) => {
    process.env.TEST_STAGE = testStage
    expect(getTestStageName()).toMatch(new RegExp(`^${prefix}\\d{4}$`))
  })

  test.each([
    'pr-cursor[bot]',
    'pr-renovate[bot]',
    'pr-copilot-swe-agent[bot]',
    'pr-a.b/c d',
    'mr-github-actions[bot]',
  ])('produces a stack-name-safe stage for %s', (testStage) => {
    process.env.TEST_STAGE = testStage
    expect(getTestStageName()).toMatch(STACK_NAME_SAFE)
  })
})
