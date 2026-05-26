export function handler(event, context, callback) {
  // Settle via callback first; then return a promise that resolves later.
  // The callback path should win the race (settled-once guard prevents the
  // promise from later overwriting the callback value).
  callback(null, { via: 'callback-first' })
  return new Promise((res) =>
    setTimeout(() => res({ via: 'promise-late' }), 10),
  )
}
