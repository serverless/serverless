'use strict'

const MEMORY = [512, 1024, 2048, 4096, 8192]

export function validateSandboxes(sandboxesConfig, { throwError }) {
  for (const [name, c] of Object.entries(sandboxesConfig || {})) {
    if (!c || !c.artifact) {
      throwError(`sandboxes.${name}: "artifact" is required`)
      continue
    }
    const a = c.artifact
    if (
      typeof a === 'string' &&
      !a.startsWith('s3://') &&
      /(^[a-z0-9.-]+\.amazonaws\.com\/|:\/\/)/.test(a) &&
      !a.startsWith('./') &&
      !a.startsWith('/')
    ) {
      throwError(
        `sandboxes.${name}.artifact must be a local directory or an s3:// URI (ECR/other URIs are not supported by Lambda MicroVMs)`,
      )
      continue
    }
    if (c.memory != null && !MEMORY.includes(c.memory)) {
      throwError(
        `sandboxes.${name}.memory must be one of ${MEMORY.join(', ')} MiB`,
      )
      continue
    }
    if (c.vpc) {
      if (!Array.isArray(c.vpc.subnets) || c.vpc.subnets.length === 0) {
        throwError(`sandboxes.${name}.vpc requires at least one subnet`)
        continue
      }
      if (
        !Array.isArray(c.vpc.securityGroups) ||
        c.vpc.securityGroups.length === 0
      ) {
        throwError(`sandboxes.${name}.vpc requires at least one securityGroup`)
        continue
      }
    }
    const obs = c.observability
    if (obs && typeof obs === 'object') {
      if (obs.alarms && !obs.alarms.notify) {
        throwError(
          `sandbox "${name}": observability.alarms requires "notify" (an SNS topic ARN or ref)`,
        )
      }
      const ALLOWED_RETENTION = [
        1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1096,
        1827, 2192, 2557, 2922, 3288, 3653,
      ]
      const rd = obs.logs && obs.logs.retentionDays
      if (rd !== undefined && !ALLOWED_RETENTION.includes(rd)) {
        throwError(
          `sandbox "${name}": observability.logs.retentionDays must be a valid CloudWatch value (e.g. 1, 7, 14, 30, 90, 365…)`,
        )
      }
    }
  }
}

export const SUPPORTED_MEMORY = MEMORY
