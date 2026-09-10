import { jest } from '@jest/globals'
import path from 'path'
import url from 'url'
import { ResolverManager } from '../../../../src/lib/resolvers/manager.js'
import { ServerlessErrorCodes } from '@serverless/util'

/**
 * Cycles that only appear while a value is being expanded.
 *
 * The up-front graph check finds cycles between placeholders that reference
 * each other statically (`${self:...}`). A value that RESOLVES to text
 * containing a placeholder spawns new graph nodes instead, and a chain of
 * such expansions that leads back to itself has no edges for that check to
 * see. Without a guard the manager expands forever.
 *
 * A regression here manifests as a hang, not a failure: the expansion loop is
 * microtask-only, so Jest's own timeout never fires. Run under an external
 * timeout when in doubt.
 *
 * Real registry, real providers, no module mocking.
 */

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))
const fixturesDir = path.join(__dirname, 'fixtures', 'expansion-cycle')

const buildLogger = () => ({
  debug: jest.fn(),
  info: jest.fn(),
  notice: jest.fn(),
  warning: jest.fn(),
  error: jest.fn(),
})

const resolveConfig = async (serviceConfigFile, options = { stage: 'dev' }) => {
  const manager = new ResolverManager(
    buildLogger(),
    serviceConfigFile,
    fixturesDir,
    options,
    null,
    null,
    null,
    false,
    '4.0.0',
    { isComposeConfigFile: false },
  )
  await manager.loadPlaceholders()
  await manager.resolveConfigFile({ printResolvedVariables: false })
  return serviceConfigFile
}

const cyclic = (chainPattern, atPath) =>
  expect.objectContaining({
    code: ServerlessErrorCodes.resolvers.RESOLVER_CYCLIC_REFERENCE,
    message: expect.stringMatching(
      new RegExp(`Cyclic reference found: ${chainPattern} at '${atPath}'`),
    ),
  })

const PARAM = (key) => `\\$\\{param:${key}\\}`

describe('cycles that appear during value expansion', () => {
  afterEach(() => {
    delete process.env.EXPANSION_CYCLE_TEST_FLIPPED
    delete process.env.EXPANSION_CYCLE_TEST_ENV
  })

  test('a parameter that references itself fails with a cyclic-reference error', async () => {
    const config = {
      stages: { default: { params: { WAF: "${param:WAF, ''}" } } },
      custom: { waf: '${param:WAF}' },
    }

    await expect(resolveConfig(config)).rejects.toEqual(
      cyclic(
        "\\$\\{param:WAF, ''\\} -> \\$\\{param:WAF, ''\\}",
        'stages.default.params.WAF',
      ),
    )
  })

  test('two parameters that reference each other fail with the chain named', async () => {
    const config = {
      stages: { default: { params: { A: '${param:B}', B: '${param:A}' } } },
      custom: { a: '${param:A}' },
    }

    await expect(resolveConfig(config)).rejects.toEqual(
      cyclic(
        `${PARAM('[AB]')} -> ${PARAM('[AB]')} -> ${PARAM('[AB]')}`,
        'stages.default.params.[AB]',
      ),
    )
  })

  test('a self-reference through a nested key is compared in substituted form', async () => {
    // On stage "dev" the inner ${sls:stage} makes the key "devName" — the
    // parameter being defined.
    const config = {
      stages: { default: { params: { devName: '${param:${sls:stage}Name}' } } },
      custom: { x: '${param:devName}' },
    }

    await expect(resolveConfig(config)).rejects.toEqual(
      cyclic(
        `${PARAM('devName')} -> ${PARAM('devName')}`,
        'stages.default.params.devName',
      ),
    )
  })

  test('a resolver function answering with its own placeholder is a cycle, not a retry', async () => {
    // The function would answer "done" on a second call, but resolver results
    // are memoized per key for the run, so a repeated text is served from
    // cache and the second call never happens.
    const config = { custom: { b: '${file(flip.mjs):v}' } }

    await expect(resolveConfig(config)).rejects.toEqual(
      cyclic(
        '\\$\\{file\\(flip\\.mjs\\):v\\} -> \\$\\{file\\(flip\\.mjs\\):v\\}',
        'custom.b',
      ),
    )
  })

  test('a chain deeper than the expansion limit fails instead of running unbounded', async () => {
    const params = {}
    for (let i = 1; i <= 60; i++) params[`p${i}`] = `\${param:p${i + 1}}`
    params.p61 = 'end'
    const config = {
      stages: { default: { params } },
      custom: { x: '${param:p1}' },
    }

    await expect(resolveConfig(config)).rejects.toEqual(
      expect.objectContaining({
        code: ServerlessErrorCodes.resolvers.RESOLVER_CYCLIC_REFERENCE,
        message: expect.stringContaining('exceeded 50 nested levels'),
      }),
    )
  })
})

describe('valid expansions keep resolving', () => {
  afterEach(() => {
    delete process.env.EXPANSION_CYCLE_TEST_ENV
  })

  const validParams = () => ({
    chainA: '${param:chainB}',
    chainB: '${param:chainC}',
    chainC: 'c-value',
    twice: '${param:chainC}-${param:chainC}',
    devName: 'dev-name',
    prodName: 'prod-name',
    byStage: '${param:${sls:stage}Name}',
    viaSelf: '${self:custom.plain}',
    viaEnv: '${env:EXPANSION_CYCLE_TEST_ENV}',
    fromFile: '${file(cfg.yml):derived}',
    fileObj: '${file(cfg.yml)}',
    inherit: "${param:inherit, 'default-layer'}",
  })

  const validCustom = () => ({
    plain: 'plain-value',
    a: '${param:chainA}',
    b: '${param:twice}',
    c: '${param:byStage}',
    d: '${param:viaSelf}',
    e: '${param:viaEnv}',
    f: '${param:fromFile}',
    g: '${param:fileObj}',
    h: '${param:inherit}',
    i: '${self:custom.a}/${param:chainB}',
    j: '${file(cfg.yml):viaParam}',
  })

  const expectedCustom = (stageName, inherit) => ({
    plain: 'plain-value',
    a: 'c-value',
    b: 'c-value-c-value',
    c: `${stageName}-name`,
    d: 'plain-value',
    e: 'env-says-c-value',
    f: 'from-file-derived',
    g: {
      base: 'from-file',
      derived: 'from-file-derived',
      viaParam: 'c-value',
      nested: { deep: 'from-file/plain-value' },
    },
    h: inherit,
    i: 'c-value/c-value',
    j: 'c-value',
  })

  test('every dynamic-expansion shape resolves when a stage layer shadows the self-reference', async () => {
    process.env.EXPANSION_CYCLE_TEST_ENV = 'env-says-${param:chainC}'
    const config = {
      stages: {
        default: { params: validParams() },
        prod: { params: { inherit: 'prod-layer' } },
      },
      custom: validCustom(),
    }

    const resolved = await resolveConfig(config, { stage: 'prod' })

    expect(resolved.custom).toEqual(expectedCustom('prod', 'prod-layer'))
  })

  test('every dynamic-expansion shape resolves when a --param shadows the self-reference', async () => {
    process.env.EXPANSION_CYCLE_TEST_ENV = 'env-says-${param:chainC}'
    const config = {
      stages: { default: { params: validParams() } },
      custom: validCustom(),
    }

    const resolved = await resolveConfig(config, {
      stage: 'dev',
      param: ['inherit=cli-layer'],
    })

    expect(resolved.custom).toEqual(expectedCustom('dev', 'cli-layer'))
  })

  test('a long but finite parameter chain resolves', async () => {
    const params = {}
    for (let i = 1; i <= 10; i++) params[`p${i}`] = `\${param:p${i + 1}}`
    params.p11 = 'end'
    const config = {
      stages: { default: { params } },
      custom: { x: '${param:p1}' },
    }

    const resolved = await resolveConfig(config)

    expect(resolved.custom.x).toBe('end')
  })

  test('the correct shape for "Dashboard value or empty" resolves to the fallback', async () => {
    const config = {
      stages: { default: { params: { wafName: "${param:WAF_NAME, ''}" } } },
      provider: {
        environment: {
          WAF: '${param:wafName}',
          WAF_DIRECT: "${param:WAF_NAME, 'none'}",
        },
      },
    }

    const resolved = await resolveConfig(config)

    expect(resolved.provider.environment).toEqual({
      WAF: '',
      WAF_DIRECT: 'none',
    })
  })
})
