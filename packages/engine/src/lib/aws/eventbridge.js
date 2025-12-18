import {
  EventBridgeClient as AwsSdkEventBridgeClient,
  CreateConnectionCommand,
  DescribeConnectionCommand,
  DescribeApiDestinationCommand,
  CreateApiDestinationCommand,
  PutRuleCommand,
  PutTargetsCommand,
  DeleteRuleCommand,
  ListTargetsByRuleCommand,
  RemoveTargetsCommand,
  DeleteApiDestinationCommand,
  DeleteConnectionCommand,
} from '@aws-sdk/client-eventbridge'
import { ServerlessError, log, addProxyToAwsClient } from '@serverless/util'
import { AwsIamClient } from './iam.js'
import { randomUUID, createHash } from 'node:crypto'
const logger = log.get('aws:eventbridge')

/**
 * Generates a name by joining parts with hyphens and optionally adding a suffix
 * @param {string[]} parts - Array of name parts to join
 * @param {number} maxChars - Maximum characters allowed in the name
 * @param {string} [suffix] - Optional suffix to append
 * @returns {string} The generated name
 */
const createEntityName = (parts, maxChars, suffix = undefined) => {
  const fullName = `${parts.join('-')}${suffix ? `-${suffix}` : ''}`
  if (maxChars && fullName.length > maxChars) {
    const hash = createHash('sha256')
      .update(fullName)
      .digest('hex')
      .substring(0, 8)
    return `${fullName.substring(0, maxChars - 1 - hash.length)}-${hash}` // -1 to account for the hyphen
  }
  return fullName
}

export class AwsEventBridgeClient {
  constructor(awsConfig = {}) {
    this.client = addProxyToAwsClient(
      new AwsSdkEventBridgeClient({ ...awsConfig }),
    )
    this.iamClient = new AwsIamClient(awsConfig)
  }

  async #getConnectionIfExists(baseName, name) {
    try {
      const entityName = createEntityName([baseName, name, 'connection'], 64)
      const res = await this.client.send(
        new DescribeConnectionCommand({
          Name: entityName,
        }),
      )

      if (res.ConnectionArn) {
        return res.ConnectionArn
      }
    } catch (error) {
      return undefined
    }
  }

  async #getApiDestinationIfExists(baseName, name) {
    try {
      const entityName = createEntityName([baseName, name, 'destination'], 64)
      const res = await this.client.send(
        new DescribeApiDestinationCommand({
          Name: entityName,
        }),
      )

      if (res.ApiDestinationArn) {
        return res.ApiDestinationArn
      }
    } catch (error) {
      return undefined
    }
  }

  async #createConnection(baseName, name, authToken) {
    const existingConnectionArn = await this.#getConnectionIfExists(
      baseName,
      name,
    )
    if (existingConnectionArn) {
      return existingConnectionArn
    }

    const entityName = createEntityName([baseName, name, 'connection'], 64)
    const res = await this.client.send(
      new CreateConnectionCommand({
        Name: entityName,
        AuthorizationType: 'API_KEY',
        AuthParameters: {
          ApiKeyAuthParameters: {
            ApiKeyName: 'x-eventbridge-key',
            ApiKeyValue: authToken,
          },
        },
      }),
    )

    if (res.ConnectionArn) {
      return res.ConnectionArn
    }

    throw new ServerlessError(
      `Failed to create connection ${name}`,
      'EVENTBRIDGE_CREATE_CONNECTION_FAILED',
      {
        stack: false,
      },
    )
  }

  async #createApiDestination({
    baseName,
    name,
    connectionArn,
    endpoint,
    eventPattern,
    scheduleExpression,
  }) {
    const entityName = createEntityName([baseName, name, 'destination'], 64)
    let existingApiDestinationArn = await this.#getApiDestinationIfExists(
      baseName,
      name,
    )
    if (!existingApiDestinationArn) {
      const createApiDestinationRes = await this.client.send(
        new CreateApiDestinationCommand({
          Name: entityName,
          ConnectionArn: connectionArn,
          Description: `API destination for ${name}`,
          HttpMethod: 'POST',
          InvocationEndpoint: endpoint,
        }),
      )

      if (!createApiDestinationRes.ApiDestinationArn) {
        throw new ServerlessError(
          `Failed to create API destination ${name}`,
          'EVENTBRIDGE_CREATE_API_DESTINATION_FAILED',
          {
            stack: false,
          },
        )
      }
      existingApiDestinationArn = createApiDestinationRes.ApiDestinationArn
    }

    const ruleName = createEntityName([baseName, name, 'rule'], 64)
    const createRuleRes = await this.client.send(
      new PutRuleCommand({
        Name: ruleName,
        EventPattern: eventPattern ? JSON.stringify(eventPattern) : undefined,
        ScheduleExpression: scheduleExpression ? scheduleExpression : undefined,
      }),
    )

    if (!createRuleRes.RuleArn) {
      throw new ServerlessError(
        `Failed to create rule ${name}`,
        'EVENTBRIDGE_CREATE_RULE_FAILED',
        {
          stack: false,
        },
      )
    }

    const roleArn = await this.iamClient.createRoleForEventBridgeAPITarget(name)

    const targetId = createEntityName([baseName, name, 'target'], 64)
    const putTargetsRes = await this.client.send(
      new PutTargetsCommand({
        Rule: ruleName,
        Targets: [
          {
            Id: targetId,
            Arn: existingApiDestinationArn,
            RoleArn: roleArn,
          },
        ],
      }),
    )

    if (!putTargetsRes.FailedEntryCount === 0) {
      throw new ServerlessError(
        `Failed to create targets for ${name}`,
        'EVENTBRIDGE_CREATE_TARGETS_FAILED',
        {
          stack: false,
        },
      )
    }

    return {
      ruleArn: createRuleRes.RuleArn,
      apiDestinationArn: existingApiDestinationArn,
    }
  }

  async createApiEventTarget(
    baseName,
    name,
    endpoint,
    eventPattern,
    authToken = undefined,
  ) {
    const finalizedAuthToken = authToken ?? randomUUID()
    const connectionArn = await this.#createConnection(
      baseName,
      name,
      finalizedAuthToken,
    )
    const { ruleArn, apiDestinationArn } = await this.#createApiDestination({
      baseName,
      name,
      connectionArn,
      endpoint,
      eventPattern,
    })

    return {
      ruleArn,
      apiDestinationArn,
      connectionArn,
    }
  }

  async createScheduledEventTarget(
    baseName,
    name,
    endpoint,
    scheduleExpression,
    authToken = undefined,
  ) {
    const finalizedAuthToken = authToken ?? randomUUID()
    const connectionArn = await this.#createConnection(
      baseName,
      name,
      finalizedAuthToken,
    )
    const { ruleArn, apiDestinationArn } = await this.#createApiDestination({
      baseName,
      name,
      connectionArn,
      endpoint,
      scheduleExpression,
    })

    return {
      ruleArn,
      apiDestinationArn,
      connectionArn,
    }
  }

  async removeRuleAndDestination({
    ruleArn,
    apiDestinationArn,
    connectionArn,
  }) {
    const ruleName = ruleArn.split('/').pop()
    const apiDestinationName = apiDestinationArn.split('/')[1]
    const connectionName = connectionArn.split('/')[1]

    logger.debug('Removing rule and destination', {
      ruleName,
      apiDestinationName,
      connectionName,
    })
    try {
      const listTargetsByRuleResponse = await this.client.send(
        new ListTargetsByRuleCommand({
          Rule: ruleName,
        }),
      )

      if (listTargetsByRuleResponse.Targets.length > 0) {
        await this.client.send(
          new RemoveTargetsCommand({
            Rule: ruleName,
            Ids: listTargetsByRuleResponse.Targets.map((target) => target.Id),
          }),
        )
      }
    } catch (error) {
      if (error.name !== 'ResourceNotFoundException') {
        throw error
      }
    }

    await this.client.send(
      new DeleteRuleCommand({
        Name: ruleName,
      }),
    )

    await this.client.send(
      new DeleteApiDestinationCommand({
        Name: apiDestinationName,
      }),
    )

    await this.client.send(
      new DeleteConnectionCommand({
        Name: connectionName,
      }),
    )
  }
}
