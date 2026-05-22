/**
 * Authorization-header-only service dispatcher for the offline AWS API server.
 *
 * Routing is performed exclusively by inspecting the SigV4 Authorization
 * header — specifically the service segment within the Credential scope.
 * No body inspection, no X-Amz-Target header, and no signature verification
 * are performed.
 */

/**
 * The set of AWS service names that this offline implementation recognises.
 *
 * @type {Set<string>}
 */
const RECOGNISED_SERVICES = new Set(['lambda', 'sqs', 'sns', 's3', 'events'])

/**
 * Inspect an incoming Hapi request and return the AWS service name that the
 * request is targeting, based solely on the SigV4 Authorization header.
 *
 * SigV4 Authorization header format:
 * ```
 * AWS4-HMAC-SHA256 Credential=<AKID>/<date>/<region>/<service>/aws4_request,
 *   SignedHeaders=<headers>, Signature=<sig>
 * ```
 * The service is the 4th `/`-separated segment (zero-indexed: index 3) within
 * the Credential value, i.e. the string between the region and `aws4_request`.
 *
 * @param {{ headers: Record<string, string> }} request
 *   A Hapi request object (or any object with a `headers` map).  Hapi
 *   lower-cases all header names; the function also checks the upper-case
 *   `Authorization` key for compatibility with raw Node.js objects.
 *
 * @returns {'lambda' | 'sqs' | 'sns' | 's3' | 'events' | null}
 *   The recognised service name, or `null` when the header is absent,
 *   not a SigV4 string, malformed, or targets an unrecognised service.
 */
export function detectService(request) {
  // Hapi normalises headers to lower-case; also accept the original casing.
  const authHeader =
    request.headers['authorization'] ?? request.headers['Authorization']

  if (!authHeader) {
    return null
  }

  // SigV4 Authorization headers begin with the algorithm designation.
  if (!authHeader.startsWith('AWS4-HMAC-SHA256 ')) {
    return null
  }

  // Extract the Credential=... portion.
  // Example: Credential=AKIAIOSFODNN7/20260522/us-east-1/sqs/aws4_request
  const credentialMatch = authHeader.match(/Credential=([^,\s]+)/)
  if (!credentialMatch) {
    return null
  }

  // The credential value is <AKID>/<date>/<region>/<service>/aws4_request.
  // Split on '/' to get all five segments.
  const parts = credentialMatch[1].split('/')
  if (parts.length < 5) {
    return null
  }

  // The service is at index 3 (zero-based).
  const service = parts[3]

  return RECOGNISED_SERVICES.has(service) ? service : null
}
