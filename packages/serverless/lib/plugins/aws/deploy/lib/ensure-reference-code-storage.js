import ServerlessError from '../../../../serverless-error.js'
import { log } from '@serverless/util'

const POLICY_SID = 'ServerlessLambdaSelfManagedCodeAccess'

export default {
  /**
   * Reference code storage prerequisites, run after setBucketName():
   * - framework-owned global bucket: ensure the Lambda-read bucket policy
   *   statement exists (merge by Sid, never clobbers other statements)
   * - custom user bucket: hands-off — hard-fail if unversioned, best-effort
   *   warn if the policy is readable and lacks the Lambda grant
   * - legacy in-stack bucket: handled in the compiled template
   *   (generate-core-template.js), nothing to do at deploy time
   */
  async ensureReferenceCodeStoragePrereqs() {
    if (!this.provider.isReferenceCodeStorageMode()) return

    if (this.serverless.service.provider.deploymentBucket) {
      await this.validateCustomBucketForReferenceMode()
      return
    }
    if (this.globalDeploymentBucketUsed) {
      await this.ensureGlobalBucketReferencePolicy()
    }
  },

  buildReferencePolicyStatement(accountId) {
    return {
      Sid: POLICY_SID,
      Effect: 'Allow',
      Principal: { Service: 'lambda.amazonaws.com' },
      Action: ['s3:GetObject', 's3:GetObjectVersion'],
      Resource: `arn:aws:s3:::${this.bucketName}/*`,
      Condition: { StringEquals: { 'aws:SourceAccount': accountId } },
    }
  },

  async ensureGlobalBucketReferencePolicy() {
    let policy = { Version: '2012-10-17', Statement: [] }
    try {
      const result = await this.provider.request('S3', 'getBucketPolicy', {
        Bucket: this.bucketName,
      })
      policy = JSON.parse(result.Policy)
    } catch (error) {
      const isNoSuchBucketPolicy =
        error.providerError?.code === 'NoSuchBucketPolicy' ||
        error.code === 'AWS_S3_GET_BUCKET_POLICY_NO_SUCH_BUCKET_POLICY'
      if (!isNoSuchBucketPolicy) throw error
    }
    if (!Array.isArray(policy.Statement)) {
      policy.Statement = policy.Statement ? [policy.Statement] : []
    }
    if (policy.Statement.some((statement) => statement.Sid === POLICY_SID)) {
      return
    }
    policy.Statement.push(
      this.buildReferencePolicyStatement(await this.provider.getAccountId()),
    )
    await this.provider.request('S3', 'putBucketPolicy', {
      Bucket: this.bucketName,
      Policy: JSON.stringify(policy),
    })
    log.info(
      `Granted the Lambda service read access to deployment bucket "${this.bucketName}" (self-managed code storage)`,
    )
  },

  async validateCustomBucketForReferenceMode() {
    const versioning = await this.provider.request(
      'S3',
      'getBucketVersioning',
      { Bucket: this.bucketName },
    )
    if (versioning.Status !== 'Enabled') {
      throw new ServerlessError(
        `Deployment bucket "${this.bucketName}" must have versioning enabled to use "codeStorageMode: reference". ` +
          'Enable versioning on the bucket, or remove the codeStorageMode setting.',
        'REFERENCE_MODE_BUCKET_NOT_VERSIONED',
      )
    }

    // Best-effort policy check — the framework never mutates user-owned buckets
    let result
    try {
      result = await this.provider.request('S3', 'getBucketPolicy', {
        Bucket: this.bucketName,
      })
    } catch (error) {
      const isNoSuchBucketPolicy =
        error.providerError?.code === 'NoSuchBucketPolicy' ||
        error.code === 'AWS_S3_GET_BUCKET_POLICY_NO_SUCH_BUCKET_POLICY'
      if (!isNoSuchBucketPolicy) {
        // Cannot read the policy for some other reason (e.g. AccessDenied) —
        // skip silently (best effort).
        return
      }
      const statementJson = JSON.stringify(
        this.buildReferencePolicyStatement(await this.provider.getAccountId()),
        null,
        2,
      )
      throw new ServerlessError(
        `Deployment bucket "${this.bucketName}" has no bucket policy. "codeStorageMode: reference" requires ` +
          'the Lambda service to be able to read artifacts directly from this bucket. Add a bucket policy ' +
          `statement granting it read access, for example:\n${statementJson}`,
        'REFERENCE_MODE_BUCKET_POLICY_MISSING',
      )
    }

    const policy = JSON.parse(result.Policy)
    const statements = Array.isArray(policy.Statement)
      ? policy.Statement
      : [policy.Statement]
    const grantsLambdaRead = statements.some((statement) => {
      if (statement?.Effect !== 'Allow') return false
      const principals = [statement.Principal?.Service ?? []].flat()
      // Exact principal match (not a substring check): each entry is an IAM
      // service principal identifier, compared in full.
      if (
        !principals.some((principal) => principal === 'lambda.amazonaws.com')
      ) {
        return false
      }
      const actions = [statement.Action ?? []].flat()
      return (
        actions.includes('s3:GetObject') ||
        actions.includes('s3:Get*') ||
        actions.includes('s3:*')
      )
    })
    if (!grantsLambdaRead) {
      const statementJson = JSON.stringify(
        this.buildReferencePolicyStatement(await this.provider.getAccountId()),
        null,
        2,
      )
      log.warning(
        `Deployment bucket "${this.bucketName}" policy does not appear to grant the Lambda service read access, ` +
          'which "codeStorageMode: reference" requires. Add a statement like:\n' +
          statementJson,
      )
    }
  },
}
