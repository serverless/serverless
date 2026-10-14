/**
 * `serverless dev setup` outside a service directory: the same setup as inside one, with the region
 * and the credentials taken from the command line and this machine instead of serverless.yml. The
 * region is --region, then AWS_REGION, then AWS_DEFAULT_REGION, then the AWS profile's region (as
 * the AWS SDK reads it), then us-east-1; the credentials are --aws-profile's, or the default chain's.
 */
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts'
import { fromNodeProviderChain } from '@aws-sdk/credential-providers'
import { log, ServerlessError } from '@serverless/util'
// Subpath import: tests that load every plugin mock '@serverless/util' wholesale.
import { addProxyToAwsClient } from '@serverless/util/src/proxy/index.js'
import { runDevSetup } from './commands.js'
import {
  describeMissingAwsCredentials,
  isExpiredSsoSession,
} from '@serverlessinc/sf-core/src/lib/resolvers/providers/aws/credential-source.js'

export const DEFAULT_SETUP_REGION = 'us-east-1'

const CREDENTIALS_MISSING = new Set([
  'CredentialsProviderError',
  'TokenProviderError',
])

/** The region the AWS SDK reads for a profile (the default profile when none), or undefined. */
export const sdkProfileRegion = async (profile) => {
  const client = new STSClient(profile ? { profile } : {})
  try {
    return await client.config.region()
  } catch {
    return undefined
  } finally {
    client.destroy()
  }
}

export const resolveSetupRegion = async ({
  options = {},
  env = process.env,
  profileRegion = sdkProfileRegion,
}) => {
  const flag = options.region ?? options.r
  if (flag) return { region: flag, source: '--region' }
  if (env.AWS_REGION) return { region: env.AWS_REGION, source: 'AWS_REGION' }
  if (env.AWS_DEFAULT_REGION) {
    return { region: env.AWS_DEFAULT_REGION, source: 'AWS_DEFAULT_REGION' }
  }
  const profile = options['aws-profile'] ?? env.AWS_PROFILE
  let region
  try {
    region = await profileRegion(profile)
  } catch {
    region = undefined
  }
  if (region)
    return { region, source: 'profile', profile: profile ?? 'default' }
  return { region: DEFAULT_SETUP_REGION, source: 'default' }
}

export const setupRegionLine = ({ region, source, profile }) => {
  if (source === 'profile') {
    return `Region ${region}, from the AWS profile "${profile}".`
  }
  if (source === 'default') {
    return `Region ${region}, the default: use --region to set up another region.`
  }
  return `Region ${region}, from ${source}.`
}

/**
 * A credentials error that means none could be loaded, as one clear error in the words the CLI
 * uses when it finds no credentials (`describeMissingAwsCredentials`): what is missing for the
 * AWS profile given with --aws-profile or AWS_PROFILE (an expired SSO session named as one), and
 * how to set it up. Any other error (expired, denied) is returned as it is.
 */
const credentialsMissing = (error, region, profile) => {
  if (!CREDENTIALS_MISSING.has(error?.name)) return error
  const { problem, fix } = describeMissingAwsCredentials({
    profile,
    ssoExpired: isExpiredSsoSession(error.message),
    outsideService: true,
  })
  return new ServerlessError(
    `Dev Mode could not load AWS credentials to set up ${region}: ${problem} (${error.message}). To fix it, ${fix}.`,
    'DEV_SETUP_AWS_CREDENTIALS_MISSING',
    { stack: false },
  )
}

/**
 * What `runDevSetup` needs of the Framework's AWS provider, from the AWS SDK: the region, the
 * credentials and the caller's account. `named` is the AWS profile the credentials come from, for
 * the messages: `profile`, else the one AWS_PROFILE names for the SDK.
 */
export const createSetupProvider = ({
  region,
  profile,
  named = profile,
  sdk = {},
}) => {
  const credentialsFor =
    sdk.credentialsFor ??
    ((name) => fromNodeProviderChain(name ? { profile: name } : {}))
  const credentials = credentialsFor(profile)
  const sts =
    sdk.sts ?? addProxyToAwsClient(new STSClient({ region, credentials }))
  return {
    getRegion: () => region,
    getProfile: () => profile,
    async getCredentials() {
      try {
        const resolved = await credentials()
        return {
          accessKeyId: resolved.accessKeyId,
          secretAccessKey: resolved.secretAccessKey,
          sessionToken: resolved.sessionToken,
        }
      } catch (error) {
        throw credentialsMissing(error, region, named)
      }
    },
    async getAccountInfo() {
      let result
      try {
        result = await sts.send(new GetCallerIdentityCommand({}))
      } catch (error) {
        throw credentialsMissing(error, region, named)
      }
      return {
        accountId: result.Account,
        partition: result.Arn.split(':')[1],
        arn: result.Arn,
        userId: result.UserId,
      }
    },
  }
}

export const runDevSetupOutsideService = async ({
  options = {},
  env = process.env,
  deps = {},
}) => {
  const {
    logger = log.get('sls:dev'),
    profileRegion,
    sdk,
    setup = runDevSetup,
    setupDeps,
  } = deps
  const where = await resolveSetupRegion({ options, env, profileRegion })
  logger.aside(setupRegionLine(where))
  const provider = createSetupProvider({
    region: where.region,
    profile: options['aws-profile'],
    named: options['aws-profile'] ?? env.AWS_PROFILE,
    sdk,
  })
  await setup({ provider, options, deps: setupDeps })
}
