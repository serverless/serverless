// The Lambda Node.js runtime supplies this package to durable functions, so
// the fixture has no package.json.
import { withDurableExecution } from '@aws/durable-execution-sdk-js'

export const main = withDurableExecution(async (event, context) => {
  await context.step('first', async () => ({ received: event }))
  await context.wait({ seconds: 2 })
  return { ok: true }
})
