import { createHash } from 'crypto'
import {
  GetLayerVersionCommand,
  ListLayerVersionsCommand,
  PublishLayerVersionCommand,
} from '@aws-sdk/client-lambda'
import { createDevModeClients } from '../../../../../../../lib/plugins/aws/dev/attach/aws.js'
import {
  codeSha256Of,
  ensureLayerVersion,
  findLayerVersion,
  layerDescription,
  publishedByDevMode,
  readLayerArtifact,
} from '../../../../../../../lib/plugins/aws/dev/attach/layer.js'
import { ACCOUNT, artifact, fakeLambda } from './fakes.js'

let savedSuffix
beforeAll(() => {
  savedSuffix = process.env.SLS_DEV_TEST_SUFFIX
  delete process.env.SLS_DEV_TEST_SUFFIX
})
afterAll(() => {
  if (savedSuffix === undefined) delete process.env.SLS_DEV_TEST_SUFFIX
  else process.env.SLS_DEV_TEST_SUFFIX = savedSuffix
})

const published = (lambda) =>
  lambda.calls.filter(([op]) => op === 'publishLayerVersion')

test('publishes once, then reuses the version whose description carries the hash', async () => {
  const lambda = fakeLambda()
  const first = await ensureLayerVersion({
    lambda,
    artifact: artifact('arm64'),
  })
  expect(first).toEqual({
    arn: 'arn:aws:lambda:us-east-1:123456789012:layer:serverless-dev-arm64:1',
    published: true,
  })
  expect(
    await ensureLayerVersion({ lambda, artifact: artifact('arm64') }),
  ).toEqual({
    arn: first.arn,
    published: false,
  })
  expect(published(lambda)).toHaveLength(1)
})

test('publishes the zip bytes for its architecture with the hash in the description', async () => {
  const calls = []
  const lambda = {
    ...fakeLambda(),
    async publishLayerVersion(params) {
      calls.push(params)
      return {
        Version: 1,
        LayerVersionArn: 'arn:x:layer:serverless-dev-x86_64:1',
      }
    },
  }
  const zip = artifact('x86_64', 'abc')
  await ensureLayerVersion({ lambda, artifact: zip })
  expect(calls).toEqual([
    {
      LayerName: 'serverless-dev-x86_64',
      Description: layerDescription('abc'),
      Content: { ZipFile: zip.bytes },
      CompatibleArchitectures: ['x86_64'],
    },
  ])
  expect(layerDescription('abc')).toContain('sha256:abc')
})

test('a different build publishes a new version and keeps the old one', async () => {
  const lambda = fakeLambda()
  await ensureLayerVersion({ lambda, artifact: artifact('x86_64', 'aaa') })
  const second = await ensureLayerVersion({
    lambda,
    artifact: artifact('x86_64', 'bbb'),
  })
  expect(second.arn).toMatch(/:layer:serverless-dev-x86_64:2$/)
  expect(lambda.layers.get('serverless-dev-x86_64')).toHaveLength(2)
})

test('when two versions carry the same hash the newest is used', async () => {
  const lambda = fakeLambda()
  const content = codeSha256Of(artifact('arm64', 'h'))
  lambda.layers.set('serverless-dev-arm64', [
    {
      Version: 4,
      LayerVersionArn: 'arn:x:layer:serverless-dev-arm64:4',
      Description: layerDescription('h'),
      CodeSha256: content,
    },
    {
      Version: 7,
      LayerVersionArn: 'arn:x:layer:serverless-dev-arm64:7',
      Description: layerDescription('h'),
      CodeSha256: content,
    },
    {
      Version: 9,
      LayerVersionArn: 'arn:x:layer:serverless-dev-arm64:9',
      Description: layerDescription('other'),
      CodeSha256: content,
    },
  ])
  expect(
    await findLayerVersion({ lambda, artifact: artifact('arm64', 'h') }),
  ).toBe('arn:x:layer:serverless-dev-arm64:7')
})

test('a version whose description carries the hash but whose content differs is never reused', async () => {
  const lambda = fakeLambda()
  const zip = artifact('arm64', 'h')
  const debug = []
  lambda.layers.set('serverless-dev-arm64', [
    {
      // Published by someone else with a copied description: other code.
      Version: 8,
      LayerVersionArn: 'arn:x:layer:serverless-dev-arm64:8',
      Description: layerDescription('h'),
      CodeSha256: createHash('sha256').update('other code').digest('base64'),
    },
    {
      Version: 5,
      LayerVersionArn: 'arn:x:layer:serverless-dev-arm64:5',
      Description: layerDescription('h'),
      CodeSha256: codeSha256Of(zip),
    },
  ])
  const logger = { debug: (line) => debug.push(line) }
  expect(await findLayerVersion({ lambda, artifact: zip, logger })).toBe(
    'arn:x:layer:serverless-dev-arm64:5',
  )
  expect(debug).toEqual([
    expect.stringContaining('arn:x:layer:serverless-dev-arm64:8'),
  ])
  // With only the forged version there, a new version is published.
  lambda.layers.set(
    'serverless-dev-arm64',
    lambda.layers.get('serverless-dev-arm64').slice(0, 1),
  )
  const ensured = await ensureLayerVersion({ lambda, artifact: zip, logger })
  expect(ensured.published).toBe(true)
  expect(ensured.arn).not.toBe('arn:x:layer:serverless-dev-arm64:8')
  expect(codeSha256Of(zip)).toBe(
    createHash('sha256').update(zip.bytes).digest('base64'),
  )
})

describe('publishedByDevMode', () => {
  const NAME = 'serverless-dev-arm64'
  const arn = (version, name = NAME) =>
    `arn:aws:lambda:us-east-1:${ACCOUNT}:layer:${name}:${version}`
  const withVersions = (versions, name = NAME) => {
    const lambda = fakeLambda()
    lambda.layers.set(
      name,
      versions.map(([Version, Description]) => ({
        Version,
        LayerVersionArn: arn(Version, name),
        Description,
      })),
    )
    return lambda
  }

  test('names the versions, among those asked about, that carry the description Dev Mode publishes with', async () => {
    const lambda = withVersions([
      [3, layerDescription('c'.repeat(64))],
      [2, 'my own layer'],
      [1, layerDescription('a'.repeat(64))],
    ])
    const found = await publishedByDevMode({
      lambda,
      layerArns: [arn(3), arn(2), arn(9)],
    })
    expect([...found]).toEqual([arn(3)])
    // One listing per layer name, however many versions are asked about.
    expect(lambda.calls).toEqual([['listLayerVersions', NAME]])
  })

  test("only the whole description counts: the prefix with anything but a hash is not Dev Mode's", async () => {
    const lambda = withVersions([
      [3, `${layerDescription('c'.repeat(64))} (copy)`],
      [2, 'Serverless Framework Dev Mode layer sha256:not-a-hash'],
      [1, layerDescription('a'.repeat(64))],
    ])
    const found = await publishedByDevMode({
      lambda,
      layerArns: [arn(3), arn(2), arn(1)],
    })
    expect([...found]).toEqual([arn(1)])
  })

  test('asks nothing when there is nothing to ask about', async () => {
    const lambda = withVersions([])
    expect([...(await publishedByDevMode({ lambda, layerArns: [] }))]).toEqual(
      [],
    )
    expect(lambda.calls).toEqual([])
  })

  test('a listing that fails names none, so the function keeps its deployed code', async () => {
    const lines = []
    const lambda = withVersions([[1, layerDescription('a'.repeat(64))]])
    lambda.listLayerVersions = async function* () {
      yield* []
      throw Object.assign(new Error('not authorized'), {
        name: 'AccessDeniedException',
      })
    }
    const found = await publishedByDevMode({
      lambda,
      layerArns: [arn(1)],
      logger: { debug: (text) => lines.push(text) },
    })
    expect([...found]).toEqual([])
    expect(lines).toEqual([
      `Dev Mode could not list the versions of the layer ${NAME} (not authorized): it treats them as layers it did not publish`,
    ])
  })
})

test('findLayerVersion returns null before the first publish', async () => {
  expect(
    await findLayerVersion({
      lambda: fakeLambda(),
      artifact: artifact('arm64'),
    }),
  ).toBeNull()
})

test('a publish retried after a connection reset leaves a duplicate, and the newest one is used', async () => {
  // A reset after Lambda stored the version: the retry publishes the same zip a second time.
  const versions = []
  let resets = 1
  const lambdaSdk = {
    async send(command) {
      if (command instanceof ListLayerVersionsCommand) {
        return { LayerVersions: [...versions].reverse() }
      }
      if (command instanceof PublishLayerVersionCommand) {
        const Version = versions.length + 1
        const version = {
          Version,
          LayerVersionArn: `arn:aws:lambda:us-east-1:${ACCOUNT}:layer:${command.input.LayerName}:${Version}`,
          Description: command.input.Description,
        }
        version.CodeSha256 = createHash('sha256')
          .update(command.input.Content.ZipFile)
          .digest('base64')
        versions.push(version)
        if (resets > 0) {
          resets -= 1
          throw Object.assign(new Error('socket hang up'), {
            code: 'ECONNRESET',
          })
        }
        return version
      }
      if (command instanceof GetLayerVersionCommand) {
        const found = versions.find(
          (item) => item.Version === command.input.VersionNumber,
        )
        return { ...found, Content: { CodeSha256: found.CodeSha256 } }
      }
      throw new Error(`unexpected ${command.constructor.name}`)
    },
  }
  const { lambda } = createDevModeClients({
    region: 'us-east-1',
    sdk: { lambda: lambdaSdk, iam: {}, iot: {} },
    retry: { sleep: async () => {}, random: () => 0 },
  })
  const zip = artifact('arm64', 'dup')

  const first = await ensureLayerVersion({ lambda, artifact: zip })
  expect(first).toEqual({
    arn: `arn:aws:lambda:us-east-1:${ACCOUNT}:layer:serverless-dev-arm64:2`,
    published: true,
  })
  expect(versions).toHaveLength(2)
  expect(await ensureLayerVersion({ lambda, artifact: zip })).toEqual({
    arn: first.arn,
    published: false,
  })
  expect(versions).toHaveLength(2)
})

test('the test suffix keeps test layers apart', async () => {
  process.env.SLS_DEV_TEST_SUFFIX = 'p1abc'
  try {
    const lambda = fakeLambda()
    const { arn } = await ensureLayerVersion({
      lambda,
      artifact: artifact('arm64'),
    })
    expect(arn).toMatch(/:layer:serverless-dev-arm64-p1abc:1$/)
  } finally {
    delete process.env.SLS_DEV_TEST_SUFFIX
  }
})

test('readLayerArtifact hashes the zip it reads', async () => {
  const paths = []
  const read = await readLayerArtifact('arm64', {
    readFile: async (file) => {
      paths.push(file)
      return Buffer.from('abc')
    },
    pathFor: (arch) => `/x/serverless-dev-${arch}.zip`,
  })
  expect(read.sha256).toBe(createHash('sha256').update('abc').digest('hex'))
  expect(read.arch).toBe('arm64')
  expect(read.bytes).toEqual(Buffer.from('abc'))
  expect(paths).toEqual(['/x/serverless-dev-arm64.zip'])
})

const missing = (released) =>
  readLayerArtifact('arm64', {
    readFile: async () => {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    },
    pathFor: () => '/x/serverless-dev-arm64.zip',
    released,
  }).catch((e) => e)

test('a missing zip in a source checkout explains how to build it', async () => {
  const error = await missing(false)
  expect(error.code).toBe('DEV_MODE_LAYER_MISSING')
  expect(error.message).toContain('/x/serverless-dev-arm64.zip')
  expect(error.message).toContain('npm run build:devmode:layer')
  expect(error.message).not.toMatch(/reinstall/i)
})

test('a missing zip in the released CLI says to reinstall it, not to build it', async () => {
  const error = await missing(true)
  expect(error.code).toBe('DEV_MODE_LAYER_MISSING')
  expect(error.message).toContain('/x/serverless-dev-arm64.zip')
  expect(error.message).toMatch(/Reinstall the Serverless Framework/)
  expect(error.message).not.toContain('npm run')
  expect(error.message).not.toContain('source checkout')
})

test('this test run is a source checkout, so the build hint is the default', async () => {
  const error = await readLayerArtifact('arm64', {
    readFile: async () => {
      throw new Error('ENOENT')
    },
    pathFor: () => '/x/serverless-dev-arm64.zip',
  }).catch((e) => e)
  expect(error.message).toContain('npm run build:devmode:layer')
})
