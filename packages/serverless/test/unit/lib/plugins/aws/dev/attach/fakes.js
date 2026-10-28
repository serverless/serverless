import { createHash } from 'crypto'
// In-memory stand-ins for the Dev Mode AWS adapters (lib/plugins/aws/dev/attach/aws.js). They keep
// just enough Lambda behaviour for the attach logic: RevisionId checks, layer versions, listings.
import { EventEmitter } from 'events'
import naming from '../../../../../../../lib/plugins/aws/lib/naming.js'

/** A session id of the form Dev Mode writes, built from a number (`testSessionId(1)`). */
export const testSessionId = (n) => `s_${String(n).padStart(12, '0')}`

export const ACCOUNT = '123456789012'
const clone = (value) => JSON.parse(JSON.stringify(value))

export const fakeLambda = (functions = {}) => {
  const state = new Map(
    Object.entries(functions).map(([name, config]) => [
      name,
      {
        FunctionName: name,
        Runtime: 'nodejs24.x',
        Handler: 'handler.handler',
        PackageType: 'Zip',
        Architectures: ['arm64'],
        Layers: [],
        Environment: { Variables: {} },
        RevisionId: 'r1',
        LastUpdateStatus: 'Successful',
        ...config,
      },
    ]),
  )
  const layers = new Map()
  const calls = []
  let revision = 1
  const lambda = {
    state,
    layers,
    calls,
    // Errors the next updateFunctionConfiguration calls throw, in order.
    updateErrors: [],
    // Runs once before the next update is applied: a teammate or tool changing the function.
    beforeUpdate: null,
    async getFunction(name) {
      calls.push(['getFunction', name])
      return state.has(name) ? clone(state.get(name)) : null
    },
    // The adapter's single-attempt read; goes through getFunction so tests can replace one for both.
    getFunctionOnce: (name) => lambda.getFunction(name),
    async updateFunctionConfiguration(params) {
      calls.push(['updateFunctionConfiguration', clone(params)])
      if (lambda.beforeUpdate) {
        const hook = lambda.beforeUpdate
        lambda.beforeUpdate = null
        hook(params)
      }
      if (lambda.updateErrors.length) throw lambda.updateErrors.shift()
      const current = state.get(params.FunctionName)
      if (params.RevisionId && params.RevisionId !== current.RevisionId) {
        throw Object.assign(
          new Error(
            'The Revision Id provided does not match the latest Revision Id.',
          ),
          { name: 'PreconditionFailedException' },
        )
      }
      revision += 1
      const next = { ...current, RevisionId: `r${revision}` }
      if (params.Layers) next.Layers = params.Layers.map((Arn) => ({ Arn }))
      if (params.Environment) {
        next.Environment = { Variables: { ...params.Environment.Variables } }
      }
      state.set(params.FunctionName, next)
      return clone(next)
    },
    async *listLayerVersions(layerName) {
      calls.push(['listLayerVersions', layerName])
      for (const version of layers.get(layerName) ?? []) yield { ...version }
    },
    async publishLayerVersion(params) {
      calls.push(['publishLayerVersion', params.LayerName])
      const versions = layers.get(params.LayerName) ?? []
      const Version = versions.length + 1
      const published = {
        Version,
        LayerVersionArn: `arn:aws:lambda:us-east-1:${ACCOUNT}:layer:${params.LayerName}:${Version}`,
        Description: params.Description,
        // Lambda's checksum of the content: the zip's SHA-256 in base64.
        CodeSha256: createHash('sha256')
          .update(params.Content.ZipFile)
          .digest('base64'),
      }
      layers.set(params.LayerName, [published, ...versions])
      return published
    },
    async getLayerVersion(layerName, versionNumber) {
      calls.push(['getLayerVersion', layerName, versionNumber])
      const version = (layers.get(layerName) ?? []).find(
        (item) => item.Version === versionNumber,
      )
      return version
        ? {
            Version: version.Version,
            LayerVersionArn: version.LayerVersionArn,
            Content: { CodeSha256: version.CodeSha256 },
          }
        : null
    },
    touch(name, change) {
      revision += 1
      const current = clone(state.get(name))
      state.set(name, {
        ...current,
        ...change(current),
        RevisionId: `r${revision}`,
      })
    },
  }
  return lambda
}

export const artifact = (arch, sha256 = `sha-${arch}`) => ({
  arch,
  bytes: Buffer.from(`zip-${arch}`),
  sha256,
})

export const fakeIam = () => {
  const roles = new Map()
  const policies = new Map()
  const calls = []
  const iam = {
    roles,
    policies,
    calls,
    getRoleError: null,
    createRoleError: null,
    getRolePolicyError: null,
    putRolePolicyError: null,
    updateAssumeRolePolicyError: null,
    async getRole(name) {
      calls.push(['getRole', name])
      if (iam.getRoleError) throw iam.getRoleError
      const role = roles.get(name)
      // IAM returns the trust policy URL-encoded.
      return role
        ? {
            ...role,
            AssumeRolePolicyDocument: encodeURIComponent(
              role.AssumeRolePolicyDocument,
            ),
          }
        : null
    },
    async createRole(params) {
      calls.push(['createRole', params.RoleName])
      if (iam.createRoleError) throw iam.createRoleError
      if (roles.has(params.RoleName)) {
        throw Object.assign(new Error('Role already exists'), {
          name: 'EntityAlreadyExistsException',
        })
      }
      const path = params.Path ?? '/'
      const role = {
        RoleName: params.RoleName,
        Path: path,
        Arn: `arn:aws:iam::${ACCOUNT}:role${path}${params.RoleName}`,
        AssumeRolePolicyDocument: params.AssumeRolePolicyDocument,
        ...(params.PermissionsBoundary && {
          PermissionsBoundary: {
            PermissionsBoundaryArn: params.PermissionsBoundary,
          },
        }),
      }
      roles.set(params.RoleName, role)
      return { ...role }
    },
    // The adapter's answer: the decoded document, or null when the role has no such policy.
    async getRolePolicy(roleName, policyName) {
      calls.push(['getRolePolicy', roleName, policyName])
      if (iam.getRolePolicyError) throw iam.getRolePolicyError
      const policy = policies.get(`${roleName}/${policyName}`)
      return policy ? JSON.stringify(policy) : null
    },
    async putRolePolicy(params) {
      calls.push(['putRolePolicy', params.RoleName, params.PolicyName])
      if (iam.putRolePolicyError) throw iam.putRolePolicyError
      policies.set(
        `${params.RoleName}/${params.PolicyName}`,
        JSON.parse(params.PolicyDocument),
      )
    },
    async updateAssumeRolePolicy(params) {
      calls.push(['updateAssumeRolePolicy', params.RoleName])
      if (iam.updateAssumeRolePolicyError) {
        throw iam.updateAssumeRolePolicyError
      }
      roles.get(params.RoleName).AssumeRolePolicyDocument =
        params.PolicyDocument
    },
    async putRolePermissionsBoundary(params) {
      calls.push([
        'putRolePermissionsBoundary',
        params.RoleName,
        params.PermissionsBoundary,
      ])
      roles.get(params.RoleName).PermissionsBoundary = {
        PermissionsBoundaryArn: params.PermissionsBoundary,
      }
    },
  }
  return iam
}

export const IOT_ENDPOINT = 'abcdefghijklmn-ats.iot.us-east-1.amazonaws.com'
export const fakeIot = (error) => ({
  async describeEndpoint() {
    if (error) throw error
    return IOT_ENDPOINT
  },
})

export const fakeLog = ({ interactive = false } = {}) => {
  const lines = []
  const at =
    (level) =>
    (...args) => {
      lines.push({ level, text: args.join(' ') })
    }
  return {
    lines,
    text: () => lines.map((line) => line.text).join('\n'),
    notice: at('notice'),
    success: at('success'),
    warning: at('warning'),
    error: at('error'),
    debug: at('debug'),
    aside: at('aside'),
    blankLine() {},
    isInteractive: () => interactive,
  }
}

/** The text of a finite command's `human` (a string, or `[level, text]` pairs), one line each. */
export const humanText = (human) =>
  []
    .concat(human ?? [])
    .map((line) => (Array.isArray(line) ? (line[1] ?? '') : String(line)))
    .join('\n')

export const fakeProgress = () => ({
  get: () => ({ notice() {}, remove() {} }),
})

/**
 * A progress fake that keeps every spinner text, in order, in `log.lines` (a `fakeLog`) as
 * `{ level: 'progress', namespace, text }`, so a test reads what the spinner said next to the
 * lines around it; `removed` counts the removals of each namespace.
 */
export const recordingProgress = (log = fakeLog()) => ({
  log,
  removed: new Map(),
  get(namespace) {
    return {
      notice: (text) => log.lines.push({ level: 'progress', namespace, text }),
      remove: () =>
        this.removed.set(namespace, (this.removed.get(namespace) ?? 0) + 1),
    }
  },
  /** The texts the spinner showed (of one namespace, when given). */
  texts: (namespace) =>
    log.lines
      .filter(
        (line) =>
          line.level === 'progress' &&
          (namespace === undefined || line.namespace === namespace),
      )
      .map((line) => line.text),
})

export const fakeProvider = ({
  stage = 'dev',
  region = 'us-east-1',
  callerArn = `arn:aws:sts::${ACCOUNT}:assumed-role/Developer/alice`,
} = {}) => ({
  getStage: () => stage,
  getRegion: () => region,
  getCredentials: async () => ({
    accessKeyId: 'AKIAEXAMPLE',
    secretAccessKey: 'secret',
    sessionToken: 'token',
    accountId: ACCOUNT,
    callerArn,
  }),
  // The real provider asks STS once (memoized) for the caller identity.
  getAccountInfo: async () => ({
    accountId: ACCOUNT,
    partition: callerArn.split(':')[1],
    arn: callerArn,
  }),
  // The provider's naming, for the stack name this fake stage has.
  naming: { ...naming, getStackName: () => `svc-${stage}` },
  // The function's runtime, else the Framework default (these fakes set no provider runtime).
  getRuntime: (runtime) => runtime || 'nodejs20.x',
})

export const fakeServerless = ({ stage = 'dev', functions }) => {
  let all
  const service = {
    service: 'svc',
    getAllFunctions: () => Object.keys(functions),
    getFunction: (key) => ({ name: `svc-${stage}-${key}`, ...functions[key] }),
    // As the Framework's service has them: every function with its events (none by default).
    get functions() {
      all ??= Object.fromEntries(
        Object.keys(functions).map((key) => [
          key,
          { name: `svc-${stage}-${key}`, events: [], ...functions[key] },
        ]),
      )
      return all
    },
  }
  return {
    service,
    // As the httpApi events plugin resolves each httpApi event's method and path.
    httpApiEventsPlugin: {
      resolveConfiguration: () => {
        for (const { events } of Object.values(service.functions)) {
          for (const event of events) {
            if (!event.httpApi) continue
            const [method, path] =
              typeof event.httpApi === 'string'
                ? event.httpApi.split(' ')
                : [event.httpApi.method, event.httpApi.path]
            event.resolvedMethod = String(method).toUpperCase()
            event.resolvedPath = path
          }
        }
      },
    },
    pluginManager: {
      spawned: [],
      async spawn(name) {
        this.spawned.push(name)
      },
    },
  }
}

/**
 * Real timers that remember which handles are still live: a timeout until it fires or is
 * cleared, an interval until it is cleared. Only the session's own timers are counted, so the
 * test runner's timers in the same process never affect the result.
 */
export const countingTimers = () => {
  const live = new Set()
  return {
    live: () => live.size,
    setTimeout(callback, ms) {
      const handle = setTimeout(() => {
        live.delete(handle)
        callback()
      }, ms)
      live.add(handle)
      return handle
    },
    clearTimeout(handle) {
      live.delete(handle)
      clearTimeout(handle)
    },
    setInterval(callback, ms) {
      const handle = setInterval(callback, ms)
      live.add(handle)
      return handle
    },
    clearInterval(handle) {
      live.delete(handle)
      clearInterval(handle)
    },
  }
}

export const fakeProcess = () => {
  const proc = new EventEmitter()
  proc.exits = []
  proc.exit = (code) => proc.exits.push(code)
  const stream = () =>
    Object.assign(new EventEmitter(), {
      written: [],
      write(text) {
        this.written.push(text)
      },
    })
  proc.stdout = stream()
  proc.stderr = stream()
  return proc
}

/**
 * A session record kept in memory: what a session writes to its event log (`records`) and to its
 * session file (`sessionFile.record`, `updates`), with no file and no control endpoint.
 */
export const memoryState = ({
  sessionId = testSessionId(1),
  recorder = null,
} = {}) => {
  const records = []
  const updates = []
  let record = { state: 'starting' }
  const state = {
    claimed: true,
    dir: null,
    records,
    updates,
    recorder,
    released: false,
    closed: false,
    events: {
      // Like the event log: once closed, later records are dropped.
      emit(type, fields = {}) {
        if (!state.closed) records.push({ type, ...fields })
        return { seq: records.length, cursor: `${sessionId}:${records.length}` }
      },
      lastCursor: () =>
        records.length ? `${sessionId}:${records.length}` : null,
      close() {
        state.closed = true
      },
    },
    sessionFile: {
      get record() {
        return record
      },
      update(patch) {
        record = { ...record, ...patch }
        updates.push(patch)
        return true
      },
      release() {
        state.released = true
      },
    },
  }
  return state
}

const webError = (name, message) => Object.assign(new Error(message), { name })

/**
 * The Lambda Web adapter (`clients.lambdaWeb` of attach/aws.js) over in-memory web functions:
 * `fakeLambdaWeb({ 'svc-dev-api': { revisions: { 'rev-cfn': {...} }, endpoints: { main: {...} } } })`.
 * Missing reads are null, deletes report whether something was there, lists are flat. A revision
 * an endpoint serves cannot be deleted (409), as in AWS; with `heldAfterDelete = n`, a deleted
 * endpoint still holds its revisions for the next n revision deletes (AWS deletes endpoints
 * asynchronously: about 1.3 s of 409s). Waiters read the state as it is: a gone resource throws
 * the adapter's not-found error at once, where the real waiters allow it 5 s to appear.
 * `gate(name)` holds the next call of that method before it is applied, `gate(name, { applied:
 * true })` after it is applied but before it returns (a create that landed in AWS and has not
 * answered yet), so a test can act while an attach is half done.
 */
export const fakeLambdaWeb = (functions = {}) => {
  const state = new Map(
    Object.entries(functions).map(
      ([name, { revisions = {}, endpoints = {} }]) => [
        name,
        {
          revisions: new Map(
            Object.entries(revisions).map(([revisionId, revision]) => [
              revisionId,
              { revisionId, state: 'Active', ...clone(revision) },
            ]),
          ),
          endpoints: new Map(
            Object.entries(endpoints).map(([endpointName, endpoint]) => [
              endpointName,
              {
                endpointName,
                domainName: `${endpointName}-${name}.web.test`,
                state: 'Active',
                ...clone(endpoint),
              },
            ]),
          ),
        },
      ],
    ),
  )
  const calls = []
  const gates = new Map()
  let next = 0
  const fn = (name) => {
    const found = state.get(name)
    if (!found) throw webError('ResourceNotFoundException', `${name} not found`)
    return found
  }
  const passGate = async (method) => {
    const gate = gates.get(method)
    if (!gate) return
    gates.delete(method)
    gate.reached()
    await gate.released
  }
  const record = async (method, input) => {
    calls.push([method, clone(input)])
    await passGate(method)
    const failure = lambdaWeb.failures[method]?.shift()
    if (failure) throw failure
  }
  // Endpoints deleted lately, still holding their revisions: name -> { revisionIds, deletes }.
  const deleting = new Map()
  const usedBy = (web, revisionId) => [
    ...[...web.endpoints.values()]
      .filter((endpoint) =>
        endpoint.revisionWeights.some((w) => w.revisionId === revisionId),
      )
      .map((endpoint) => endpoint.endpointName),
    ...[...deleting]
      .filter(([, held]) => held.revisionIds.includes(revisionId))
      .map(([name]) => name),
  ]
  const lambdaWeb = {
    state,
    calls,
    // Errors the next calls of a method throw, in order: `failures.createRevision = [error]`.
    failures: {},
    heldAfterDelete: 0,
    /** Holds the next `method` call; resolves `reached` when it arrives. */
    gate(method, { applied = false } = {}) {
      let release
      let reached
      const gate = {
        released: new Promise((resolve) => (release = resolve)),
        reachedPromise: new Promise((resolve) => (reached = resolve)),
      }
      gate.reached = reached
      gates.set(applied ? `${method}:applied` : method, gate)
      return { reached: gate.reachedPromise, release: () => release() }
    },
    async getEndpoint({ functionName, endpointName }) {
      await record('getEndpoint', { functionName, endpointName })
      const endpoint = state.get(functionName)?.endpoints.get(endpointName)
      return endpoint ? clone(endpoint) : null
    },
    async updateEndpointWeights({ functionName, endpointName, revisionId }) {
      await record('updateEndpointWeights', {
        functionName,
        endpointName,
        revisionId,
      })
      const web = fn(functionName)
      const endpoint = web.endpoints.get(endpointName)
      if (!endpoint) {
        throw webError('ResourceNotFoundException', `${endpointName} not found`)
      }
      if (!web.revisions.has(revisionId)) {
        throw webError('ResourceNotFoundException', `${revisionId} not found`)
      }
      endpoint.revisionWeights = [{ revisionId, weight: 100 }]
      return clone(endpoint)
    },
    async createEndpoint({
      functionName,
      endpointName,
      revisionId,
      authType = 'IamAuth',
    }) {
      await record('createEndpoint', {
        functionName,
        endpointName,
        revisionId,
        authType,
      })
      const web = fn(functionName)
      if (web.endpoints.has(endpointName)) {
        throw webError('ConflictException', `${endpointName} already exists`)
      }
      if (!web.revisions.has(revisionId)) {
        throw webError('ResourceNotFoundException', `${revisionId} not found`)
      }
      const endpoint = {
        endpointName,
        domainName: `${endpointName}-${functionName}.web.test`,
        authType,
        autoDeploymentMode: 'Disabled',
        revisionWeights: [{ revisionId, weight: 100 }],
        state: 'Active',
      }
      web.endpoints.set(endpointName, endpoint)
      return { ...clone(endpoint), state: 'Pending' }
    },
    async deleteEndpoint({ functionName, endpointName }) {
      await record('deleteEndpoint', { functionName, endpointName })
      const endpoint = state.get(functionName)?.endpoints.get(endpointName)
      if (!endpoint) return false
      state.get(functionName).endpoints.delete(endpointName)
      if (lambdaWeb.heldAfterDelete > 0) {
        deleting.set(endpointName, {
          revisionIds: endpoint.revisionWeights.map((w) => w.revisionId),
          deletes: lambdaWeb.heldAfterDelete,
        })
      }
      return true
    },
    async listEndpoints({ functionName }) {
      await record('listEndpoints', { functionName })
      return [...(state.get(functionName)?.endpoints.values() ?? [])].map(clone)
    },
    async getRevision({ functionName, revisionId }) {
      await record('getRevision', { functionName, revisionId })
      const revision = state.get(functionName)?.revisions.get(revisionId)
      return revision ? clone(revision) : null
    },
    // The single-attempt reads of the session's periodic check.
    async getEndpointOnce({ functionName, endpointName }) {
      await record('getEndpointOnce', { functionName, endpointName })
      const endpoint = state.get(functionName)?.endpoints.get(endpointName)
      return endpoint ? clone(endpoint) : null
    },
    async getRevisionOnce({ functionName, revisionId }) {
      await record('getRevisionOnce', { functionName, revisionId })
      const revision = state.get(functionName)?.revisions.get(revisionId)
      return revision ? clone(revision) : null
    },
    async createRevision({
      functionName,
      description,
      kmsKeyArn,
      buildConfig,
      serviceConfig,
    }) {
      await record('createRevision', {
        functionName,
        description,
        kmsKeyArn,
        buildConfig,
        serviceConfig,
      })
      const web = fn(functionName)
      next += 1
      const revision = {
        revisionId: `rev-new${next}`,
        ...(description !== undefined && { description }),
        ...(kmsKeyArn !== undefined && { kmsKeyArn }),
        buildConfig: clone(buildConfig),
        serviceConfig: clone(serviceConfig),
        state: 'Active',
      }
      web.revisions.set(revision.revisionId, revision)
      return { ...clone(revision), state: 'Pending' }
    },
    async deleteRevision({ functionName, revisionId }) {
      await record('deleteRevision', { functionName, revisionId })
      const web = state.get(functionName)
      if (!web?.revisions.has(revisionId)) return false
      const users = usedBy(web, revisionId)
      for (const [name, held] of deleting) {
        held.deletes -= 1
        if (held.deletes <= 0) deleting.delete(name)
      }
      if (users.length) {
        throw webError(
          'ConflictException',
          `The revision ${revisionId} cannot be deleted because the endpoints [${users.join(', ')}] are using it.`,
        )
      }
      return web.revisions.delete(revisionId)
    },
    async listRevisions({ functionName }) {
      await record('listRevisions', { functionName })
      return [...(state.get(functionName)?.revisions.values() ?? [])].map(
        ({ revisionId, description, state: revisionState }) => ({
          revisionId,
          ...(description !== undefined && { description }),
          state: revisionState,
        }),
      )
    },
    async waitRevisionActive({ functionName, revisionId }) {
      await record('waitRevisionActive', { functionName, revisionId })
      const revision = state.get(functionName)?.revisions.get(revisionId)
      if (!revision) {
        throw Object.assign(new Error(`${revisionId} was not found`), {
          code: 'DEV_MODE_REVISION_NOT_FOUND',
        })
      }
      return clone(revision)
    },
    async waitEndpointActive({ functionName, endpointName }) {
      await record('waitEndpointActive', { functionName, endpointName })
      const endpoint = state.get(functionName)?.endpoints.get(endpointName)
      if (!endpoint) {
        throw Object.assign(new Error(`${endpointName} was not found`), {
          code: 'DEV_MODE_ENDPOINT_NOT_FOUND',
        })
      }
      return clone(endpoint)
    },
  }
  // `gate(name, { applied: true })`: the call is applied, its answer waits for the release.
  for (const method of Object.keys(lambdaWeb)) {
    const call = lambdaWeb[method]
    if (typeof call !== 'function' || ['gate'].includes(method)) continue
    lambdaWeb[method] = async (input) => {
      const result = await call(input)
      await passGate(`${method}:applied`)
      return result
    }
  }
  return lambdaWeb
}
