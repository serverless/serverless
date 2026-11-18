/**
 * What a Dev Mode session checks before it lists any change: AWS IoT Core in the region, who is
 * running the session, the account setup (the broker role and its permission policy) and whether
 * the stage is deployed; and the confirmation --approve asks for. Nothing here changes anything in
 * AWS.
 */
import { ServerlessError } from '@serverless/util'
import {
  BROKER_POLICY_NAME,
  brokerRoleName,
  isProtectedStage,
} from './naming.js'
import { protectedStageMessage } from './output.js'
import {
  credentialsInvalidError,
  findIotEndpoint,
  isAccessDenied,
  isCredentialError,
  originalOf,
  providerCallError,
} from './aws.js'
import { credentialSourceOf } from '../relay/messages.js'
import { brokerPolicyState, getBroker, identityFrom } from './broker.js'
import { cliCommand } from '../commands/cli-names.js'

/**
 * Refuses a stage Dev Mode never runs on, before anything starts: the session itself, and a
 * --detach start before it starts the session process.
 */
export const refuseProtectedStage = (stage) => {
  if (isProtectedStage(stage)) {
    throw new ServerlessError(
      protectedStageMessage(stage),
      'DEV_MODE_STAGE_PROTECTED',
      { stack: false },
    )
  }
}

/** `webApps`: the service has web apps, so the message names them too. */
export const nothingToAttachError = ({ webApps = false } = {}) =>
  new ServerlessError(
    `No function${webApps ? ' or web app' : ''} in this service can run in Dev Mode. The table above says why for each one.`,
    'DEV_MODE_NOTHING_TO_ATTACH',
    { stack: false },
  )

/**
 * Whether the stage's stack exists. With `outputs` (an array), the stack's `Outputs` are copied
 * into it, for the endpoints `dev status` lists.
 */
export const stackExistsWith = (provider, outputs) => async () => {
  try {
    const described = await provider.request(
      'CloudFormation',
      'describeStacks',
      { StackName: provider.naming.getStackName() },
    )
    outputs?.splice(
      0,
      outputs.length,
      ...(described?.Stacks?.[0]?.Outputs ?? []),
    )
    return true
  } catch (error) {
    if (/does not exist/.test(error?.message ?? '')) return false
    throw error
  }
}

/** The Lambda layer calls of a session; each names the permission it needs when it is missing. */
export const createLayerLambda = ({ clients, region }) => {
  const layerError = (error, action) => {
    if (isCredentialError(error)) return credentialsInvalidError(error, region)
    if (!isAccessDenied(error)) return error
    return new ServerlessError(
      `Dev Mode needs permission to call ${action} for the Dev Mode layer in ${region} (${error.message}). Ask your AWS administrator to allow lambda:ListLayerVersions, lambda:GetLayerVersion and lambda:PublishLayerVersion on layers named serverless-dev-*.`,
      'DEV_MODE_LAYER_ACCESS_DENIED',
      originalOf(error),
    )
  }
  return {
    async *listLayerVersions(name) {
      try {
        yield* clients.lambda.listLayerVersions(name)
      } catch (error) {
        throw layerError(error, 'lambda:ListLayerVersions')
      }
    },
    async publishLayerVersion(params) {
      try {
        return await clients.lambda.publishLayerVersion(params)
      } catch (error) {
        throw layerError(error, 'lambda:PublishLayerVersion')
      }
    },
    async getLayerVersion(name, version) {
      try {
        return await clients.lambda.getLayerVersion(name, version)
      } catch (error) {
        throw layerError(error, 'lambda:GetLayerVersion')
      }
    },
  }
}

/**
 * The checks before the plan, in order: the AWS IoT Core endpoint, the caller's identity, the
 * broker role and whether its permission policy is in place, and whether the stage is deployed.
 * Returns what the plan needs; `broker` is null when the role does not exist yet.
 */
export const runPreflight = async ({
  provider,
  clients,
  region,
  stage,
  main,
  logger,
  lookup,
  stackExists,
}) => {
  // The two checks that go through the Framework's provider name what they need, like the rest.
  const preflightError = (error, details) =>
    providerCallError(error, {
      region,
      credentialSource: credentialSourceOf(provider),
      ...details,
    })

  main.notice('Checking AWS IoT Core')
  const iotEndpoint = await findIotEndpoint({
    iot: clients.iot,
    region,
    lookup,
  })
  let account
  try {
    account = await provider.getAccountInfo()
  } catch (error) {
    throw preflightError(error, {
      action: 'sts:GetCallerIdentity',
      why: 'to read who is running the session',
      code: 'DEV_MODE_IDENTITY_ACCESS_DENIED',
    })
  }
  const identity = identityFrom({
    accountId: account.accountId,
    callerArn: account.arn,
  })
  const brokerName = brokerRoleName(region)
  main.notice('Checking the Dev Mode setup')
  const broker = await getBroker({
    iam: clients.iam,
    name: brokerName,
    identity,
    region,
  })
  // A broker without its permission policy, or with an older or changed one, is repaired after the
  // plan is approved.
  const brokerPolicy = broker
    ? await brokerPolicyState({
        iam: clients.iam,
        name: brokerName,
        identity,
        region,
      })
    : 'present'
  if (brokerPolicy === 'unknown') {
    logger.debug(
      `Dev Mode could not read the permission policy of ${brokerName} (iam:GetRolePolicy); it is assumed to be in place`,
    )
  }
  if (brokerPolicy === 'newer') {
    logger.debug(
      `The permission policy ${BROKER_POLICY_NAME} of ${brokerName} was written by a newer version of Dev Mode; it is left as it is`,
    )
  }
  let deployFirst
  try {
    deployFirst = !(await stackExists())
  } catch (error) {
    throw preflightError(error, {
      action: 'cloudformation:DescribeStacks',
      why: `in ${region} to check whether stage "${stage}" is deployed`,
      code: 'DEV_MODE_STACK_ACCESS_DENIED',
    })
  }
  return {
    iotEndpoint,
    identity,
    brokerName,
    broker,
    brokerPolicy,
    deployFirst,
  }
}

/**
 * --approve asks after every list of changes: on a stage that was never deployed once before the
 * deployment and again before the attach, each answer covering only the list above it. Without
 * --approve every list is approved.
 */
export const createApproval =
  ({ options, logger, isAgent, confirm }) =>
  async () => {
    if (!options.approve) return true
    // A confirmation gate fails safe: without someone to confirm, nothing changes.
    if (!logger.isInteractive()) {
      throw new ServerlessError(
        isAgent()
          ? `--approve needs a person at an interactive terminal to confirm the changes, and this session has none. Nothing was changed. To make the changes without asking, run "${cliCommand('dev')}" without --approve.`
          : `--approve needs an interactive terminal to ask for confirmation. Nothing was changed. Run "${cliCommand('dev --approve')}" in a terminal, or run "${cliCommand('dev')}" without --approve to make the changes without asking.`,
        'DEV_MODE_APPROVE_NEEDS_TERMINAL',
        { stack: false },
      )
    }
    try {
      return await confirm({ message: 'Continue?', initial: true })
    } catch {
      return false
    }
  }
