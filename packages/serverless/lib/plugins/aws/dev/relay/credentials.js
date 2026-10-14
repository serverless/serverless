/**
 * The developer's AWS credentials as the relay uses them: read (and refreshed by the CLI's
 * provider chain) before every AWS IoT Core connect and once a minute, and read synchronously
 * wherever a request is signed in the middle of relaying (S3 links, Direct Messaging).
 */
export const createCredentialCache = ({ resolve }) => {
  let current = null
  return {
    /** Reads fresh credentials; rejects when they cannot be read (an expired SSO session). */
    async refresh() {
      current = await resolve()
      return current
    },
    /** The last credentials read; throws before the first successful refresh. */
    current() {
      if (!current) throw new Error('AWS credentials were not read yet')
      return current
    },
  }
}
