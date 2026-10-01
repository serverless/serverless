// A short id unique to one test run: the current time in base36 seconds, then
// three random base36 characters. The time part keeps runs in the same AWS
// account from reusing each other's stage or stack names, including stacks an
// earlier run left behind; the random part separates suites that start in the
// same second.
export const getTestRunId = () => {
  const seconds = Math.floor(Date.now() / 1000)
    .toString(36)
    .padStart(6, '0')
  const random = Math.floor(Math.random() * 36 ** 3)
    .toString(36)
    .padStart(3, '0')
  return `${seconds}${random}`
}

// The stage becomes part of CloudFormation stack names, which allow only
// letters, digits and hyphens. CI sets TEST_STAGE from the pull request
// author's login, and GitHub App logins look like `name[bot]`, so clean the
// value before shortening it. Default Lambda role names
// (`<service>-<stage>-<region>-lambdaRole`) are limited to 64 characters, and
// some suites derive another stage by adding up to two characters, so the
// result stays within 15: a 5-character prefix, `t` and the 9-character run id.
export const getTestStageName = () => {
  const prefix = (process.env.TEST_STAGE ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 5)

  const runId = getTestRunId()
  return prefix ? `${prefix}t${runId}` : runId
}
