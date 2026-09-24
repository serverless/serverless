/**
 * Where a command's AWS credentials come from, and what to do when AWS
 * rejects them -- one description shared by the deploy path (the account ID
 * lookup's error) and by `serverless agent setup` (its `aws credentials:`
 * line), so both name the same source in the same words.
 */

/**
 * The profile a service command names: `--aws-profile`, else
 * `provider.profile`. The one copy of this rule: the resolver manager builds
 * deploy's default credential resolver with it, and `agent setup` checks the
 * same profile.
 */
export const resolveServiceAwsProfile = ({ options, config } = {}) =>
  options?.['aws-profile'] || config?.provider?.profile

/**
 * Mirrors the precedence `getAwsCredentials` applies: the org's Dashboard
 * provider, then keys in the aws resolver configuration, then the AWS SDK
 * chain -- which skips environment keys whenever a profile is named.
 *
 * @param {object} args
 * @param {object} [args.dashboard] the resolver's dashboard data
 * @param {object} [args.config] the aws resolver configuration (`profile`, keys, `dashboard`)
 * @param {object} [args.env]
 */
export const describeAwsCredentialSource = ({
  dashboard,
  config,
  env = process.env,
} = {}) => {
  if (dashboard?.aws && config?.dashboard !== false) {
    return { source: 'dashboard' }
  }
  if (config?.accessKeyId && config?.secretAccessKey) {
    return { source: 'resolver-config' }
  }
  const profile = config?.profile || env.AWS_PROFILE
  if (profile) return { source: 'profile', profile }
  if (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY) {
    return { source: 'env' }
  }
  return { source: 'profile', profile: 'default' }
}

const FIX = {
  env: () =>
    'the credentials come from AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY in the environment, which take priority over any profile: replace them, or unset them to use a profile',
  // With an aws resolver, --aws-profile is ignored: the resolver's profile
  // is the one to change.
  profile: ({ profile, resolver }) =>
    `the credentials come from AWS profile "${profile}"${resolver ? `, set by resolver "${resolver}" in serverless.yml` : ''}: sign in again with "serverless login aws --aws-profile ${profile}" (or "serverless login aws sso" for an SSO profile) in an interactive terminal, update the profile's keys, or ${resolver ? `change the profile of resolver "${resolver}"` : 'choose another profile with --aws-profile'}`,
  dashboard: () =>
    "the credentials come from the org's Serverless Dashboard Provider: check that Provider's settings",
  'resolver-config': () =>
    'the credentials come from accessKeyId/secretAccessKey in the aws resolver configuration in serverless.yml: update them',
}

/**
 * What to do when AWS rejects the credentials from `source`; pass
 * `resolver` when an aws resolver in serverless.yml supplied them.
 */
export const awsCredentialsFix = (source) => FIX[source.source](source)

/**
 * No credentials could be loaded at all (as opposed to AWS rejecting them):
 * what is missing and how to set it up. `profile` is the one the command
 * named, if any; `resolver` is the aws resolver in serverless.yml that named
 * it, whose profile `--aws-profile` does not override. Shared by the
 * AWS_CREDENTIALS_MISSING error and `serverless agent setup`'s aws line.
 *
 * @returns {{ problem: string, fix: string }}
 */
/**
 * Whether the AWS SDK's error says an SSO profile's sign-in has lapsed
 * ("Token is expired. To refresh this SSO session run 'aws sso login' …",
 * "The SSO session associated with this profile has expired …").
 *
 * @param {string} [message]
 * @returns {boolean}
 */
export const isExpiredSsoSession = (message = '') =>
  /sso/i.test(message) && /expired|invalid/i.test(message)

export const describeMissingAwsCredentials = ({
  profile,
  resolver,
  ssoExpired,
} = {}) => {
  if (ssoExpired) {
    const signIn = `sign in again with "serverless login aws sso${profile ? ` --aws-profile ${profile}` : ''}" in an interactive terminal`
    return {
      problem: profile
        ? `the SSO session of profile "${profile}"${resolver ? `, which resolver "${resolver}" uses,` : ''} has expired`
        : 'the SSO session has expired',
      fix: signIn,
    }
  }
  const createProfile = `create it with "serverless login aws --aws-profile ${profile}" in an interactive terminal`
  if (profile && resolver) {
    return {
      problem: `resolver "${resolver}" uses profile "${profile}", which has no usable credentials`,
      fix: `${createProfile}, or change the profile of resolver "${resolver}" in serverless.yml`,
    }
  }
  if (profile) {
    return {
      problem: `profile "${profile}" has no usable credentials`,
      fix: `${createProfile}, or name another profile in provider.profile or with --aws-profile`,
    }
  }
  return {
    problem: resolver
      ? `resolver "${resolver}" names no profile or keys, and none were found`
      : 'not found',
    fix: 'set AWS_PROFILE or AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY, or run "serverless login aws" in an interactive terminal',
  }
}
