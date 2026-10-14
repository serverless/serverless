import { createHash } from 'node:crypto'

// An enum needs a real TypeScript build: Node.js's own type stripping refuses it, so an answer
// from this handler on the developer's machine proves the Dev Mode build ran.
enum Ran {
  Deployed = 'deployed',
  ThisMachine = 'this-machine',
}

// The parts of a direct invocation or a function URL event this handler reads.
interface FixtureEvent {
  headers?: Record<string, string | undefined>
  requestContext?: { http?: { method: string } }
}

interface FixtureContext {
  awsRequestId: string
}

const digest = (value: string | undefined): string =>
  createHash('sha256')
    .update(value ?? '')
    .digest('hex')

export const handler = async (
  event: FixtureEvent = {},
  context: FixtureContext,
) => {
  console.log('agent-loop fixture handled', context.awsRequestId)
  const authorization = event.headers?.authorization
  const result = {
    ran:
      process.env.LAMBDA_TASK_ROOT === '/var/task'
        ? Ran.Deployed
        : Ran.ThisMachine,
    language: 'typescript',
    requestId: context.awsRequestId,
    secretDigest: digest(process.env.FIXTURE_SECRET),
    // True only for the caller's real header: a replay of the redacted file would see "[redacted]".
    sawAuthorization:
      typeof authorization === 'string' && authorization !== '[redacted]',
  }
  if (!event.requestContext?.http) return result
  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(result),
  }
}
