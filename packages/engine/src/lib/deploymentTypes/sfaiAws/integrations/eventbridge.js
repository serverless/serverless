import { randomUUID } from 'node:crypto'

export const setupIntegrationEnvVars = ({ containerConfig }) => {
  // Setup for EventBridge integrations
  const eventBridgeIntegrations = Object.entries(
    containerConfig.integrations ?? {},
  ).filter(([_, integration]) => integration.type === 'awsEventBridge')

  if (eventBridgeIntegrations.length > 0) {
    eventBridgeIntegrations.forEach(([name, integration]) => {
      // Initialize environment if it doesn't exist
      if (!containerConfig.environment) {
        containerConfig.environment = {}
      }

      // Add webhook path as an environment variable (path only)
      const webhookPath =
        integration.webhookPath || `/v1/integrations/${name}/eventbridge`
      const integrationNameUpper = name.toUpperCase()
      const varName = `SERVERLESS_${integrationNameUpper}_WEBHOOKPATH`
      containerConfig.environment[varName] = webhookPath
    })
  }

  // Setup for Scheduled integrations
  const scheduledIntegrations = Object.entries(
    containerConfig.integrations ?? {},
  ).filter(([_, integration]) => integration.type === 'schedule')

  if (scheduledIntegrations.length > 0) {
    scheduledIntegrations.forEach(([name, integration]) => {
      // Initialize environment if it doesn't exist
      if (!containerConfig.environment) {
        containerConfig.environment = {}
      }

      // Add webhook path as an environment variable (path only)
      const webhookPath =
        integration.webhookPath || `/v1/integrations/${name}/schedule`
      const integrationNameUpper = name.toUpperCase()
      const varName = `SERVERLESS_${integrationNameUpper}_WEBHOOKPATH`
      containerConfig.environment[varName] = webhookPath
    })
  }
}

export const createEventBridgeIntegrations = async ({
  baseName,
  state,
  serviceName,
  containerConfig,
  awsEventBridgeClient,
}) => {
  const eventBridgeIntegrations = Object.entries(
    containerConfig.integrations ?? {},
  ).filter(([_, integration]) => integration.type === 'awsEventBridge')

  if (eventBridgeIntegrations.length === 0) {
    return
  }

  await Promise.all(
    eventBridgeIntegrations.map(async ([name, integration]) => {
      let containerUrl = null
      if (state.state.containers[serviceName].routing.customDomain) {
        containerUrl = `https://${state.state.containers[serviceName].routing.customDomain}`
      } else if (
        state.state.containers[serviceName].routing.awsCloudFront
          ?.distributionDomainName
      ) {
        containerUrl = `https://${state.state.containers[serviceName].routing.awsCloudFront.distributionDomainName}`
      } else {
        containerUrl = `http://${state.state.awsAlb.dnsName}`
      }
      const endpoint =
        integration.webhookPath ??
        `${containerUrl}/v1/integrations/${name}/eventbridge`

      const authToken = randomUUID()
      const { pattern } = integration

      const { ruleArn, apiDestinationArn, connectionArn } =
        await awsEventBridgeClient.createApiEventTarget(
          baseName,
          name,
          endpoint,
          pattern,
          authToken,
        )

      if (!state.state.containers[serviceName].integrations) {
        state.state.containers[serviceName].integrations = {}
      }
      state.state.containers[serviceName].integrations[name] = {
        type: 'awsEventBridge',
        ruleArn,
        apiDestinationArn,
        connectionArn,
        pattern,
        webhookPath: endpoint,
      }
    }),
  )
}

export const createScheduledEventBridgeIntegrations = async ({
  baseName,
  state,
  serviceName,
  containerConfig,
  awsEventBridgeClient,
}) => {
  const eventBridgeIntegrations = Object.entries(
    containerConfig.integrations ?? {},
  ).filter(([_, integration]) => integration.type === 'schedule')

  if (eventBridgeIntegrations.length === 0) {
    return
  }

  await Promise.all(
    eventBridgeIntegrations.map(async ([name, integration]) => {
      let containerUrl = null
      if (state.state.containers[serviceName].routing.customDomain) {
        containerUrl = `https://${state.state.containers[serviceName].routing.customDomain}`
      } else if (
        state.state.containers[serviceName].routing.awsCloudFront
          ?.distributionDomainName
      ) {
        containerUrl = `https://${state.state.containers[serviceName].routing.awsCloudFront.distributionDomainName}`
      } else {
        containerUrl = `http://${state.state.awsAlb.dnsName}`
      }
      const endpoint =
        integration.webhookPath ??
        `${containerUrl}/v1/integrations/${name}/schedule`

      const authToken = randomUUID()
      const { schedule } = integration
      const { ruleArn, apiDestinationArn, connectionArn } =
        await awsEventBridgeClient.createScheduledEventTarget(
          baseName,
          name,
          endpoint,
          schedule,
          authToken,
        )

      if (!state.state.containers[serviceName].integrations) {
        state.state.containers[serviceName].integrations = {}
      }
      state.state.containers[serviceName].integrations[name] = {
        type: 'schedule',
        ruleArn,
        apiDestinationArn,
        connectionArn,
        schedule,
        webhookPath: endpoint,
      }
    }),
  )
}

export const reconcileEventBridgeIntegrations = async ({
  state,
  serviceName,
  containerConfig,
  awsEventBridgeClient,
}) => {
  const expectedIntegrations = Object.entries(
    containerConfig.integrations ?? {},
  )
    .filter(([_, integration]) =>
      ['awsEventBridge', 'schedule'].includes(integration.type),
    )
    .map(([name, integration]) => name)

  const stateIntegrations = Object.entries(
    state.state.containers[serviceName].integrations ?? {},
  )
    .filter(([name, integration]) =>
      ['awsEventBridge', 'schedule'].includes(integration.type),
    )
    .filter(([name]) => !expectedIntegrations.includes(name))

  await Promise.all(
    stateIntegrations.map(async ([name]) => {
      const { ruleArn, apiDestinationArn, connectionArn } =
        state.state.containers[serviceName].integrations[name]
      await awsEventBridgeClient.removeRuleAndDestination({
        ruleArn,
        apiDestinationArn,
        connectionArn,
      })
      delete state.state.containers[serviceName].integrations[name]
    }),
  )
  await state.save()
}
