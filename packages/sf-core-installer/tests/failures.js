const assert = require('node:assert/strict')

const { describeError } = require('../binary')

// fetch() reports every failure as "fetch failed" and puts the reason in the
// `cause` chain (and, for multi-address connects, in AggregateError
// `errors`). These validators for assert.rejects() match against that whole
// chain, so assertions stay as specific as the underlying reason.

const codesOf = (err) => {
  const codes = []
  const seen = new Set()
  for (let node = err; node && !seen.has(node); node = node.cause) {
    seen.add(node)
    if (node.code) codes.push(node.code)
    for (const sub of node.errors || []) if (sub.code) codes.push(sub.code)
  }
  return codes
}

// Passes when the described chain contains `text`
const failsWith = (text) => (err) => {
  assert.ok(
    describeError(err).includes(text),
    `expected "${text}" in: ${describeError(err)}`,
  )
  return true
}

// Passes when any error in the chain carries one of `codes`
const failsWithCode =
  (...codes) =>
  (err) => {
    assert.ok(
      codesOf(err).some((code) => codes.includes(code)),
      `expected one of ${codes.join(', ')} in: ${describeError(err)}`,
    )
    return true
  }

module.exports = { codesOf, failsWith, failsWithCode }
