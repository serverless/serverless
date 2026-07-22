import fsp from 'fs/promises'
import path from 'path'
import url from 'url'
import readConfig from '@serverless/framework/lib/configuration/read.js'
import {
  LambdaClient,
  GetFunctionCommand,
  InvokeCommand,
  ListVersionsByFunctionCommand,
} from '@aws-sdk/client-lambda'
import {
  S3Client,
  GetBucketPolicyCommand,
  ListObjectVersionsCommand,
} from '@aws-sdk/client-s3'
import { jest } from '@jest/globals'
import { setGlobalRendererSettings } from '@serverless/util'
import { getTestStageName, runSfCore } from '../../../utils/runSfCore.js'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))

describe('Lambda self-managed code storage (reference mode)', () => {
  const configFileDirPath = path.join(__dirname, 'fixture')
  const handlerFilePath = path.join(configFileDirPath, 'handler.js')
  const lambdaClient = new LambdaClient({ region: 'us-east-1' })
  const s3Client = new S3Client({ region: 'us-east-1' })
  const originalEnv = process.env
  const stage = getTestStageName()
  let service, configFilePath, functionName
  let originalHandlerContent

  // State threaded through the test sequence below.
  let v1ResolvedS3Object
  let v1VersionNumber
  let v2ResolvedS3Object

  const setHandlerBody = (body) =>
    fsp.writeFile(
      handlerFilePath,
      `exports.hello = async () => ({ statusCode: 200, body: '${body}' })\n`,
    )

  beforeAll(async () => {
    setGlobalRendererSettings({
      isInteractive: false,
      logLevel: 'info',
    })
    configFilePath = path.join(configFileDirPath, 'serverless.yml')
    service = await readConfig(configFilePath)
    functionName = `${service.service}-${stage}-hello`
    originalHandlerContent = await fsp.readFile(handlerFilePath, 'utf8')

    process.env = {
      ...originalEnv,
      SERVERLESS_PLATFORM_STAGE: 'dev',
      SERVERLESS_LICENSE_KEY: process.env.SERVERLESS_LICENSE_KEY_DEV,
      SERVERLESS_ACCESS_KEY: undefined,
    }
  })

  afterAll(async () => {
    // Restore the fixture handler so the git tree stays clean regardless of
    // whether the tests above passed or failed.
    await fsp.writeFile(handlerFilePath, originalHandlerContent)
    process.env = originalEnv
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('Deploy', async () => {
    await runSfCore({
      coreParams: {
        options: { stage, c: configFilePath },
        command: ['deploy'],
      },
      jest,
    })
  })

  test('Function runs in reference mode with a pinned object version', async () => {
    const fn = await lambdaClient.send(
      new GetFunctionCommand({ FunctionName: functionName }),
    )

    expect(fn.Code.ResolvedS3Object).toBeDefined()
    expect(fn.Code.ResolvedS3Object.S3ObjectVersion).toBeDefined()
    expect(fn.Code.ResolvedS3Object.S3Bucket).toBeDefined()
    expect(fn.Code.ResolvedS3Object.S3Key).toBeDefined()
    expect(fn.Code.Location).toBeUndefined()

    v1ResolvedS3Object = fn.Code.ResolvedS3Object

    const invoke = await lambdaClient.send(
      new InvokeCommand({ FunctionName: functionName }),
    )
    expect(invoke.StatusCode).toBe(200)
    expect(invoke.FunctionError).toBeUndefined()
  })

  test('Deployment bucket has the Lambda-read policy statement', async () => {
    const bucket = v1ResolvedS3Object.S3Bucket
    const { Policy } = await s3Client.send(
      new GetBucketPolicyCommand({ Bucket: bucket }),
    )
    const policy = JSON.parse(Policy)

    expect(
      policy.Statement.some(
        (statement) =>
          statement.Sid === 'ServerlessLambdaSelfManagedCodeAccess',
      ),
    ).toBe(true)
  })

  test('Redeploy with changed code pins a new version; old published version keeps its pin', async () => {
    // 1. Capture the currently published version number (versionFunctions
    // defaults to true, so the initial deploy already published version "1").
    const before = await lambdaClient.send(
      new ListVersionsByFunctionCommand({ FunctionName: functionName }),
    )
    const publishedBefore = before.Versions.filter(
      (v) => v.Version !== '$LATEST',
    )
    expect(publishedBefore.length).toBe(1)
    v1VersionNumber = publishedBefore[0].Version

    // 2. Change the handler body and redeploy.
    await setHandlerBody('v2')
    await runSfCore({
      coreParams: {
        options: { stage, c: configFilePath },
        command: ['deploy'],
      },
      jest,
    })

    // 3. The unqualified (current) function now resolves to a new S3 object
    // version.
    const fnAfter = await lambdaClient.send(
      new GetFunctionCommand({ FunctionName: functionName }),
    )
    expect(fnAfter.Code.ResolvedS3Object).toBeDefined()
    expect(fnAfter.Code.Location).toBeUndefined()
    expect(fnAfter.Code.ResolvedS3Object.S3ObjectVersion).not.toBe(
      v1ResolvedS3Object.S3ObjectVersion,
    )
    v2ResolvedS3Object = fnAfter.Code.ResolvedS3Object

    // 4. The old published version's code coordinates are untouched by the
    // redeploy — it must still resolve to the original pinned object version.
    const fnAtV1 = await lambdaClient.send(
      new GetFunctionCommand({
        FunctionName: functionName,
        Qualifier: v1VersionNumber,
      }),
    )
    expect(fnAtV1.Code.ResolvedS3Object).toBeDefined()
    expect(fnAtV1.Code.ResolvedS3Object.S3ObjectVersion).toBe(
      v1ResolvedS3Object.S3ObjectVersion,
    )
  })

  test('deploy function -f updates code with Lambda-managed storage', async () => {
    // The CloudFormation-bypassing fast path performs a standard inline code
    // update in every storage mode, which switches the function to
    // Lambda-managed storage until the next full deploy restates the mode.
    await setHandlerBody('v3')
    await runSfCore({
      coreParams: {
        options: { stage, c: configFilePath, function: 'hello' },
        command: ['deploy', 'function'],
      },
      jest,
    })

    const fn = await lambdaClient.send(
      new GetFunctionCommand({ FunctionName: functionName }),
    )
    // $LATEST is now on Lambda-managed storage: no resolved S3 object, and a
    // presigned Code.Location is available again.
    expect(fn.Code.ResolvedS3Object).toBeUndefined()
    expect(fn.Code.Location).toBeDefined()

    // $LATEST runs the updated code.
    const invoke = await lambdaClient.send(
      new InvokeCommand({ FunctionName: functionName }),
    )
    expect(invoke.StatusCode).toBe(200)
    expect(invoke.FunctionError).toBeUndefined()
    const payload = JSON.parse(Buffer.from(invoke.Payload).toString())
    expect(payload.body).toBe('v3')

    // A previously published reference version keeps running from its pinned
    // S3 object, unaffected by the inline update to $LATEST.
    const invokeV1 = await lambdaClient.send(
      new InvokeCommand({
        FunctionName: functionName,
        Qualifier: v1VersionNumber,
      }),
    )
    expect(invokeV1.StatusCode).toBe(200)
    expect(invokeV1.FunctionError).toBeUndefined()
    const payloadV1 = JSON.parse(Buffer.from(invokeV1.Payload).toString())
    expect(payloadV1.body).toBe('v1')
  })

  test('serverless deploy restores reference mode after deploy function', async () => {
    // A full deploy always restates the storage mode. The handler on disk
    // ("v3") differs from the last full deployment ("v2"), so the deploy runs
    // and republishes the function in reference mode.
    await runSfCore({
      coreParams: {
        options: { stage, c: configFilePath },
        command: ['deploy'],
      },
      jest,
    })

    const fn = await lambdaClient.send(
      new GetFunctionCommand({ FunctionName: functionName }),
    )
    expect(fn.Code.ResolvedS3Object).toBeDefined()
    expect(fn.Code.ResolvedS3Object.S3ObjectVersion).toBeDefined()
    expect(fn.Code.Location).toBeUndefined()
    // The restored pin points at an artifact inside a deployment directory,
    // not the fast-path location the earlier code update used.
    expect(fn.Code.ResolvedS3Object.S3Key).toEqual(
      expect.stringContaining(`/${service.service}/${stage}/`),
    )
    expect(fn.Code.ResolvedS3Object.S3Key).not.toContain('/code-artifacts/')
  })

  test('rollback function restores a previous version by coordinates', async () => {
    await runSfCore({
      coreParams: {
        options: {
          stage,
          c: configFilePath,
          function: 'hello',
          'function-version': v1VersionNumber,
        },
        command: ['rollback', 'function'],
      },
      jest,
    })

    const fn = await lambdaClient.send(
      new GetFunctionCommand({ FunctionName: functionName }),
    )
    expect(fn.Code.ResolvedS3Object).toBeDefined()
    expect(fn.Code.ResolvedS3Object.S3ObjectVersion).toBe(
      v1ResolvedS3Object.S3ObjectVersion,
    )
  })

  test('prune --includeArtifacts marks only unpinned deployments', async () => {
    // Set the stage for what "unpinned" means at this point: the rollback
    // above put $LATEST back on the very first deployment's artifact. Three
    // deployment directories now hold live artifacts (the initial deploy, the
    // "v2" redeploy, and the deploy that restored reference mode), and three
    // published versions exist (v1, v2, and v3), all alive.
    //
    // Redeploy once more here so a fresh deployment directory exists and
    // becomes the new "top" pin (via both $LATEST and its published version).
    // Then "prune -n 1" (keep only the newest published version) prunes the
    // published versions behind the earlier directories. The very first
    // directory survives regardless because it also holds the "common" layer's
    // only published version (layers are never re-uploaded once unchanged, so
    // the layer artifact permanently lives in the very first deployment
    // directory). The "v2" directory, by contrast, is left unpinned by
    // anything once its published version is pruned and $LATEST has moved on --
    // exactly the case "includeArtifacts" is meant to sweep.
    await setHandlerBody('v4')
    await runSfCore({
      coreParams: {
        options: { stage, c: configFilePath },
        command: ['deploy'],
      },
      jest,
    })

    const fnAtV4 = await lambdaClient.send(
      new GetFunctionCommand({ FunctionName: functionName }),
    )
    const v4ResolvedS3Object = fnAtV4.Code.ResolvedS3Object
    expect(v4ResolvedS3Object).toBeDefined()

    await runSfCore({
      coreParams: {
        options: {
          stage,
          c: configFilePath,
          number: '1',
          includeLayers: true,
          includeArtifacts: true,
        },
        command: ['prune'],
      },
      jest,
    })

    const bucket = v1ResolvedS3Object.S3Bucket

    const readVersionsAndMarkers = async (key) => {
      const result = await s3Client.send(
        new ListObjectVersionsCommand({ Bucket: bucket, Prefix: key }),
      )
      return {
        versions: (result.Versions || []).filter((v) => v.Key === key),
        deleteMarkers: (result.DeleteMarkers || []).filter(
          (m) => m.Key === key,
        ),
      }
    }

    // The very first deployment directory: kept (it backs the surviving
    // layer version, and it also happens to be what $LATEST currently
    // resolves to after the rollback). No delete marker should appear on it,
    // and its original object version must remain intact.
    const v1State = await readVersionsAndMarkers(v1ResolvedS3Object.S3Key)
    expect(v1State.deleteMarkers.length).toBe(0)
    expect(
      v1State.versions.some(
        (v) => v.VersionId === v1ResolvedS3Object.S3ObjectVersion,
      ),
    ).toBe(true)

    // The "v2" deployment directory: unpinned once "-n 1" prunes its
    // published version away, so it's the one genuinely swept. It should
    // carry a delete marker, but the real object version underneath must
    // still be there -- a delete marker hides the object, it does not
    // destroy any version (no data loss).
    const v2State = await readVersionsAndMarkers(v2ResolvedS3Object.S3Key)
    expect(v2State.deleteMarkers.length).toBeGreaterThan(0)
    expect(
      v2State.versions.some(
        (v) => v.VersionId === v2ResolvedS3Object.S3ObjectVersion,
      ),
    ).toBe(true)

    // The newest ("v4") deployment directory: kept, since it backs both the
    // surviving published version and the current $LATEST.
    const v4State = await readVersionsAndMarkers(v4ResolvedS3Object.S3Key)
    expect(v4State.deleteMarkers.length).toBe(0)
    expect(
      v4State.versions.some(
        (v) => v.VersionId === v4ResolvedS3Object.S3ObjectVersion,
      ),
    ).toBe(true)
  })

  test('Remove', async () => {
    await runSfCore({
      coreParams: {
        options: { stage, c: configFilePath },
        command: ['remove'],
      },
      jest,
    })
  })
})
