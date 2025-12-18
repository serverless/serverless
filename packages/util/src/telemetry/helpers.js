export const isCICDEnvironment = () => {
  const ciVars = [
    'CI',
    'CONTINUOUS_INTEGRATION',
    'BUILD_ID',
    'BUILD_NUMBER',
    'TEAMCITY_VERSION',
    'TRAVIS',
    'CIRCLECI',
    'JENKINS_URL',
    'GITLAB_CI',
    'GITHUB_ACTIONS',
    'BITBUCKET_BUILD_NUMBER',
    'BUILDKITE',
    'NOW_BUILDER',
    'APPVEYOR',
  ]

  return ciVars.some((varName) => process.env[varName] !== undefined)
}
