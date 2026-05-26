export function handler(event, context) {
  context.succeed({ via: 'succeed', echoed: event.msg })
}
