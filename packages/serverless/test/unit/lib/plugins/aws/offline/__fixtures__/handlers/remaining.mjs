export function handler(event, context) {
  return { remaining: context.getRemainingTimeInMillis() }
}
