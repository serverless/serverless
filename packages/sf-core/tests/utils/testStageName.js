// The stage becomes part of CloudFormation stack names, which allow only
// letters, digits and hyphens. CI sets TEST_STAGE from the pull request
// author's login, and GitHub App logins look like `name[bot]`, so clean the
// value before shortening it.
export const getTestStageName = () => {
  const randomId = Math.floor(1000 + Math.random() * 9000).toString()

  const prefix = (process.env.TEST_STAGE ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 10)

  return prefix ? `${prefix}t${randomId}` : randomId
}
