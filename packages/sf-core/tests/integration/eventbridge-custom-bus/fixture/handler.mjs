// Logs one line per invocation, so the suite can read from CloudWatch Logs
// what each invocation received: an array (a batch) or one event object.
export const consume = async (input) => {
  const batch = Array.isArray(input)
  const events = (batch ? input : [input]).map((event) =>
    typeof event.detail === 'string' ? JSON.parse(event.detail) : event.detail,
  )
  console.log(`EB_DELIVERY ${JSON.stringify({ batch, events })}`)
  const delayMs = Number(process.env.DELIVERY_DELAY_MS ?? 0)
  if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs))
}
