import {
  CloudFormationClient,
  DescribeStacksCommand,
  DescribeStackEventsCommand,
  CreateStackCommand,
  UpdateStackCommand,
  DeleteStackCommand,
} from '@aws-sdk/client-cloudformation'
import crypto from 'crypto'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { addProxyToAwsClient } from '@serverless/util'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const statusesPath = path.resolve(__dirname, 'statuses.json')

const statuses = JSON.parse(readFileSync(statusesPath, 'utf-8'))

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Stack class to manage the CloudFormation stack
 */
export default class Stack {
  id
  constructor({
    region = null,
    credentials = null,
    name,
    parameters,
    onStatusUpdate = null,
    onFailedEvent = null,
  }) {
    this.region = region
    this.credentials = credentials

    if (onStatusUpdate) {
      this.onStatusUpdate = onStatusUpdate
    }

    if (onFailedEvent) {
      this.onFailedEvent = onFailedEvent
    }

    this.deploymentStartTime = Date.now()
    this.eventsFingerprints = []

    this.name = name
    this.parameters = parameters
    this.status = null
    this.outputs = []

    this.client = addProxyToAwsClient(
      new CloudFormationClient({
        region,
        credentials,
      }),
    )
  }

  /**
   * Fetch the stack details
   */
  async get() {
    try {
      const describeStacksResponse = await this.client.send(
        new DescribeStacksCommand({
          StackName: this.name,
        }),
      )

      if (describeStacksResponse.Stacks?.length > 0) {
        const stack = describeStacksResponse.Stacks[0]

        this.id = stack.StackId
        this.status = stack.StackStatus
        this.outputs = this._formatOutputs(stack.Outputs)

        return this
      }

      this.status = null
      return null
    } catch (error) {
      if (
        error.Code === 'ValidationError' &&
        error.message.includes('does not exist')
      ) {
        this.status = null
        return null
      }
      throw error
    }
  }

  /**
   * Create a new stack using the base template
   */
  async create(userTemplate, functionsWithUrls) {
    for (const [functionName, { uri }] of Object.entries(functionsWithUrls)) {
      userTemplate.Resources[functionName].Properties.CodeUri = uri
    }

    const { StackId } = await this.client.send(
      new CreateStackCommand({
        StackName: this.name,
        TemplateBody: JSON.stringify(userTemplate),
        Parameters: this.parameters,
        Capabilities: [
          'CAPABILITY_IAM',
          'CAPABILITY_NAMED_IAM',
          'CAPABILITY_AUTO_EXPAND',
        ],
      }),
    )
    this.id = StackId
    return await this.progress()
  }

  /**
   * Check the create/update progress of the status
   * and wait for the final status
   */
  async progress() {
    await Promise.all([this.get(), this.getEvents()])

    this.onStatusUpdate(this.status)

    if (!this.status || statuses[this.status]?.isFinal) {
      return this
    }

    await sleep(5000)

    return await this.progress()
  }

  /**
   * Update the stack by compining the user template
   * with the upload functions and their URLS
   * @param {*} userTemplate
   * @param {*} functionsWithUrls
   * @returns
   */
  async update(userTemplate, functionsWithUrls) {
    for (const [functionName, { uri }] of Object.entries(functionsWithUrls)) {
      userTemplate.Resources[functionName].Properties.CodeUri = uri
    }

    try {
      const { StackId } = await this.client.send(
        new UpdateStackCommand({
          StackName: this.name,
          TemplateBody: JSON.stringify(userTemplate),
          Parameters: this.parameters,
          Capabilities: [
            'CAPABILITY_IAM',
            'CAPABILITY_NAMED_IAM',
            'CAPABILITY_AUTO_EXPAND',
          ],
        }),
      )
      this.id = StackId
    } catch (e) {
      if (e.Code === 'ValidationError' && e.message.includes('No updates')) {
        this.isUpToDate = true
      } else {
        throw e
      }
    }

    return await this.progress()
  }

  /**
   * Get all stack events
   * @returns
   */
  async getEvents() {
    try {
      const { StackEvents } = await this.client.send(
        new DescribeStackEventsCommand({ StackName: this.name }),
      )

      for (const event of StackEvents) {
        event.eventHash = crypto
          .createHash('md5')
          .update(JSON.stringify(event))
          .digest('hex')

        event.eventTime = new Date(event.Timestamp).getTime()

        if (this.isNewFailureEvent(event)) {
          this.eventsFingerprints.push(event.eventHash)
          this.onFailedEvent(event)
        }
      }
    } catch (e) {
      if (
        e.Code === 'ValidationError' &&
        e.message.includes('does not exist')
      ) {
        return null
      }
      throw e
    }
  }

  /**
   * Delete the stack
   *
   * @returns
   */
  async delete() {
    await this.client.send(
      new DeleteStackCommand({
        StackName: this.name,
      }),
    )

    return await this.progress()
  }

  /**
   * Check to see if the CF event is a new failure event
   * @param {*} event
   * @returns
   */
  isNewFailureEvent(event) {
    const isNewEvent =
      event.eventTime > this.deploymentStartTime &&
      !this.eventsFingerprints.includes(event.eventHash)

    const isFailureEvent = statuses[event.ResourceStatus]?.type === 'failure'

    const isStatusReasonExists =
      event.ResourceStatusReason &&
      event.ResourceStatusReason !== '-' &&
      event.ResourceStatusReason !== 'Resource creation cancelled' &&
      !event.ResourceStatusReason.includes(
        'The following resource(s) failed to',
      )

    return isNewEvent && isFailureEvent && isStatusReasonExists
  }

  /**
   * Format the outputs into a key value object
   *
   * @param {*} outputs
   * @returns
   */
  _formatOutputs(outputs = []) {
    return outputs.reduce((outputsObject, output) => {
      outputsObject[output.OutputKey] = output.OutputValue
      return outputsObject
    }, {})
  }
}
