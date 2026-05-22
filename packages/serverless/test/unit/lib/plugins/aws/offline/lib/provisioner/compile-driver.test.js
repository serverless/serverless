import { jest } from '@jest/globals'
import { driveCompile } from '../../../../../../../../lib/plugins/aws/offline/lib/provisioner/compile-driver.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a stub `serverless` object with the given compiled template already
 * set on `service.provider`. Accepts an optional `pluginManager` override.
 */
function makeServerless({
  compiledTemplate = undefined,
  pluginManager = makePluginManager(),
} = {}) {
  return {
    service: {
      provider: {
        compiledCloudFormationTemplate: compiledTemplate,
      },
    },
    pluginManager,
  }
}

/**
 * Creates a minimal stub `pluginManager` whose `runHooks` is a jest spy and
 * whose `hooks` plain-object starts empty.
 *
 * The default `runHooks` implementation is a no-op (does not actually invoke
 * hook functions). Individual tests override it when they need to simulate
 * compile work (e.g., setting `compiledCloudFormationTemplate`).
 */
function makePluginManager({
  runHooks = jest.fn().mockResolvedValue(undefined),
} = {}) {
  return {
    hooks: {},
    runHooks,
  }
}

// ---------------------------------------------------------------------------
// 1. Happy path — template already populated; driveCompile returns it
// ---------------------------------------------------------------------------

describe('driveCompile', () => {
  it('1. returns compiledCloudFormationTemplate when it is already populated by hooks', async () => {
    const template = { Resources: { Q: { Type: 'AWS::SQS::Queue' } } }

    // runHooks no-op: template is pre-set to simulate compile work having run
    const serverless = makeServerless({ compiledTemplate: template })

    const result = await driveCompile(serverless)

    expect(result).toBe(template)
    // Leaves the reference on the service as well
    expect(serverless.service.provider.compiledCloudFormationTemplate).toBe(
      template,
    )
  })

  // -------------------------------------------------------------------------
  // 2. Empty / missing template throws OFFLINE_COMPILE_FAILED
  // -------------------------------------------------------------------------

  it('2a. throws OFFLINE_COMPILE_FAILED when compiledCloudFormationTemplate is undefined', async () => {
    const serverless = makeServerless({ compiledTemplate: undefined })

    await expect(driveCompile(serverless)).rejects.toMatchObject({
      code: 'OFFLINE_COMPILE_FAILED',
    })
  })

  it('2b. throws OFFLINE_COMPILE_FAILED when compiledCloudFormationTemplate is an empty object', async () => {
    const serverless = makeServerless({ compiledTemplate: {} })

    await expect(driveCompile(serverless)).rejects.toMatchObject({
      code: 'OFFLINE_COMPILE_FAILED',
    })
  })

  it('2c. throws OFFLINE_COMPILE_FAILED when compiledCloudFormationTemplate is null', async () => {
    const serverless = makeServerless({ compiledTemplate: null })

    await expect(driveCompile(serverless)).rejects.toMatchObject({
      code: 'OFFLINE_COMPILE_FAILED',
    })
  })

  // -------------------------------------------------------------------------
  // 3. Lifecycle events get invoked via runHooks
  // -------------------------------------------------------------------------

  it('3. invokes runHooks for every curated compile event (primary + before/after variants)', async () => {
    const template = { Resources: { MyFn: { Type: 'AWS::Lambda::Function' } } }
    const calls = []

    const runHooks = jest.fn(async (name) => {
      calls.push(name)
    })

    const serverless = makeServerless({
      compiledTemplate: template,
      pluginManager: makePluginManager({ runHooks }),
    })

    await driveCompile(serverless)

    const expectedPrimaryEvents = [
      'package:initialize',
      'package:setupProviderConfiguration',
      'package:compileLayers',
      // package:compileFunctions and package:compileEvents are intentionally skipped
      // (artifact-dependent; see D-12). They must NOT appear in calls.
      'aws:package:finalize:addExportNameForOutputs',
      'aws:package:finalize:mergeCustomProviderResources',
      'aws:package:finalize:stripNullPropsFromTemplateResources',
    ]

    for (const eventName of expectedPrimaryEvents) {
      // Each primary event results in three runHooks calls: before:, at, after:
      expect(calls).toContain(`before:${eventName}`)
      expect(calls).toContain(eventName)
      expect(calls).toContain(`after:${eventName}`)
    }
  })

  it('3b. passes the correct hooks array from pluginManager.hooks to runHooks', async () => {
    const template = { Resources: { X: { Type: 'AWS::SQS::Queue' } } }

    const sentinelHook = { hook: jest.fn(), pluginName: 'test-plugin' }
    const pluginManager = makePluginManager()
    // Pre-populate one hook to verify it is forwarded (use a curated event, not
    // the skipped compileFunctions — see D-12)
    pluginManager.hooks['package:compileLayers'] = [sentinelHook]

    const runHooksSpy = jest.fn().mockResolvedValue(undefined)
    pluginManager.runHooks = runHooksSpy

    const serverless = makeServerless({
      compiledTemplate: template,
      pluginManager,
    })

    await driveCompile(serverless)

    // Verify the sentinel hook array was passed for the primary event name
    expect(runHooksSpy).toHaveBeenCalledWith('package:compileLayers', [
      sentinelHook,
    ])
  })

  it('3c. does NOT invoke package:compileFunctions or package:compileEvents (artifact-dependent, D-12)', async () => {
    const template = { Resources: { Q: { Type: 'AWS::SQS::Queue' } } }
    const calls = []

    const runHooks = jest.fn(async (name) => {
      calls.push(name)
    })

    const serverless = makeServerless({
      compiledTemplate: template,
      pluginManager: makePluginManager({ runHooks }),
    })

    await driveCompile(serverless)

    const skipped = [
      'package:compileFunctions',
      'before:package:compileFunctions',
      'after:package:compileFunctions',
      'package:compileEvents',
      'before:package:compileEvents',
      'after:package:compileEvents',
    ]

    for (const name of skipped) {
      expect(calls).not.toContain(name)
    }
  })

  // -------------------------------------------------------------------------
  // 4. No deploy-side-effect events are invoked
  // -------------------------------------------------------------------------

  it('4. never invokes any aws:deploy:*, deploy:*, or package:setupProviderConfiguration artifact-upload events', async () => {
    const template = { Resources: { Fn: { Type: 'AWS::Lambda::Function' } } }
    const calls = []

    const runHooks = jest.fn(async (name) => {
      calls.push(name)
    })

    const serverless = makeServerless({
      compiledTemplate: template,
      pluginManager: makePluginManager({ runHooks }),
    })

    await driveCompile(serverless)

    const forbidden = [
      'aws:deploy:deploy',
      'before:deploy:deploy',
      'after:deploy:deploy',
      'aws:deploy:finalize',
      'before:aws:deploy:finalize',
      'package:createDeploymentArtifacts',
      'before:package:createDeploymentArtifacts',
      'aws:package:finalize:saveServiceState',
      'before:aws:package:finalize:saveServiceState',
      'package:cleanup',
      'before:package:cleanup',
      'aws:common:cleanupTempDir',
      'aws:common:moveArtifactsToPackage',
    ]

    for (const name of forbidden) {
      expect(calls).not.toContain(name)
    }
  })

  // -------------------------------------------------------------------------
  // 5. runHooks receives empty array (not undefined) when no hooks registered
  // -------------------------------------------------------------------------

  it('5. passes an empty array to runHooks when no hooks are registered for an event', async () => {
    const template = { Resources: { Q: { Type: 'AWS::SQS::Queue' } } }
    const pluginManager = makePluginManager()
    // hooks object is empty — no plugins registered
    pluginManager.runHooks = jest.fn().mockResolvedValue(undefined)

    const serverless = makeServerless({
      compiledTemplate: template,
      pluginManager,
    })

    await driveCompile(serverless)

    // Every runHooks call should receive an array (possibly empty), never undefined
    for (const [, arr] of pluginManager.runHooks.mock.calls) {
      expect(Array.isArray(arr)).toBe(true)
    }
  })
})
