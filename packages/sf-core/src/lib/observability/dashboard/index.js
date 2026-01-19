import {
  CloudFormationClient,
  CreateStackCommand,
  DescribeStacksCommand,
  DescribeStackEventsCommand,
} from '@aws-sdk/client-cloudformation'
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts'
import { addProxyToAwsClient } from '@serverless/util'
import { CoreSDK } from '@serverless-inc/sdk'
import { progress, log } from '@serverless/util'

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const iamRoleStackName = 'Serverless-Inc-Role-Stack'

const DashboardObservabilityIntegrationService = async (serverless) => {
  const integrationSetupProgress = progress.get('main')
  const logger = log.get('sls:dev')

  const sdk = new CoreSDK({
    authToken: serverless.accessKey,
    headers: {
      'x-serverless-version': serverless.version,
    },
  })

  const dashboardFrontend =
    process.env.SERVERLESS_PLATFORM_STAGE === 'dev'
      ? `https://app.serverless-dev.com`
      : `https://app.serverless.com`

  let context = {}

  const awsCredentials = await serverless.providers.aws.getCredentials()

  const credentials = awsCredentials.credentials
    ? awsCredentials.credentials
    : {
        accessKeyId: awsCredentials.accessKeyId,
        secretAccessKey: awsCredentials.secretAccessKey,
        sessionToken: awsCredentials.sessionToken,
      }

  const cloudFormationClient = addProxyToAwsClient(
    new CloudFormationClient({
      region: 'us-east-1',
      credentials,
    }),
  )
  const stsClient = addProxyToAwsClient(
    new STSClient({
      region: 'us-east-1',
      credentials,
    }),
  )

  /**
   * Check for IAM Role Stack to exist
   * @returns boolean
   */
  const checkIfStackExists = async () => {
    try {
      const stacks = (
        await cloudFormationClient.send(
          new DescribeStacksCommand({
            StackName: iamRoleStackName,
          }),
        )
      ).Stacks
      return (
        stacks.find((stack) => stack.StackName === iamRoleStackName) !==
        undefined
      )
    } catch (err) {
      return false
    }
  }

  /**
   * Wait for IAM Role Stack to be created
   * @returns
   */
  const waitUntilStackIsCreated = async () => {
    await wait(2000)
    const stackEvents = (
      await cloudFormationClient.send(
        new DescribeStackEventsCommand({
          StackName: iamRoleStackName,
        }),
      )
    ).StackEvents
    const failedStatusReasons = stackEvents
      .filter(({ ResourceStatus: status }) => {
        return status && status.endsWith('_FAILED')
      })
      .map(({ ResourceStatusReason: reason }) => reason)

    if (failedStatusReasons.length) {
      logger.error(
        `Creating an AWS IAM Role in your AWS account to connect Serverless Framework Observability failed:\n  - ${failedStatusReasons.join(
          '\n  - ',
        )} \n\n Review these docs to troubleshoot: https://www.serverless.com/framework/docs/guides/dashboard/monitoring/troubleshoot or seek support in Serverless Framework Dashboard.`,
      )
      return false
    }
    const statusEvent = stackEvents.find(
      ({ ResourceType: resourceType }) =>
        resourceType === 'AWS::CloudFormation::Stack',
    )
    const status = statusEvent ? statusEvent.ResourceStatus : null
    if (status && status.endsWith('_COMPLETE')) {
      if (status === 'CREATE_COMPLETE') return true
      logger.error(
        'Creating an AWS IAM Role in your AWS account to connect Serverless Framework Observability failed due to an unknown reason. Please request support within Serverless Framework Dashboard: https://app.serverless.com and reference these docs: https://www.serverless.com/framework/docs/guides/dashboard/monitoring/troubleshoot',
      )
      return false
    }
    return waitUntilStackIsCreated()
  }

  /**
   * This must be run before any other method is run to ensure that
   * the context is properly configured
   */
  const configureIntegrationContext = async ({ observabilityEnabled } = {}) => {
    const accessKey = serverless.accessKey

    const org = {
      orgId: serverless.orgId,
      orgName: serverless.orgName,
    }

    const awsAccountId = await resolveAwsAccountId()

    const { integrations } = await sdk.integrations.getIntegrationsForOrg({
      orgId: org.orgId,
    })

    const integration = integrations.find(
      ({ vendorAccount }) => vendorAccount === awsAccountId,
    )

    let mode = 'none'
    let startMessage = 'Disabling Serverless Framework Observability'
    let successMessage = 'Serverless Framework Observability is disabled'

    if (observabilityEnabled) {
      mode = 'prod'
      startMessage = 'Enabling Serverless Framework Observability'
      successMessage = 'Serverless Framework Observability is enabled'
    }

    const targetFunctionNames = []
    const targetInstrumentations = []

    const names = serverless.service.getAllFunctionsNames()

    for (const name of names) {
      const functionName = name
      targetInstrumentations.push({
        instrumentations: {
          mode,
        },
        resourceKey: `aws_${awsAccountId}_function_${serverless.service.provider.region}_${functionName}`,
      })
      targetFunctionNames.push(functionName)
    }

    context = {
      serverless,
      accessKey,
      awsAccountId,
      integration,
      targetInstrumentations,
      targetFunctionNames,
      instrumentation: {
        startMessage,
        successMessage,
        mode,
      },
      org: org,
    }
  }

  /**
   * This wil convert some error messages to be more user friendly
   * @param {string} message Failure message
   * @returns
   */
  const convertMessage = (message) => {
    if (/Cannot reference more than 5 layers/.test(message)) {
      return 'Serverless Framework Observability could not be enabled due to too many AWS Lambda Layers. Please remove at least one Layer from this function and try again.'
    }
    return message
  }

  /**
   * Resolves local AWS Account Id
   * @returns
   */
  const resolveAwsAccountId = async () => {
    try {
      return (await stsClient.send(new GetCallerIdentityCommand({}))).Account
    } catch (error) {
      const err = new Error(
        'AWS provider credentials not found. Learn how to set up AWS provider credentials in our docs here: http://slss.io/aws-creds-setup.',
      )
      err.stack = undefined
      throw err
    }
  }

  /**
   * Wait for integration to be ready for instrumentation
   * @returns
   */
  const waitUntilIntegrationIsReady = async () => {
    await wait(2000)

    const { integrations } = await sdk.integrations.getIntegrationsForOrg({
      orgId: context.org.orgId,
    })

    const integration = integrations.find(
      ({ vendorAccount }) => vendorAccount === context.awsAccountId,
    )
    if (integration) {
      return integration
    }
    return waitUntilIntegrationIsReady()
  }

  const getFunctionsToInstrument = async () => {
    const stageName = serverless.getProvider('aws').getStage()

    const { hits } = await sdk.query.search({
      orgId: context.org.orgId,
      filters: {
        tag_account_id: context.awsAccountId,
        type: 'resource_aws_lambda',
        tag_environment: stageName,
        tag_namespace: context.serverless.configurationInput.service,
      },
      page: {
        from: 0,
        size: context.targetFunctionNames.length,
      },
    })

    // This is the list of functions already instrumented correctly
    const functionsToIgnore = hits
      .filter(
        ({ instrument_mode }) =>
          instrument_mode === context.instrumentation.mode,
      )
      .map(({ id }) => id)

    const functionsToInstrument = context.targetInstrumentations.filter(
      ({ resourceKey }) => !functionsToIgnore.includes(resourceKey),
    )

    return functionsToInstrument
  }

  /**
   * Wait for all function to be instrumented
   *
   * @param {string[]} flowIds This is an array of flowIds to wait for
   * @param {string} mode This is the instrumentation mode being set
   * @param {string} startMessage This is an optional message to display at the start of the instrumentation process
   *
   */
  const waitForInstrumentation = async (
    flowIds,
    startMessage,
    successMessage,
  ) => {
    let waiting = true
    // 3 minutes per flowId which is a batch of 50 resources. For example 100 resources would be 6 minutes
    const MAX_TIMEOUT = flowIds.length * 1000 * 60 * 3
    const startTime = Date.now()
    while (waiting) {
      const requests = flowIds.map((id) =>
        sdk.integrations.getInstrumentationFlow({
          flowId: id,
        }),
      )
      const results = await Promise.allSettled(requests)

      const allResults = results
        .filter(({ status }) => status === 'fulfilled')
        .map(({ value }) => value)

      const completeFunctions = allResults.reduce(
        (functions, { inventories }) => [
          ...functions,
          ...inventories.filter(({ status }) => status === 'complete'),
        ],
        [],
      )

      if (!serverless.devmodeEnabled) {
        integrationSetupProgress.notice(startMessage)
      }

      const allComplete = allResults.reduce((done, { status }) => {
        if (!done) return done
        return status === 'complete' || status === 'incomplete'
      }, true)
      const allStatues = allResults.reduce((statuses, { status }) => {
        if (!statuses.includes(status)) {
          return [...statuses, status]
        }
        return statuses
      }, [])

      if (allComplete) {
        const allIncompleteInventories = allResults.reduce(
          (incomplete, { inventories }) => [
            ...incomplete,
            ...inventories.filter(({ status }) => status === 'incomplete'),
          ],
          [],
        )

        if (allIncompleteInventories.length > 0) {
          const failedFunctionList = allIncompleteInventories.map(
            ({ resourceKey, failReason }) =>
              `• ${resourceKey.split('_').pop()} - ${convertMessage(
                failReason,
              )}`,
          )
          logger.warning(
            `Serverless Framework Observability instrumentation failed for the following functions:\n${failedFunctionList.join(
              '\n',
            )}`,
          )
        } else if (allStatues.some((status) => status === 'incomplete')) {
          logger.error(
            'Serverless Framework Observability instrumentation failed. Please try again.',
          )
        } else {
          if (!serverless.devmodeEnabled) {
            logger.success(successMessage)
          }
        }
        waiting = false
      } else if (Date.now() - startTime > MAX_TIMEOUT) {
        logger.success(
          `Serverless Framework Observability instrumentation is still running in the background.\n  Please refer to the Serverless Framework Dashboard for progress.\n  ${dashboardFrontend}/${context.org.orgName}/settings`,
        )
        waiting = false
      } else {
        await wait(1000)
      }
    }
  }

  /**
   * Ensure the local AWS account has been instrumented properly
   * @param {string} successMessage This is an optional message to display at the end of the instrumentation process
   * @returns
   */
  const ensureIntegrationIsConfigured = async () => {
    // Do not run this if we have not generated context or we are not looking to set up the integration
    if (
      Object.keys(context).length === 0 ||
      !serverless.configurationInput.app
    ) {
      return false
    } else if (
      context.integration &&
      context.integration.status === 'alive' &&
      context.integration.syncStatus !== 'pending'
    ) {
      return true
    }

    const stackExists = await checkIfStackExists()

    if (!context.integration && stackExists) {
      logger.warning(
        `The AWS account with the ID "${context.awsAccountId}", already has a Serverless Framework Observability integration into a different Serverless Framework Organization. Serverless Framework Observability will not be successfully set-up due to this. Please remove the other integration from the other AWS account first.`,
      )
      return false
    }

    if (stackExists) {
      logger.success(
        'Your AWS account is currently being integrated with Serverless Framework Observability',
      )
    }
    if (!context.integration && !stackExists) {
      integrationSetupProgress.notice(
        'Creating IAM Role for Serverless Framework Observability',
      )

      const { cfnTemplateUrl, params } =
        await sdk.integrations.startIntegration({
          orgId: context.org.orgId,
        })

      // In very rare cases where two deployments to the same org and account happen
      // at the exact same time, the `checkIfStackExists` call will fail but then one of the services
      // will fail to create the stack since it already exists, so we catch the error
      try {
        await cloudFormationClient.send(
          new CreateStackCommand({
            Capabilities: ['CAPABILITY_NAMED_IAM'],
            TemplateURL: cfnTemplateUrl,
            StackName: iamRoleStackName,
            Parameters: [
              { ParameterKey: 'AccountId', ParameterValue: params.accountId },
              {
                ParameterKey: 'ReportServiceToken',
                ParameterValue: params.reportServiceToken,
              },
              { ParameterKey: 'ExternalId', ParameterValue: params.externalId },
              { ParameterKey: 'Version', ParameterValue: params.version },
            ],
          }),
        )
      } catch (err) {
        logger.success(
          'Your AWS account is currently being integrated with Serverless Framework Observability',
        )
      }

      if (!(await waitUntilStackIsCreated())) return false

      integrationSetupProgress.notice('Validating integration')
      const integration = await waitUntilIntegrationIsReady()
      context.integration = integration
    }

    const res = await sdk.integrations.syncIntegrationInventories({
      orgId: context.org.orgId,
      integrationId: context.integration.integrationId,
      serviceName: context.serverless.configurationInput.service,
      targetInstrumentations: context.targetInstrumentations,
    })

    logger.success(
      `Serverless Framework's Observability integration is almost done being set up on your AWS account (this is a one-time set-up process).\n\nYou will receive an email when its ready. You can also view the integration's status within the Dashboard: ${dashboardFrontend}/${context.org.orgName}/settings/integrations`,
    )

    context.integration.integrationInProgress = true
    return true
  }

  /**
   * Call this function to instrument or uninstrument all the functions in a service
   */
  const instrumentService = async () => {
    // Skip if we have not set up context or if there is no integration to instrument
    if (
      Object.keys(context).length === 0 ||
      !context.integration ||
      !serverless.configurationInput.app
    ) {
      return
    } else if (context.integration.integrationInProgress) {
      const integration = await waitUntilIntegrationIsReady()
      if (integration.status === 'failed') {
        logger.error(
          `Your AWS account failed to integrate with Serverless Framework Observability.${
            integration.lastError ? `\n ${integration.lastError}` : ''
          }`,
        )

        return
      }
    }

    const { startMessage, successMessage } = context.instrumentation

    const functionsToInstrument = await getFunctionsToInstrument()

    if (functionsToInstrument.length > 0) {
      if (!serverless.devmodeEnabled) {
        integrationSetupProgress.notice(startMessage)
      }
      try {
        const distributeArrayBy50 = (array) => {
          const result = []
          let index = 0
          while (index < array.length)
            result.push(array.slice(index, (index += 50)))
          return result
        }

        const chunkedResources = distributeArrayBy50(functionsToInstrument)

        // Send requests to instrument
        context.instrumentationCount = chunkedResources.reduce(
          (sum, chunk) => sum + chunk.length,
          0,
        )
        const flowIds = []

        for (const chunk of chunkedResources) {
          const { flowId } = await sdk.integrations.instrumentResources({
            orgId: context.org.orgId,
            resources: chunk,
          })
          flowIds.push(flowId)
        }

        // Wait for instrumentation to complete
        if (!context.integration.integrationInProgress) {
          await waitForInstrumentation(flowIds, startMessage, successMessage)
        }
      } catch (error) {
        logger.error(error.message)
      }
    }

    return
  }

  return {
    configureIntegrationContext,
    ensureIntegrationIsConfigured,
    instrumentService,
  }
}

export const isAnyFunctionIntegrated = async ({
  dashboardAccessToken,
  awsAccountId,
  orgId,
  stage,
  service,
  lambdaFunctionNames,
  frameworkVersion,
}) => {
  const integratedFunctions = await getIntegratedFunctions({
    dashboardAccessToken,
    awsAccountId,
    orgId,
    stage,
    service,
    functionNames: lambdaFunctionNames,
    frameworkVersion,
  })
  return integratedFunctions.some((f) => f.instrument_mode === 'prod')
}

const getIntegratedFunctions = async ({
  dashboardAccessToken,
  awsAccountId,
  orgId,
  stage,
  service,
  functionNames,
  frameworkVersion,
}) => {
  const sdk = new CoreSDK({
    authToken: dashboardAccessToken,
    headers: {
      'x-serverless-version': frameworkVersion,
    },
  })
  const pageSize = 100 // Maximum size per API request
  const totalFunctions = functionNames.length
  const totalPages = Math.ceil(totalFunctions / pageSize) // Calculate the total number of pages required
  let allHits = [] // To accumulate all hits

  for (let currentPage = 0; currentPage < totalPages; currentPage++) {
    const { hits } = await sdk.query.search({
      orgId: orgId,
      filters: {
        tag_account_id: awsAccountId,
        type: 'resource_aws_lambda',
        tag_environment: stage,
        tag_namespace: service,
      },
      page: {
        from: currentPage * pageSize,
        size: Math.min(pageSize, totalFunctions - currentPage * pageSize), // Get the remaining items or 100
      },
    })

    allHits = allHits.concat(hits) // Accumulate hits from each page
  }

  return allHits.map((hit) => {
    return {
      id: hit.id,
      instrument_mode: hit.instrument_mode,
    }
  })
}

export default DashboardObservabilityIntegrationService
