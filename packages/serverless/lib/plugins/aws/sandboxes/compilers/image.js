import { getResourceName } from '../utils/naming.js'

const RUNTIME = ['run', 'resume', 'suspend', 'terminate']
const IMAGE = ['ready', 'validate']

function compileHooks(hooks) {
  if (!hooks) return {}
  const enabled = (k) =>
    hooks[k] === true || (hooks[k] && typeof hooks[k] === 'object')
  const anyRuntime = RUNTIME.some(enabled)
  const anyImage = IMAGE.some(enabled)
  if (!anyRuntime && !anyImage) return {}
  // Only the explicit timeout, when the user set one (including 0). The framework
  // does not impose its own default — an omitted timeout leaves the CloudFormation
  // property unset so the AWS platform default applies.
  const explicitTimeout = (k) => {
    const h = hooks[k]
    return h && typeof h === 'object' && h.timeout != null
      ? h.timeout
      : undefined
  }
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)
  const setHook = (target, k) => {
    target[cap(k)] = 'ENABLED'
    const t = explicitTimeout(k)
    if (t != null) target[`${cap(k)}TimeoutInSeconds`] = t
  }
  const img = {}
  for (const k of IMAGE)
    if (enabled(k) || (k === 'ready' && anyRuntime)) setHook(img, k)
  const rt = {}
  for (const k of RUNTIME) if (enabled(k)) setHook(rt, k)
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
      Resources: [{ MinimumMemoryInMiB: cfg.minimumMemory || 2048 }],
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
