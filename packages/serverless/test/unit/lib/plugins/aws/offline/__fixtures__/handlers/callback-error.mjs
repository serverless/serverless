export function handler(event, context, callback) {
  callback(new Error('cb-fail'))
}
