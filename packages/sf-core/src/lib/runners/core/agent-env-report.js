/**
 * Environment checks + the `environment:` report lines for
 * `serverless agent setup`.
 *
 * Nothing here triggers an interactive login or writes to disk. The AWS check
 * goes through deploy's own credential provider -- the same chain, the same
 * profile rule and the same STS account lookup -- so the line says what a
 * deploy would find: the account, or AWS's rejection with its fix. It runs
 * behind a timeout and can never reject.
 */
import { readFile } from 'fs/promises'
import _ from 'lodash'
import { getRcGlobalPath, getRcLocalPath } from '@serverless/util'
import { NOT_SIGNED_IN_REMEDY } from '../../auth/sign-in-guidance.js'
import {
  awsCredentialsFix,
  describeAwsCredentialSource,
  describeMissingAwsCredentials,
  isExpiredSsoSession,
  resolveServiceAwsProfile,
} from '../../resolvers/providers/aws/credential-source.js'

const readJson = async (file) => {
  try {
    const contents = await readFile(file, 'utf8')
    return contents ? JSON.parse(contents) : null
  } catch {
    return null
  }
}

/**
 * Read .serverlessrc the way authenticate() sees it -- the global file with a
 * .serverlessrc in the current directory merged over it (util's getRcConfig)
 * -- WITHOUT touching the disk.
 *
 * Deliberately not util's getRcConfig: it CREATES a default global rc file
 * when none exists and renames an unreadable one to .bak, and a
 * detection-only check must never write. The path helpers only stat.
 */
const readRcConfig = async () => {
  const global = await readJson(await getRcGlobalPath('serverless'))
  const local = await readJson(getRcLocalPath('serverless'))
  if (!global && !local) return null
  return _.merge({}, global, local)
}

// The sign-in sources, in the order authenticate() (auth/index.js) uses them:
// an access key (env, alias too), a signed-in user session, a license key from
// the environment (alias too), `licenseKey` in serverless.yml, then a license
// key saved in the rc store. A license key fetched from SSM when none of these
// exists cannot be seen without calling AWS, so it is not reported.
// A value of only spaces counts as unset, as authenticate() treats it.
const envKey = (env, names) => names.find((name) => env[name]?.trim())
const ACCESS_KEYS = ['SERVERLESS_ACCESS_KEY', 'SERVERLESS_USER_ACCESS_KEY']
const LICENSE_KEYS = ['SERVERLESS_LICENSE_KEY', 'SERVERLESS_ORG_ACCESS_KEY']
const fromEnv = (state, names, variable) =>
  variable === names[0] ? { state } : { state, variable }

export const detectServerlessAuth = async ({
  env = process.env,
  // the service's serverless.yml, unresolved, when there is one
  config,
  getRcConfig = readRcConfig,
} = {}) => {
  const access = envKey(env, ACCESS_KEYS)
  if (access) return fromEnv('env-access', ACCESS_KEYS, access)
  let rc = null
  try {
    rc = await getRcConfig()
  } catch {
    /* unreadable rc = no saved sign-in */
  }
  const user = rc?.userId && rc?.users?.[rc.userId]
  if (user?.dashboard) {
    // The default org is what a command targets when neither --org nor
    // the service's `org:` names one; its access key is fetched on first
    // use, so a default with no saved key yet is still the answer. Without
    // a default, fall back to the first org that has a key.
    const org =
      user.defaultOrgName || Object.keys(user.dashboard.accessKeys ?? {})[0]
    return {
      state: 'rc-user',
      user: user.username ?? user.userName ?? 'user',
      ...(org && { org }),
    }
  }
  const license = envKey(env, LICENSE_KEYS)
  if (license) return fromEnv('env-license', LICENSE_KEYS, license)
  if (typeof config?.licenseKey === 'string' && config.licenseKey.trim())
    return { state: 'config-license' }
  // A license key saved by the interactive prompt: the default org, else the
  // only one.
  const licenseOrgs = Object.keys(rc?.accessKeys?.orgs ?? {})
  if (licenseOrgs.length) {
    const org =
      rc.accessKeys.defaultOrgName ||
      (licenseOrgs.length === 1 ? licenseOrgs[0] : undefined)
    return { state: 'rc-license', ...(org && { org }) }
  }
  return { state: 'none' }
}

// Deploy's credential provider, loaded only when the check runs.
const deployCredentialProvider = async (args) =>
  (
    await import('../../../utils/credentials/index.js')
  ).getAwsCredentialProvider(args)

const TIMED_OUT = Symbol('timed out')

const FOUND_BY_SOURCE = {
  env: () => ({ state: 'env' }),
  profile: ({ profile }) => ({ state: 'profile', profile }),
  'resolver-config': () => ({ state: 'resolver-keys' }),
}

const hasVariable = (value) => typeof value === 'string' && value.includes('${')

/**
 * @param {object} [args]
 * @param {object} [args.config] the service's serverless.yml, unresolved
 * @param {object} [args.options] CLI options (`--aws-profile`)
 * @param {{ name: string, config: object }} [args.credentialResolver] the
 *   config-declared aws resolver a deploy takes its credentials from, if any
 * @returns {Promise<object>} `state` is the source (`env`, `profile`,
 *   `resolver-keys`; `resolver` names the resolver when one is used) or
 *   `sso-expired` / `none`; `check` says whether AWS confirmed it
 *   (`verified`, with `account` and `region`), refused it (`rejected`, with
 *   AWS's words in `reason`), or could not be asked (`unverified`: `timeout`,
 *   `network` with the error in `detail`, or `variable` for a profile or
 *   region that only variable resolution could name; `variableRegion` holds
 *   the unresolved region when that is the setting).
 */
export const detectAwsCredentials = async ({
  env = process.env,
  config,
  options = {},
  // The config-declared aws resolver deploy takes its credentials from
  // (ResolverManager#getCredentialResolverConfig), when there is one.
  credentialResolver,
  getProvider = deployCredentialProvider,
  // A bound, not a verdict: the SDK sets no request timeout, and an MFA prompt
  // or a stalled credential_process would otherwise hang agent setup.
  timeoutMs = 15000,
} = {}) => {
  const resolverConfig = credentialResolver?.config
  // With a credential resolver, deploy ignores --aws-profile and
  // provider.profile; so does the check.
  const awsProfile = resolverConfig
    ? resolverConfig.profile
    : resolveServiceAwsProfile({ options, config })
  const source = describeAwsCredentialSource({
    config: resolverConfig ?? { profile: awsProfile },
    env,
  })
  const found = {
    ...FOUND_BY_SOURCE[source.source](source),
    ...(credentialResolver && { resolver: credentialResolver.name }),
    ...(resolverConfig?.dashboard === false && { dashboardDisabled: true }),
  }

  // agent setup resolves no variables (it must work on a config that does
  // not resolve), so settings written as variables cannot be checked here.
  const credentialSettings = resolverConfig
    ? [
        resolverConfig.profile,
        resolverConfig.accessKeyId,
        resolverConfig.secretAccessKey,
        resolverConfig.sessionToken,
      ]
    : [awsProfile]
  if (credentialSettings.some(hasVariable)) {
    return { ...found, check: 'unverified', reason: 'variable' }
  }
  // The region the check would call AWS in, picked the way a deploy picks it
  // (resolveRegion in resolvers/providers/aws/aws.js): the resolver's, else
  // --region, else provider.region. A variable there, such as
  // ${opt:region, 'us-east-1'}, would reach the SDK as literal text.
  const region =
    resolverConfig?.region ??
    options.region ??
    options.r ??
    config?.provider?.region
  if (hasVariable(region)) {
    return {
      ...found,
      check: 'unverified',
      reason: 'variable',
      variableRegion: region,
    }
  }

  let timer
  try {
    const credentials = await Promise.race([
      (async () => {
        const provider = await getProvider({
          awsProfile: awsProfile ?? null,
          serviceConfigFile: config,
          options,
          ...(resolverConfig && { resolverConfig }),
        })
        return await provider.resolveCredentials()
      })(),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(TIMED_OUT), timeoutMs)
        timer.unref?.()
      }),
    ])
    if (credentials === TIMED_OUT) {
      return { ...found, check: 'unverified', reason: 'timeout' }
    }
    return {
      ...found,
      check: 'verified',
      account: credentials.accountId,
      region: credentials.region,
    }
  } catch (error) {
    const reason = error?.originalMessage ?? error?.message ?? ''
    if (error?.code === 'AWS_CREDENTIALS_MISSING') {
      if (isExpiredSsoSession(reason)) {
        const profile = awsProfile ?? env.AWS_PROFILE
        return {
          state: 'sso-expired',
          ...(profile && { profile }),
          ...(credentialResolver && { resolver: credentialResolver.name }),
        }
      }
      // A profile the service or the command names, but that has nothing
      // to resolve, is reported by name: that is what a deploy would use.
      // So is the aws resolver that names it: its profile is the one to fix.
      return {
        state: 'none',
        ...(awsProfile && { profile: awsProfile }),
        ...(credentialResolver && { resolver: credentialResolver.name }),
        ...(resolverConfig?.dashboard === false && { dashboardDisabled: true }),
      }
    }
    // The lookup never reached AWS: the network, not the credentials.
    if (
      error?.code === 'AWS_ACCOUNT_ID_RESOLUTION_FAILED' &&
      error.credentialsRejected === false
    ) {
      return {
        ...found,
        check: 'unverified',
        reason: 'network',
        detail: reason,
      }
    }
    return { ...found, check: 'rejected', reason }
  } finally {
    clearTimeout(timer)
  }
}

// The aws resolver a deploy to `stage` takes its credentials from, read from
// the unresolved config the way ResolverManager#setCredentialResolver picks
// it: provider.resolver, else the only `type: aws` resolver, with a stage's
// block overriding a same-named `default` one. `null` when the default
// credential chain applies; `undefined` when deploy itself refuses the config
// (several aws resolvers and no provider.resolver).
const stageCredentialResolver = (config, stage) => {
  const effective = new Map()
  for (const stageName of [stage, 'default']) {
    const resolvers = config?.stages?.[stageName]?.resolvers
    if (!resolvers || typeof resolvers !== 'object') continue
    for (const [name, block] of Object.entries(resolvers)) {
      if (!effective.has(name)) effective.set(name, block)
    }
  }
  const pick = (name) => {
    const block = effective.get(name)
    return block?.type === 'aws' ? { name, block } : null
  }
  if (config?.provider?.resolver) return pick(config.provider.resolver)
  if (config?.provider?.profile) return null
  const awsNames = [...effective]
    .filter(([, block]) => block?.type === 'aws')
    .map(([name]) => name)
  if (awsNames.length > 1) return undefined
  return awsNames.length ? pick(awsNames[0]) : null
}

// Every setting that changes which credentials a deploy gets. Compared only,
// never printed.
const sourceKey = (resolver) =>
  resolver
    ? JSON.stringify([
        resolver.name,
        resolver.block.profile,
        resolver.block.accessKeyId,
        resolver.block.secretAccessKey,
        resolver.block.sessionToken,
        resolver.block.dashboard,
      ])
    : 'default-chain'

/**
 * The stages in `stages:` whose AWS credentials come from somewhere other
 * than the stage `agent setup` checked. They are named, not checked: a check
 * per stage costs an AWS call each and would flag accounts a developer
 * deliberately has no access to.
 *
 * @param {object} args
 * @param {object} [args.config] the service's serverless.yml, unresolved
 * @param {string} args.stage the stage the report checked
 * @returns {Array<{ stage: string, resolver?: string, profile?: string,
 *   keys?: true, defaultChain?: true }>}
 */
export const otherStageAwsSources = ({ config, stage }) => {
  const checked = stageCredentialResolver(config, stage)
  if (checked === undefined) return []
  const others = []
  for (const other of Object.keys(config?.stages ?? {})) {
    if (other === 'default' || other === stage) continue
    const resolver = stageCredentialResolver(config, other)
    if (resolver === undefined || sourceKey(resolver) === sourceKey(checked)) {
      continue
    }
    // agent setup resolves no variables, so --stage could not check it either
    if (hasVariable(resolver?.block.profile)) continue
    others.push(
      resolver
        ? {
            stage: other,
            resolver: resolver.name,
            ...(resolver.block.profile
              ? { profile: resolver.block.profile }
              : { keys: true }),
          }
        : { stage: other, defaultChain: true },
    )
  }
  return others
}

const describeOtherStage = ({ stage, resolver, profile, keys }) => {
  const source = resolver
    ? `resolver "${resolver}", ${keys ? 'keys in serverless.yml' : `profile "${profile}"`}`
    : 'the default AWS credentials'
  return `"${stage}" (${source})`
}

// The text after "auth: " -- also what `serverless login` prints in a
// non-interactive shell, so the two commands describe the same state in the
// same words.
const AUTH_TEXT = {
  'env-license': ({ variable = 'SERVERLESS_LICENSE_KEY' }) =>
    `using ${variable} from the environment`,
  'env-access': ({ variable = 'SERVERLESS_ACCESS_KEY' }) =>
    `using ${variable} from the environment`,
  'rc-user': ({ user, org }) =>
    `signed in as ${user}${org ? ` (org "${org}")` : ''}`,
  'config-license': () => 'using the License Key in serverless.yml',
  'rc-license': ({ org }) =>
    `using a License Key saved on this machine${org ? ` (org "${org}")` : ''}`,
  none: () => `not signed in — ${NOT_SIGNED_IN_REMEDY}`,
}

export const describeAuth = (auth) => AUTH_TEXT[auth.state](auth)

const AUTH_LINES = Object.fromEntries(
  Object.keys(AUTH_TEXT).map((state) => [
    state,
    (auth) => `auth: ${describeAuth(auth)}`,
  ]),
)

const AWS_SOURCE_TEXT = {
  env: () => 'environment variables',
  profile: ({ profile }) => `profile "${profile}"`,
  'resolver-keys': () => 'keys in serverless.yml',
}

const FIX_SOURCE = {
  env: () => ({ source: 'env' }),
  profile: ({ profile, resolver }) => ({
    source: 'profile',
    profile,
    resolver,
  }),
  'resolver-keys': () => ({ source: 'resolver-config' }),
}

// What the check found out about the source, after the source itself.
const AWS_CHECK_TEXT = {
  verified: ({ account, region }) => ` — account ${account}, region ${region}`,
  rejected: (aws) =>
    ` — rejected by AWS: ${aws.reason} Fix: ${awsCredentialsFix(
      FIX_SOURCE[aws.state](aws),
    )}`,
  unverified: (aws) =>
    aws.reason === 'network'
      ? ` — not verified: could not reach AWS (${aws.detail}); check the network or proxy, then re-run "serverless agent setup"`
      : ' — not verified: no answer from AWS within 15 s (the network, not the credentials); re-run "serverless agent setup", or "serverless package" checks them',
}

// A deploy signed in as a user or with an access key takes the org's AWS
// provider from the Serverless Dashboard before a profile or a resolver's
// keys, unless the resolver sets `dashboard: false`; a license key gets no
// provider. This check cannot ask (it needs no sign-in), so it says where a
// deploy may find other credentials.
const dashboardHint = (aws, auth) =>
  !aws.dashboardDisabled &&
  (auth?.state === 'rc-user' || auth?.state === 'env-access')
    ? '; if the org has a Serverless Dashboard Provider, deploys use that instead'
    : ''

const renderAwsSource = (aws, auth) => {
  if (aws.check === 'unverified' && aws.reason === 'variable') {
    if (aws.variableRegion) {
      const source = AWS_SOURCE_TEXT[aws.state](aws)
      return `aws credentials: ${aws.resolver ? `resolver "${aws.resolver}", ${source}` : source}; region set by a variable in serverless.yml (${aws.variableRegion}) — not checked here; "serverless package" checks it`
    }
    return aws.resolver
      ? `aws credentials: resolver "${aws.resolver}" is set with a variable in serverless.yml — not checked here; "serverless package" checks it`
      : `aws credentials: profile set by a variable in serverless.yml (${aws.profile}) — not checked here; "serverless package" checks it`
  }
  const source = AWS_SOURCE_TEXT[aws.state](aws)
  // A verified local account is not the deploy's when a Dashboard Provider
  // takes precedence.
  const hint = aws.check === 'verified' ? dashboardHint(aws, auth) : ''
  return `aws credentials: ${aws.resolver ? `resolver "${aws.resolver}", ${source}` : source}${aws.check ? AWS_CHECK_TEXT[aws.check](aws) : ''}${hint}`
}

const AWS_LINES = {
  env: renderAwsSource,
  profile: renderAwsSource,
  'resolver-keys': renderAwsSource,
  'sso-expired': (aws) => {
    const { problem, fix } = describeMissingAwsCredentials({
      ...aws,
      ssoExpired: true,
    })
    return `aws credentials: ${problem} — ${fix}`
  },
  // Where a deploy may still find credentials: see dashboardHint.
  none: (aws, auth) => {
    const { problem, fix } = describeMissingAwsCredentials(aws)
    return `aws credentials: ${problem} — ${fix}${dashboardHint(aws, auth)}`
  },
}

// The report names the config file it found: serverless.yaml/.ts/.js/.json,
// or serverless-compose.yml/.yaml at a Compose root, where project skills
// install beside it too. In a service, the AWS check followed one stage's
// config, so the line names it.
const serviceLine = (configFileName, stage) =>
  `service: ${configFileName || 'serverless.yml'} found${stage ? `; AWS credentials checked for stage "${stage}"` : ''}`

export const renderEnvironmentReport = ({
  auth,
  aws,
  service,
  otherStages = [],
  stage,
}) => [
  service.present
    ? serviceLine(service.configFileName, stage)
    : 'service: no serverless.yml in this directory — create one (see the serverless-framework skill), then run "serverless agent setup" again there to install the project skills; or run "serverless" in an interactive terminal to scaffold a project',
  AUTH_LINES[auth.state](auth),
  AWS_LINES[aws.state](aws, auth),
  ...(otherStages.length
    ? [
        `other stages, not checked: ${otherStages.map(describeOtherStage).join(', ')} — check one with "serverless agent setup --stage <name>"`,
      ]
    : []),
]
