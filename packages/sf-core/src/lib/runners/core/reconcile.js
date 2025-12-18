import {
  log,
  progress,
  ServerlessError,
  ServerlessErrorCodes,
  style,
  getProxyDispatcher,
} from '@serverless/util'
import {
  CloudFormationClient,
  ListStacksCommand,
} from '@aws-sdk/client-cloudformation'
import { StandardRetryStrategy } from '@smithy/util-retry'
import { addProxyToAwsClient } from '@serverless/util'

/**
 * Get org subscription to check if qualified for v4
 * so that we can use the correct list of instances (qualifiedInstances or dashboardInstances)
 *
 * We don't use the minimal subscription data returned from BFF
 * because they are not available when using license keys.
 *
 * @param {*} auth
 * @param versionFramework
 * @returns
 */
const getSubscription = async (auth, versionFramework) => {
  const domain =
    process.env.SERVERLESS_PLATFORM_STAGE === 'dev'
      ? 'serverless-dev.com'
      : 'serverless.com'

  /**
   * The orgId is from the serverless.yml file
   * if not available, we fallback to the default orgId
   */
  const url = `https://core.${domain}/api/billing/orgs/${auth.orgId}`
  const response = await fetch(url, {
    method: 'GET',
    headers: buildHeaders(auth, versionFramework),
    dispatcher: getProxyDispatcher(url),
  })

  if (!response.ok) {
    const errorMessage = `Failed to fetch your subscription details: ${response.statusText}`

    throw new ServerlessError(errorMessage, 'GET_SUBSCRIPTION_FAILED', {
      originalMessage: errorMessage,
      stack: false,
    })
  }

  const data = await response.json()

  return data
}

/**
 * Get all reported instances for the provided AWS account
 * @param {*} auth
 * @param {*} awsAccountId
 * @returns
 */
const getAwsAccountInstances = async ({
  auth,
  awsAccountId,
  isQualified,
  versionFramework,
}) => {
  const domain =
    process.env.SERVERLESS_PLATFORM_STAGE === 'dev'
      ? 'serverless-dev.com'
      : 'serverless.com'

  const url = `https://core.${domain}/api/usage/instances/${auth.orgId}`
  const response = await fetch(url, {
    method: 'GET',
    headers: buildHeaders(auth, versionFramework),
    dispatcher: getProxyDispatcher(url),
  })

  if (!response.ok) {
    const errorMessage = `Failed to get a list of billable instances: ${response.statusText}`

    throw new ServerlessError(errorMessage, 'GET_INSTANCES_FAILED', {
      originalMessage: errorMessage,
      stack: false,
    })
  }

  const data = await response.json()

  const { qualifiedInstances, dashboardInstances } = data

  /**
   * If qualified for v4, we use the qualifiedInstances
   * otherwise we use the dashboardInstances
   */
  const instances = isQualified ? qualifiedInstances : dashboardInstances || []

  // Filter out instances that are not in this AWS account
  return instances.filter(
    (instance) =>
      instance?.usageStatus === 'open' &&
      instance?.cftStackId &&
      instance?.cftStackId?.split(':')[4] === awsAccountId,
  )
}

/**
 * Get all the regions we reported instances for in this aws account
 * @param {*} awsAccountInstances
 * @returns
 */
const getInstancesRegions = (awsAccountInstances = []) => {
  const regions = new Set()

  awsAccountInstances.forEach((instance) => {
    if (instance.cftStackId) {
      // ARN format: arn:aws:cloudformation:region:account-id:stack/stack-name
      const arnParts = instance.cftStackId.split(':')
      if (arnParts.length >= 4) {
        regions.add(arnParts[3])
      }
    }
  })
  return Array.from(regions)
}

/**
 * Lists all CloudFormation stacks across the specified AWS regions
 * Handles pagination with exponential backoff retry
 *
 * @param {*} regions
 * @param {*} credentials
 * @returns {Promise<Array>} Array of stack details
 */
const getRegionsStacks = async (regions, credentials) => {
  const awsAccountStacks = []
  const failedRegions = []

  // Retry 3 times with the standard aws exponential backoff algorithm
  const retryStrategy = new StandardRetryStrategy(async () => 3)

  for (const region of regions) {
    try {
      const client = addProxyToAwsClient(
        new CloudFormationClient({
          credentials,
          region,
          retryStrategy,
        }),
      )

      let nextToken

      do {
        const command = new ListStacksCommand({
          NextToken: nextToken,
        })

        const response = await client.send(command)

        if (response.StackSummaries) {
          awsAccountStacks.push(...response.StackSummaries)
        }

        nextToken = response.NextToken
      } while (nextToken)
    } catch (error) {
      log.debug(`Error fetching stacks in region ${region}: ${error.message}`)
      failedRegions.push(region)
    }
  }

  return {
    awsAccountStacks,
    failedRegions,
  }
}

/**
 * Get all instances that are not in the correct state to be reconciled
 * @param {*} instances
 * @param {*} stacks
 * @returns
 */
const getInstancesToReconcile = (instances, stacks, failedRegions) => {
  const instancesToReconcile = []

  instances.forEach((instance) => {
    const stack = stacks.find((s) => s.StackId === instance.cftStackId)

    const stackDeleted = !stack || stack?.StackStatus === 'DELETE_COMPLETE'
    const ignoreInstance = failedRegions.includes(
      instance.cftStackId.split(':')[3],
    )

    if (stackDeleted && !ignoreInstance) {
      /**
       * Set the updatedAt date for the instance
       * If the deleted stack state exists (90 days after the stack was deleted), use the deletion time
       * Otherwise, use the instance creation time + 1 day to avoid charging for this instance
       * which we don't know when it was deleted
       */
      const updatedAtDate = stack?.DeletionTime
        ? new Date(stack?.DeletionTime)
        : new Date(instance?.createdAt)

      if (!stack?.DeletionTime) {
        updatedAtDate.setDate(updatedAtDate.getDate() + 1)
      }

      instance.updatedAt = updatedAtDate.toISOString()

      instancesToReconcile.push(instance)
    }
  })

  return instancesToReconcile
}

/**
 * Reconcile the instances that are not in the correct state to be reconciled
 * @param {*} auth
 * @param {*} instancesToReconcile
 */
const reconcileInstances = async ({
  auth,
  instancesToReconcile,
  isQualified,
  versionFramework,
}) => {
  const domain =
    process.env.SERVERLESS_PLATFORM_STAGE === 'dev'
      ? 'serverless-dev.com'
      : 'serverless.com'

  const url = `https://core.${domain}/api/usage/instances/${auth.orgId}/reconcile`
  const response = await fetch(url, {
    method: 'POST',
    headers: buildHeaders(auth, versionFramework),
    body: JSON.stringify({
      instances: instancesToReconcile,
      isQualified,
    }),
    dispatcher: getProxyDispatcher(url),
  })

  if (!response.ok) {
    const errorMessage = `Failed to reconcile instances: ${response.statusText}`

    throw new ServerlessError(errorMessage, 'RECONCILIATION_FAILED', {
      originalMessage: errorMessage,
      stack: false,
    })
  }
}

/**
 * Runs the reconcile command
 */
const commandReconcile = async ({ auth, credentials, versionFramework }) => {
  const logger = log.get('core:reconcile')
  const progressMain = progress.get('main')

  if (!auth.orgId) {
    throw new ServerlessError(
      'This command requires organization details, which aren’t available right now. Please try again later.',
      ServerlessErrorCodes.general.AUTH_FAILED,
      { stack: false },
    )
  }

  progressMain.notice(
    `Reconciling ${style.bold.underline(auth.orgName)} org instances in AWS Account ${style.bold.underline(credentials.accountId)}`,
  )

  const subscription = await getSubscription(auth, versionFramework)

  const isQualified =
    subscription.isQualified !== undefined ? subscription.isQualified : true

  // Get all the instances for this aws account
  const awsAccountInstances = await getAwsAccountInstances({
    auth,
    awsAccountId: credentials.accountId,
    isQualified,
    versionFramework,
  })

  // Get a list of all the regions the user has billable instances in
  const instancesRegions = getInstancesRegions(awsAccountInstances)

  // Get all the stacks in these particular regions regions
  const { awsAccountStacks, failedRegions } = await getRegionsStacks(
    instancesRegions,
    credentials,
  )

  // compare the reported instances for this aws account with all the stacks across these regions
  // and get a list of instances that are not in the correct state to be reconciled
  const instancesToReconcile = getInstancesToReconcile(
    awsAccountInstances,
    awsAccountStacks,
    failedRegions,
  )

  // if there are instances to reconcile, reconcile them
  if (instancesToReconcile.length > 0) {
    // reconcile these instances
    await reconcileInstances({
      auth,
      instancesToReconcile,
      isQualified,
      versionFramework,
    })
  }

  progressMain.remove()

  logger.success(
    `Successfully reconciled ${style.bold.underline(auth.orgName)} org instances in AWS Account ${style.bold.underline(credentials.accountId)}.`,
  )

  logger.blankLine()

  logger.notice(
    `To view your org's billable instances for the current month, run the "serverless usage" command.`,
  )

  logger.blankLine()

  logger.notice(
    `If you have any questions about your usage, please contact support@serverless.com.`,
  )
}

const buildHeaders = (auth, versionFramework) => {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${auth.accessKeyV1 ?? auth.accessKeyV2}`,
  }
  if (versionFramework) {
    headers['x-serverless-version'] = versionFramework
  }
  return headers
}

export default commandReconcile
