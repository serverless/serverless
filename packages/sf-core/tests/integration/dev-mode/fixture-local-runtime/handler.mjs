import { createHash } from 'node:crypto'
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts'

let invocations = 0
const digest = (value) =>
  createHash('sha256').update(String(value)).digest('hex')

// `capture` lets the test read this function's environment from AWS; every other event is what
// runs on the developer's machine.
export const handler = async (event = {}, context) => {
  if (event.capture) return { environment: { ...process.env } }
  if (event.fail) throw new Error(event.fail)
  invocations += 1
  const response = await fetch(process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI, {
    headers: { Authorization: process.env.AWS_CONTAINER_AUTHORIZATION_TOKEN },
  })
  const served = await response.json()
  const identity = await new STSClient({}).send(
    new GetCallerIdentityCommand({}),
  )
  return {
    invocations,
    keyDigest: digest(served.AccessKeyId),
    callerArn: identity.Arn,
    greeting: process.env.FIXTURE_GREETING ?? null,
    tz: process.env.TZ ?? null,
    profile: process.env.AWS_PROFILE ?? null,
    devVariables: Object.keys(process.env).filter((name) =>
      name.startsWith('SLS_DEV_'),
    ),
    functionName: context.functionName,
    remainingMs: context.getRemainingTimeInMillis(),
  }
}
