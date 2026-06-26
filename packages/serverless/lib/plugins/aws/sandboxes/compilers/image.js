import { getResourceName } from '../utils/naming.js'

const RUNTIME = ['run', 'resume', 'suspend', 'terminate']
const IMAGE = ['ready', 'validate']
const DEFAULT_TIMEOUT = {
  ready: 30,
  validate: 30,
  run: 2,
  resume: 2,
  suspend: 5,
  terminate: 5,
}

function compileHooks(hooks) {
  if (!hooks) return {}
  const enabled = (k) =>
    hooks[k] === true || (hooks[k] && typeof hooks[k] === 'object')
  const anyRuntime = RUNTIME.some(enabled)
  const anyImage = IMAGE.some(enabled)
  if (!anyRuntime && !anyImage) return {}
  const timeout = (k) => {
    const h = hooks[k]
    // Use the explicit timeout when provided (including 0) — `||` would treat 0
    // as "unset" and silently substitute the default.
    return h && typeof h === 'object' && h.timeout != null
      ? h.timeout
      : DEFAULT_TIMEOUT[k]
  }
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)
  const img = {}
  for (const k of IMAGE)
    if (enabled(k) || (k === 'ready' && anyRuntime)) {
      img[cap(k)] = 'ENABLED'
      img[`${cap(k)}TimeoutInSeconds`] = timeout(k)
    }
  const rt = {}
  for (const k of RUNTIME)
    if (enabled(k)) {
      rt[cap(k)] = 'ENABLED'
      rt[`${cap(k)}TimeoutInSeconds`] = timeout(k)
    }
  const out = { Port: hooks.port || 9000 }
  if (Object.keys(img).length) out.MicrovmImageHooks = img
  if (Object.keys(rt).length) out.MicrovmHooks = rt
  return out
}

export function compileImage(name, cfg, ctx) {
  const Name = getResourceName(ctx.serviceName, name, ctx.stage)
  return {
    Type: 'AWS::Lambda::MicrovmImage',
    Properties: {
      Name,
      BaseImageArn: ctx.baseImage.arn,
      BaseImageVersion: ctx.baseImage.version,
      BuildRoleArn: ctx.buildRoleArn,
      Description:
        cfg.description ||
        `${ctx.serviceName} ${name} sandbox (Serverless Framework)`,
      CodeArtifact: { Uri: ctx.codeArtifactUri },
      // Exactly one of CloudWatch / Disabled. `observability.logs.enabled: false`
      // turns logging off at the MicroVM level; otherwise logs go to the resolved
      // group (a custom `observability.logs.logGroup` or the default).
      Logging: ctx.loggingDisabled
        ? { Disabled: true }
        : {
            CloudWatch: {
              LogGroup: ctx.logGroupName || `/aws/lambda-microvms/${Name}`,
            },
          },
      EgressNetworkConnectors: ctx.egressConnectors,
      CpuConfigurations: [{ Architecture: 'ARM_64' }],
      Resources: [{ MinimumMemoryInMiB: cfg.memory || 2048 }],
      AdditionalOsCapabilities: (cfg.osCapabilities || []).map((c) =>
        String(c).toUpperCase(),
      ),
      Hooks: compileHooks(cfg.hooks),
      EnvironmentVariables: Object.entries(cfg.environment || {}).map(
        ([Key, Value]) => ({ Key, Value: String(Value) }),
      ),
      // Tags are applied centrally by the orchestrator to every taggable
      // resource the sandbox creates (not just the image).
    },
  }
}
