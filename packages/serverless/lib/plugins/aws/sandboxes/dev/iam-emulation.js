'use strict'

import { resolveSandboxOutputs } from '../runtime/dataplane.js'
import {
  getRoleNameFromArn,
  areCredentialsExpiring,
  addPrincipalToPolicy,
  isPrincipalInPolicy,
  calculateBackoffDelay,
  resolveCallerPrincipalArn,
} from '../../bedrock-agentcore/dev/credentials.js'

const DEV_SID = 'ServerlessSandboxesLocalDevPolicy'
// IAM trust-policy propagation takes ~10-20s; wait before the first AssumeRole so a
// premature AccessDenied is not negatively cached by STS.
const TRUST_POLICY_PROPAGATION_WAIT_MS = 10000
const MAX_ASSUME_ATTEMPTS = 8

function findDevPolicyStatementIndex(trustPolicy) {
  if (!trustPolicy?.Statement || !Array.isArray(trustPolicy.Statement)) {
    return -1
  }
  return trustPolicy.Statement.findIndex((stmt) => stmt.Sid === DEV_SID)
}

function createDevPolicyStatement(userArn) {
  return {
    Sid: DEV_SID,
    Effect: 'Allow',
    Principal: {
      AWS: [userArn],
    },
    Action: 'sts:AssumeRole',
  }
}

class SandboxIamEmulation {
  constructor({ provider, logger, sleep } = {}) {
    this.provider = provider
    this.logger = logger
    this.sleep = sleep || ((ms) => new Promise((r) => setTimeout(r, ms)))
    this.roleArn = null
    this.roleName = null
    this.principalArn = null
    this.maxSessionDuration = undefined
    this.credentials = null
    this._addedPrincipal = false
  }

  async setUp(sandboxName) {
    try {
      const { executionRoleArn } = await resolveSandboxOutputs(
        this.provider,
        sandboxName,
      )
      this.roleArn = executionRoleArn
      this.roleName = getRoleNameFromArn(executionRoleArn)

      const caller = await this.provider.request('STS', 'getCallerIdentity', {})
      this.principalArn = await resolveCallerPrincipalArn(
        caller.Arn,
        async (roleName) => {
          const res = await this.provider.request('IAM', 'getRole', {
            RoleName: roleName,
          })
          return res.Role?.Arn
        },
      )

      await this._ensureTrustPolicy()
      this.credentials = await this._assume()
      return this._env()
    } catch (err) {
      this.logger.notice(
        `IAM emulation unavailable for "${sandboxName}" (${err.message}); ` +
          `the sandbox will run with your ambient AWS credentials. ` +
          `Use --no-assume-role to silence this.`,
      )
      return null
    }
  }

  credentialsExpiring() {
    return areCredentialsExpiring(this.credentials)
  }

  async refresh() {
    try {
      this.credentials = await this._assume()
      return this._env()
    } catch (err) {
      this.logger.debug?.(`Credential refresh failed: ${err.message}`)
      return null
    }
  }

  async cleanUp() {
    if (!this._addedPrincipal || !this.roleName) return
    try {
      const trustPolicy = await this._getTrustPolicy()
      const idx = findDevPolicyStatementIndex(trustPolicy)
      if (idx === -1) return
      const stmt = trustPolicy.Statement[idx]
      const principals = (
        Array.isArray(stmt.Principal?.AWS)
          ? stmt.Principal.AWS
          : [stmt.Principal?.AWS].filter(Boolean)
      ).filter((p) => p !== this.principalArn)
      if (principals.length === 0) {
        trustPolicy.Statement.splice(idx, 1)
      } else {
        stmt.Principal.AWS = principals
      }
      await this.provider.request('IAM', 'updateAssumeRolePolicy', {
        RoleName: this.roleName,
        PolicyDocument: JSON.stringify(trustPolicy),
      })
    } catch (err) {
      this.logger.debug?.(`Trust-policy cleanup failed: ${err.message}`)
    }
  }

  async _getTrustPolicy() {
    const res = await this.provider.request('IAM', 'getRole', {
      RoleName: this.roleName,
    })
    if (res.Role?.MaxSessionDuration) {
      this.maxSessionDuration = res.Role.MaxSessionDuration
    }
    const doc = JSON.parse(
      decodeURIComponent(res.Role.AssumeRolePolicyDocument),
    )
    // IAM allows `Statement` to be a single object rather than an array;
    // normalize so the find/push/splice below can treat it uniformly.
    if (doc.Statement && !Array.isArray(doc.Statement)) {
      doc.Statement = [doc.Statement]
    }
    return doc
  }

  async _ensureTrustPolicy() {
    const trustPolicy = await this._getTrustPolicy()
    const idx = findDevPolicyStatementIndex(trustPolicy)
    let changed = false
    if (idx === -1) {
      trustPolicy.Statement.push(createDevPolicyStatement(this.principalArn))
      changed = true
    } else if (
      !isPrincipalInPolicy(trustPolicy.Statement[idx], this.principalArn)
    ) {
      addPrincipalToPolicy(trustPolicy.Statement[idx], this.principalArn)
      changed = true
    }
    if (!changed) return
    await this.provider.request('IAM', 'updateAssumeRolePolicy', {
      RoleName: this.roleName,
      PolicyDocument: JSON.stringify(trustPolicy),
    })
    this._addedPrincipal = true
    await this.sleep(TRUST_POLICY_PROPAGATION_WAIT_MS)
  }

  async _assume() {
    const base = {
      RoleArn: this.roleArn,
      RoleSessionName: `serverless-sandbox-dev-${this.roleName}`.slice(0, 64),
    }
    let withDuration = this.maxSessionDuration
      ? { ...base, DurationSeconds: this.maxSessionDuration }
      : { ...base }
    let lastError
    for (let attempt = 1; attempt <= MAX_ASSUME_ATTEMPTS; attempt++) {
      try {
        const res = await this.provider.request(
          'STS',
          'assumeRole',
          withDuration,
        )
        return res.Credentials
      } catch (err) {
        lastError = err
        // A rejected DurationSeconds is not transient — retry once without it.
        if (
          withDuration.DurationSeconds !== undefined &&
          /duration/i.test(err.message)
        ) {
          withDuration = { ...base }
          continue
        }
        if (attempt < MAX_ASSUME_ATTEMPTS) {
          await this.sleep(calculateBackoffDelay(attempt))
        }
      }
    }
    throw lastError
  }

  _env() {
    return {
      AWS_ACCESS_KEY_ID: this.credentials.AccessKeyId,
      AWS_SECRET_ACCESS_KEY: this.credentials.SecretAccessKey,
      AWS_SESSION_TOKEN: this.credentials.SessionToken,
      AWS_REGION: this.provider.getRegion(),
    }
  }
}

export default SandboxIamEmulation
