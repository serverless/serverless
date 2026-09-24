import { describe, expect, it, jest } from '@jest/globals'
import getStackInfo from '../../../../../../lib/plugins/aws/info/get-stack-info.js'

// `serverless info` on a stage that was never deployed is the normal state
// right after a project is created, so it gets one line that says so and how
// to deploy -- not CloudFormation's raw error with a stack trace. Any other
// failure of the stack lookup is passed through unchanged.
const context = ({ request, options = {}, compose = {} }) => ({
  ...getStackInfo,
  options,
  serverless: {
    compose,
    service: {
      service: 'hello-api',
      provider: {},
      getAllFunctions: () => [],
    },
  },
  provider: {
    request,
    getStage: () => 'dev',
    getRegion: () => 'eu-west-1',
    naming: { getStackName: () => 'hello-api-dev' },
  },
})

// The shape the AWS request layer throws for CloudFormation's answer.
const awsError = (message, code) =>
  Object.assign(new Error(message), {
    code: `AWS_CLOUD_FORMATION_DESCRIBE_STACKS_${code}`,
    providerError: {
      code: code === 'VALIDATION_ERROR' ? 'ValidationError' : 'Throttling',
    },
  })

describe('info: stack lookup', () => {
  it('a stage that was never deployed: one line naming the service, stage and region, and the deploy command', async () => {
    const request = jest.fn(async () => {
      throw awsError(
        'Stack with id hello-api-dev does not exist',
        'VALIDATION_ERROR',
      )
    })
    const error = await context({ request })
      .getStackInfo()
      .catch((e) => e)
    expect(error.code).toBe('STACK_NOT_FOUND')
    // The deploy command names the stage and region of this run, so it is
    // correct to copy whatever supplied them (flags, config, environment).
    expect(error.message).toBe(
      'Service "hello-api" is not deployed to stage "dev" in eu-west-1. Deploy it with "serverless deploy --stage dev --region eu-west-1".',
    )
    expect(error.stack).toBeUndefined()
  })

  // From a Compose root, a plain `serverless deploy` deploys every service,
  // stateful ones included, to the stage; the suggestion names this one.
  it('in a Compose project, the deploy command names this service only', async () => {
    const request = jest.fn(async () => {
      throw awsError(
        'Stack with id hello-api-dev does not exist',
        'VALIDATION_ERROR',
      )
    })
    const error = await context({
      request,
      compose: { isWithinCompose: true, serviceName: 'api' },
    })
      .getStackInfo()
      .catch((e) => e)
    expect(error.message).toBe(
      'Service "hello-api" is not deployed to stage "dev" in eu-west-1. Deploy it with "serverless deploy --service=api --stage dev --region eu-west-1".',
    )
  })

  it('any other lookup failure is rethrown unchanged', async () => {
    const original = awsError('Rate exceeded', 'THROTTLING')
    const request = jest.fn(async () => {
      throw original
    })
    const error = await context({ request })
      .getStackInfo()
      .catch((e) => e)
    expect(error).toBe(original)
  })

  it('another ValidationError is rethrown unchanged', async () => {
    const original = awsError('Stack name is invalid', 'VALIDATION_ERROR')
    const request = jest.fn(async () => {
      throw original
    })
    const error = await context({ request })
      .getStackInfo()
      .catch((e) => e)
    expect(error).toBe(original)
  })
})
