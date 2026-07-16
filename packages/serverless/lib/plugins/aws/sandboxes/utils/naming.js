import { createHash } from 'crypto'

// Truncate `value` to `maxLen` chars, replacing the tail with a short sha256 hash
// so distinct long inputs stay unique instead of colliding after truncation.
// `sep` joins the head and hash — '' for CloudFormation logical IDs (which must
// be alphanumeric) and '-' for physical resource names (where hyphens are fine).
// The framework caps its own logical IDs with this same slice+hash idiom; there
// is no shared util to reuse, so this keeps the two sandbox naming helpers DRY.
function truncateWithHash(value, maxLen, sep = '') {
  if (value.length <= maxLen) return value
  const hash = createHash('sha256').update(value).digest('hex').slice(0, 7)
  return `${value.slice(0, maxLen - sep.length - 7)}${sep}${hash}`
}

export function getResourceName(serviceName, name, stage) {
  const raw = `${serviceName}-${name}-${stage}`.replace(/[^a-zA-Z0-9-_]/g, '')
  const safe = /^[a-zA-Z0-9]/.test(raw) ? raw : `s${raw}`
  // Physical names cap at 64 chars; '-' is allowed so use it as the separator.
  return truncateWithHash(safe, 64, '-')
}

export function getLogicalId(name, suffix) {
  const expanded = name.replace(/-/g, 'Dash').replace(/_/g, 'Underscore')
  const alnum = expanded.replace(/[^a-zA-Z0-9]/g, '')
  const cased = `${alnum.charAt(0).toUpperCase()}${alnum.slice(1)}`
  const safe = /^[a-zA-Z]/.test(cased) ? cased : `S${cased}`
  // CloudFormation logical IDs are alphanumeric and capped at 255 chars. Keep the
  // suffix intact and cap the name portion (no separator — '-' isn't allowed).
  return `${truncateWithHash(safe, 255 - suffix.length)}${suffix}`
}
