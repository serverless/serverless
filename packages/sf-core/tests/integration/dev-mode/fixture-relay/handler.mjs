import { createHash } from 'node:crypto'
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts'

const digest = (value) =>
  createHash('sha256').update(String(value)).digest('hex')

// The function's access key id: a variable in Lambda, served by the credentials endpoint on the
// developer's machine.
const accessKeyId = async () => {
  if (process.env.AWS_ACCESS_KEY_ID) return process.env.AWS_ACCESS_KEY_ID
  const response = await fetch(process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI, {
    headers: { Authorization: process.env.AWS_CONTAINER_AUTHORIZATION_TOKEN },
  })
  return (await response.json()).AccessKeyId
}

export const handler = async (event = {}) => {
  if (event.throw) throw new Error(String(event.throw))
  if (event.sleepMs) {
    console.log('relay fixture sleeping', Number(event.sleepMs), 'ms')
    await new Promise((resolve) => setTimeout(resolve, Number(event.sleepMs)))
  }
  const identity = await new STSClient({}).send(
    new GetCallerIdentityCommand({}),
  )
  return {
    ran:
      process.env.LAMBDA_TASK_ROOT === '/var/task'
        ? 'deployed'
        : 'this-machine',
    keyDigest: digest(await accessKeyId()),
    devVariables: Object.keys(process.env).filter((name) =>
      name.startsWith('SLS_DEV_'),
    ),
    callerArn: identity.Arn,
    ...(event.bytes && { pad: 'x'.repeat(Number(event.bytes)) }),
  }
}
