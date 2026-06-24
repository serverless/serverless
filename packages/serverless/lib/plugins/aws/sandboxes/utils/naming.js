import { createHash } from 'crypto'

export function getResourceName(serviceName, name, stage) {
  const raw = `${serviceName}-${name}-${stage}`.replace(/[^a-zA-Z0-9-_]/g, '')
  const safe = /^[a-zA-Z0-9]/.test(raw) ? raw : `s${raw}`
  if (safe.length <= 64) return safe
  // When truncation would occur, preserve uniqueness by replacing the tail
  // with a 7-char sha256 hex of the full sanitized string.  This keeps the
  // total length at 56+1+7 = 64 chars and ensures two names that share a
  // long common prefix produce different physical names.
  const hash = createHash('sha256').update(safe).digest('hex').slice(0, 7)
  return `${safe.slice(0, 56)}-${hash}`
}
export function getLogicalId(name, suffix) {
  const expanded = name.replace(/-/g, 'Dash').replace(/_/g, 'Underscore')
  const alnum = expanded.replace(/[^a-zA-Z0-9]/g, '')
  const cased = `${alnum.charAt(0).toUpperCase()}${alnum.slice(1)}`
  const safe = /^[a-zA-Z]/.test(cased) ? cased : `S${cased}`
  return `${safe}${suffix}`
}
