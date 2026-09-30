// Logs objects both ways the local runtime wrapper formats them, and reports whether the
// wrapper's plain-output flag reached the handler's environment.
export const handler = async () => {
  console.log({ nested: { ok: true, count: 1 } })
  process.stdout.write(`${JSON.stringify({ viaWrite: true })}\n`)
  return { sawFlag: process.env.SLS_DEV_PLAIN_OUTPUT ?? null }
}
