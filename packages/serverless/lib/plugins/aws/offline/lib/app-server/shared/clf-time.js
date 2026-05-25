/**
 * Common Log Format (CLF) timestamp helpers shared across event factories.
 *
 * AWS API Gateway emits `requestContext.requestTime` (REST v1) and
 * `requestContext.time` (HTTP API v2) in the same strftime pattern
 * `%d/%b/%Y:%H:%M:%S %z` with a `+0000` UTC offset. The strings are
 * byte-identical between v1 and v2; ALB also reuses this format on its
 * x-amzn-trace-id companion fields (M4 will be the third caller).
 */

const MONTH_ABBR = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

/**
 * Format a `Date` as `dd/Mon/YYYY:HH:MM:SS +0000` in UTC. Used for
 * APIGW v1 `requestContext.requestTime`, APIGW v2 `requestContext.time`,
 * and ALB-equivalent access-log timestamps.
 *
 * @param {Date} date
 * @returns {string}
 */
export function formatClfTime(date) {
  const pad = (n) => String(n).padStart(2, '0')
  const dd = pad(date.getUTCDate())
  const mon = MONTH_ABBR[date.getUTCMonth()]
  const yyyy = date.getUTCFullYear()
  const hh = pad(date.getUTCHours())
  const mm = pad(date.getUTCMinutes())
  const ss = pad(date.getUTCSeconds())
  return `${dd}/${mon}/${yyyy}:${hh}:${mm}:${ss} +0000`
}
