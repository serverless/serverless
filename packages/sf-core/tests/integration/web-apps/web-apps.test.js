import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import url from 'url'
import { stripVTControlCharacters } from 'util'
import spawnExt from 'child-process-ext/spawn.js'
import JSZip from 'jszip'
import { setGlobalRendererSettings } from '@serverless/util'
import {
  CloudFormationClient,
  DescribeStackResourceCommand,
  DescribeStacksCommand,
} from '@aws-sdk/client-cloudformation'
import {
  CloudWatchLogsClient,
  DescribeLogGroupsCommand,
} from '@aws-sdk/client-cloudwatch-logs'
import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3'
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm'
import { jest } from '@jest/globals'
import { getTestStageName, runSfCore } from '../../utils/runSfCore.js'
import { TEST_REGION } from '../../utils/testRegion.js'

const __dirname = url.fileURLToPath(new URL('.', import.meta.url))

const SERVICE = 'sfc-web-apps'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Runs fn while copying everything written to stdout and stderr, where the
 * CLI prints command output, notices and log lines, and returns that text
 * without colour codes. The output still reaches the test log.
 */
const captureOutput = async (fn) => {
  const chunks = []
  const spies = [process.stdout, process.stderr].map((stream) => {
    const write = stream.write.bind(stream)
    return jest.spyOn(stream, 'write').mockImplementation((chunk, ...rest) => {
      chunks.push(
        typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString(),
      )
      return write(chunk, ...rest)
    })
  })
  try {
    await fn()
  } finally {
    spies.forEach((spy) => spy.mockRestore())
  }
  return stripVTControlCharacters(chunks.join(''))
}

/**
 * GET a web app URL, retrying network errors and 5xx answers, which a fresh
 * endpoint can give while its first environment starts. Any other status is
 * returned as is.
 */
const get = async (target, { attempts = 6 } = {}) => {
  let last
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(target)
      if (response.status < 500) return response
      last = new Error(`HTTP ${response.status} from ${target}`)
    } catch (error) {
      last = error
    }
    await sleep(5000)
  }
  throw last
}

/**
 * The prebuilt app: no bootstrap, so it listens on the host:port Lambda puts
 * in AWS_LAMBDA_HTTP_ENDPOINT itself. The zip is shipped as supplied.
 */
const PREBUILT_SERVER = `import http from 'node:http'

const endpoint = process.env.AWS_LAMBDA_HTTP_ENDPOINT
const separator = endpoint.lastIndexOf(':')

http
  .createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(
      JSON.stringify({
        app: 'prebuilt',
        endpoint,
        port: process.env.PORT ?? null,
      }),
    )
  })
  .listen(Number(endpoint.slice(separator + 1)), endpoint.slice(0, separator))
`

describe('Serverless Framework Service - Web Apps', () => {
  const fixtureDir = path.join(__dirname, 'fixture')
  const configFilePath = path.join(fixtureDir, 'serverless.yml')
  const stage = getTestStageName()
  const stackName = `${SERVICE}-${stage}`
  const originalEnv = process.env

  const cfnClient = new CloudFormationClient({ region: TEST_REGION })
  const logsClient = new CloudWatchLogsClient({ region: TEST_REGION })
  const s3Client = new S3Client({ region: TEST_REGION })
  const ssmClient = new SSMClient({ region: TEST_REGION })

  let urls
  let v1Revision
  let v1Timestamp

  const writeVersion = (version) =>
    writeFile(
      path.join(fixtureDir, 'src', 'version.js'),
      `export const version = '${version}'\n`,
    )

  const run = (command, options = {}, params = {}) =>
    runSfCore({
      coreParams: {
        options: { stage, c: configFilePath, ...options },
        command,
      },
      jest,
      ...params,
    })

  const deploy = async () => {
    const output = await captureOutput(() => run(['deploy']))
    return output
  }

  const stackOutputs = async () => {
    const { Stacks } = await cfnClient.send(
      new DescribeStacksCommand({ StackName: stackName }),
    )
    return Object.fromEntries(
      (Stacks[0].Outputs || []).map((o) => [o.OutputKey, o.OutputValue]),
    )
  }

  const webAppUrls = async () => {
    const outputs = await stackOutputs()
    return {
      api: outputs.ApiWebFunctionUrl,
      admin: outputs.AdminWebFunctionUrl,
      prebuilt: outputs.PrebuiltWebFunctionUrl,
    }
  }

  const apiRevision = async () => {
    const { StackResourceDetail } = await cfnClient.send(
      new DescribeStackResourceCommand({
        StackName: stackName,
        LogicalResourceId: 'ApiWebFunctionRevision',
      }),
    )
    return StackResourceDetail.PhysicalResourceId
  }

  const stackExists = async () => {
    try {
      const { Stacks } = await cfnClient.send(
        new DescribeStacksCommand({ StackName: stackName }),
      )
      return Stacks?.[0]?.StackStatus !== 'DELETE_COMPLETE'
    } catch (error) {
      if (/does not exist/.test(error?.message ?? '')) return false
      throw error
    }
  }

  // The Framework-managed deployment bucket of this Region, and the service's
  // directory in it.
  const deploymentLocation = async () => {
    const { Parameter } = await ssmClient.send(
      new GetParameterCommand({
        Name: '/serverless-framework/deployment/s3-bucket',
      }),
    )
    return {
      bucket: JSON.parse(Parameter.Value).bucketName,
      prefix: `serverless/${SERVICE}/${stage}/`,
    }
  }

  // The timestamps of the deployment directories `rollback` can return to.
  const deploymentTimestamps = async () => {
    const { bucket, prefix } = await deploymentLocation()
    const { CommonPrefixes = [] } = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        Delimiter: '/',
      }),
    )
    return CommonPrefixes.map(
      ({ Prefix }) => /\/(\d+)-[^/]+\/$/.exec(Prefix)?.[1],
    ).filter(Boolean)
  }

  beforeAll(async () => {
    setGlobalRendererSettings({
      isInteractive: false,
      logLevel: 'error',
    })
    process.env = {
      ...originalEnv,
      SERVERLESS_PLATFORM_STAGE: 'dev',
      SERVERLESS_LICENSE_KEY: process.env.SERVERLESS_LICENSE_KEY_DEV,
      SERVERLESS_ACCESS_KEY: undefined,
    }

    await writeVersion('v1')
    const zip = new JSZip()
    zip.file('server.mjs', PREBUILT_SERVER, { date: new Date(0) })
    await mkdir(path.join(fixtureDir, 'prebuilt'), { recursive: true })
    await writeFile(
      path.join(fixtureDir, 'prebuilt', 'app.zip'),
      await zip.generateAsync({ type: 'nodebuffer' }),
    )

    // `install`, not `ci`, as the other fixtures with dependencies. The
    // promise rejects on a non-zero exit, so a failed install stops the suite
    // before anything deploys.
    await spawnExt('npm', ['install'], { cwd: fixtureDir, stdio: 'inherit' })
  }, 600000)

  afterEach(() => {
    jest.restoreAllMocks()
  })

  afterAll(async () => {
    // Safety net: remove the stack when a failed step left it standing, and
    // fail the run when it cannot be removed, so a leak never passes as green.
    jest.restoreAllMocks()
    let failure
    try {
      if (await stackExists()) {
        await run(['remove'], {}, { expectError: true })
        if (await stackExists()) throw new Error('the stack still exists')
      }
    } catch (error) {
      failure = new Error(`Teardown of ${stackName} failed: ${error.message}`)
    }
    await writeVersion('v1')
    process.env = originalEnv
    if (failure) throw failure
  }, 900000)

  test('Deploy: an Express web app without url answers on its endpoint', async () => {
    await deploy()

    urls = await webAppUrls()
    expect(urls.api).toMatch(/^https:\/\//)
    expect(urls.admin).toMatch(/^https:\/\//)
    expect(urls.prebuilt).toMatch(/^https:\/\//)

    const response = await get(`${urls.api}/hello`)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({ app: 'api', version: 'v1', path: '/hello' })
    // The bootstrap maps AWS_LAMBDA_HTTP_ENDPOINT onto PORT.
    expect(body.port).toMatch(/^\d+$/)

    v1Revision = await apiRevision()
    const timestamps = await deploymentTimestamps()
    expect(timestamps).toHaveLength(1)
    v1Timestamp = timestamps[0]
  })

  test('Redeploy unchanged: no changes to deploy', async () => {
    const output = await deploy()
    expect(output).toMatch(/No changes to deploy/)
    expect(await apiRevision()).toBe(v1Revision)
  })

  test('aws_iam: an unsigned request gets 403, invoke --web-app signs it', async () => {
    const unsigned = await get(urls.admin)
    expect(unsigned.status).toBe(403)

    const output = await captureOutput(() =>
      run(['invoke'], { 'web-app': 'admin', path: '/signed' }),
    )
    expect(output).toMatch(/HTTP 200/)
    expect(output).toMatch(/"app":"admin"/)
    expect(output).toMatch(/"path":"\/signed"/)
  })

  test('package.artifact: the prebuilt zip listens on AWS_LAMBDA_HTTP_ENDPOINT', async () => {
    const response = await get(urls.prebuilt)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.app).toBe('prebuilt')
    expect(body.endpoint).toMatch(/^[^:]+:\d+$/)
    // Shipped as supplied: no bootstrap, so no PORT.
    expect(body.port).toBeNull()
  })

  let loggedPath
  test('invoke --web-app --log prints the request log line', async () => {
    // Lines usually arrive in a few seconds; `--log` stops after 30 s without
    // failing, so a slow delivery gets two more requests.
    let output
    for (let attempt = 1; attempt <= 3; attempt++) {
      loggedPath = `/log-${stage}-${attempt}`
      output = await captureOutput(() =>
        run(['invoke'], { 'web-app': 'api', path: loggedPath, log: true }),
      )
      expect(output).toMatch(/HTTP 200/)
      if (output.includes(`api served ${loggedPath} (v1)`)) break
    }
    expect(output).toContain(`api served ${loggedPath} (v1)`)
  }, 300000)

  test('logs --web-app shows the request log line', async () => {
    let output
    for (let attempt = 1; attempt <= 6; attempt++) {
      output = await captureOutput(() => run(['logs'], { 'web-app': 'api' }))
      if (output.includes(`api served ${loggedPath} (v1)`)) break
      await sleep(10000)
    }
    expect(output).toContain(`api served ${loggedPath} (v1)`)
  }, 300000)

  test('Code change: a new revision serves it on the same URL', async () => {
    await writeVersion('v2')
    await deploy()

    expect(await webAppUrls()).toEqual(urls)
    expect(await apiRevision()).not.toBe(v1Revision)

    const response = await get(urls.api)
    expect(response.status).toBe(200)
    expect((await response.json()).version).toBe('v2')
  })

  test('rollback --timestamp serves the previous build', async () => {
    await run(['rollback'], { timestamp: v1Timestamp })

    expect(await webAppUrls()).toEqual(urls)
    const response = await get(urls.api)
    expect(response.status).toBe(200)
    expect((await response.json()).version).toBe('v1')
  })

  test('Remove: no stack, log groups or web app artifacts remain', async () => {
    const { bucket, prefix } = await deploymentLocation()
    await run(['remove'])

    expect(await stackExists()).toBe(false)

    const { logGroups } = await logsClient.send(
      new DescribeLogGroupsCommand({
        logGroupNamePrefix: `/aws/lambda/web/${SERVICE}-${stage}-`,
      }),
    )
    expect(logGroups.map((group) => group.logGroupName)).toEqual([])

    const { Contents = [] } = await s3Client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }),
    )
    expect(Contents.map((object) => object.Key)).toEqual([])
  })
})
