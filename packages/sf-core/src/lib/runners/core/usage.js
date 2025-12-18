import path from 'path'
import { writeFile } from '../../../utils/index.js'
import {
  getProxyDispatcher,
  log,
  progress,
  ServerlessError,
  ServerlessErrorCodes,
  style,
} from '@serverless/util'

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

    new ServerlessError(errorMessage, 'GET_SUBSCRIPTION_FAILED', {
      originalMessage: errorMessage,
      stack: false,
    })
  }

  const data = await response.json()

  return data
}

/**
 * List all billable instances for the org as seen on the billing page.
 * This returns both qualifiedInstances and dashboardInstances.
 * Then we select the correct list of instances based on the subscription record.
 */
const getInstances = async (auth, versionFramework) => {
  const domain =
    process.env.SERVERLESS_PLATFORM_STAGE === 'dev'
      ? 'serverless-dev.com'
      : 'serverless.com'

  /**
   * The orgId is from the serverless.yml file
   * if not available, we fallback to the default orgId
   */
  const url = `https://core.${domain}/api/usage/instances/${auth.orgId}`
  const response = await fetch(url, {
    method: 'GET',
    headers: buildHeaders(auth, versionFramework),
    dispatcher: getProxyDispatcher(url),
  })

  if (!response.ok) {
    const errorMessage = `Failed to get a list of billable instances: ${response.statusText}`

    new ServerlessError(errorMessage, 'GET_INSTANCES_FAILED', {
      originalMessage: errorMessage,
      stack: false,
    })
  }

  const data = await response.json()

  const subscription = await getSubscription(auth, versionFramework)

  const { qualifiedInstances, dashboardInstances } = data

  const isQualified =
    subscription.isQualified !== undefined ? subscription.isQualified : true

  /**
   * If qualified for v4, we use the qualifiedInstances
   * otherwise we use the dashboardInstances
   */
  const billableInstances = isQualified
    ? qualifiedInstances
    : dashboardInstances || []

  const formattedInstances = []

  billableInstances.forEach((instance) => {
    const billableInstance = {}
    billableInstance.id = instance.cftStackId || instance.dashboardId
    billableInstance.age = Math.floor(instance.age || 0)
    billableInstance.user = instance.user || ''

    if (instance.cftStackId && instance.dashboardId) {
      billableInstance.type = 'CLI + Dashboard'
    } else if (instance.cftStackId) {
      billableInstance.type = 'CLI'
    } else if (instance.dashboardId) {
      billableInstance.type = 'Dashboard'
    }

    formattedInstances.push(billableInstance)
  })

  return formattedInstances
}

/**
 * Writes the instances to a CSV file
 *
 * @param {*} instances
 * @returns
 */
const writeInstancesToCSV = async (instances = [], auth) => {
  const csvHeader = 'Instance ID,Age (Days),Type,User\n'
  const csvRows = instances.map((instance) => {
    return `${instance.id},${instance.age},${instance.type},${instance.user}`
  })

  const csvContent = csvHeader + csvRows.join('\n')
  const csvPath = path.join(process.cwd(), `${auth.orgName}-instances.csv`)

  try {
    await writeFile(csvPath, csvContent)
    return csvPath
  } catch (error) {
    throw new Error(`Failed to write CSV file: ${error.message}`)
  }
}

/**
 * Runs the usage command
 */
const commandUsage = async ({ auth, versionFramework }) => {
  const logger = log.get('core:usage')
  const progressMain = progress.get('main')

  if (!auth.orgId) {
    throw new ServerlessError(
      'This command requires organization details, which aren’t available right now. Please try again later.',
      ServerlessErrorCodes.general.AUTH_FAILED,
      { stack: false },
    )
  }

  progressMain.notice(
    `Loading instances for org ${style.bold.underline(auth.orgName)}`,
  )

  const instances = await getInstances(auth, versionFramework)

  if (instances.length > 0) {
    await writeInstancesToCSV(instances, auth)
  }

  progressMain.remove()

  logger.notice(
    `The ${style.bold.underline(auth.orgName)} org used ${style.bold.underline(`${instances.length} Instance Credits`)} this month.`,
  )
  logger.blankLine()

  if (instances.length > 0) {
    logger.notice(
      `A list of billable instances has been saved to ${style.bold.underline(`${auth.orgName}-instances.csv`)} in the current directory.`,
    )
    logger.blankLine()
  }

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

export default commandUsage
