import { afterEach, describe, expect, jest, test } from '@jest/globals'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  CREDENTIALS_TTL_MS,
  createCredentialsServer,
} from '../../../../../../../lib/plugins/aws/dev/local/credentials.js'
import { handlerEnvironment } from '../../../../../../../lib/plugins/aws/dev/local/environment.js'
import {
  baseEnv,
  cleanTempDirs,
  hasPythonModule,
  pythonCommand,
  run,
  tempDir,
  write,
} from './helpers.js'

jest.setTimeout(60_000)

// packages/serverless: the AWS SDK resolves from here for the spawned handler processes.
const packageDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../../../..',
)
const FUNCTION_ROLE = {
  accessKeyId: 'ASIAFUNCTIONROLE0001',
  secretAccessKey: 'function-secret',
  sessionToken: 'function-token',
}

let server
afterEach(async () => {
  await server?.close()
  server = null
  cleanTempDirs()
})

const start = async (options) => {
  server = createCredentialsServer(options)
  await server.listen()
  return server
}
const get = (uri, token) =>
  fetch(uri, { headers: token === undefined ? {} : { Authorization: token } })

describe('the credentials endpoint', () => {
  test('serves the registered credentials to the matching token only', async () => {
    await start({ now: () => Date.UTC(2026, 9, 1, 12) })
    const worker = server.register('w1')
    worker.update(FUNCTION_ROLE)
    const ok = await get(worker.uri, worker.token)
    expect(ok.status).toBe(200)
    expect(await ok.json()).toEqual({
      AccessKeyId: FUNCTION_ROLE.accessKeyId,
      SecretAccessKey: FUNCTION_ROLE.secretAccessKey,
      Token: FUNCTION_ROLE.sessionToken,
      Expiration: new Date(
        Date.UTC(2026, 9, 1, 12) + CREDENTIALS_TTL_MS,
      ).toISOString(),
    })
    expect((await get(worker.uri, 'b'.repeat(64))).status).toBe(401)
    expect((await get(worker.uri)).status).toBe(401)
    expect(worker.uri).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/credentials\/w1$/)
    expect(worker.token).toMatch(/^[0-9a-f]{64}$/)
  })

  test('another worker token does not open a worker', async () => {
    await start()
    const one = server.register('w1')
    const two = server.register('w2')
    one.update(FUNCTION_ROLE)
    expect((await get(one.uri, two.token)).status).toBe(401)
  })

  test("answers 503 until the deployed function's credentials arrive, then serves the newest", async () => {
    await start()
    const worker = server.register('w1')
    expect((await get(worker.uri, worker.token)).status).toBe(503)
    worker.update(null)
    expect((await get(worker.uri, worker.token)).status).toBe(503)
    worker.update(FUNCTION_ROLE)
    worker.update({ ...FUNCTION_ROLE, accessKeyId: 'ASIAFUNCTIONROLE0002' })
    expect(
      (await (await get(worker.uri, worker.token)).json()).AccessKeyId,
    ).toBe('ASIAFUNCTIONROLE0002')
  })

  test('unknown workers, other paths and other methods get 404', async () => {
    await start()
    const worker = server.register('w1')
    worker.update(FUNCTION_ROLE)
    expect(
      (await get(worker.uri.replace('/w1', '/w9'), worker.token)).status,
    ).toBe(404)
    expect(
      (
        await fetch(worker.uri, {
          method: 'POST',
          headers: { Authorization: worker.token },
        })
      ).status,
    ).toBe(404)
    expect(
      (await get(worker.uri.replace('/credentials/w1', '/other'), worker.token))
        .status,
    ).toBe(404)
    server.unregister('w1')
    expect((await get(worker.uri, worker.token)).status).toBe(404)
  })

  test('close stops answering', async () => {
    await start()
    const worker = server.register('w1')
    await server.close()
    server = null
    await expect(get(worker.uri, worker.token)).rejects.toThrow()
  })
})

describe('AWS SDKs in a handler process', () => {
  // The developer's shell and home directory carry their own identity in several ways: a named
  // profile, plain keys, a [default] profile, a legacy ~/.boto. A handler must still act as the
  // deployed function's role.
  const handlerEnv = async (extra = () => ({})) => {
    await start()
    const worker = server.register('w1')
    worker.update(FUNCTION_ROLE)
    const home = write(tempDir(), {
      '.aws/credentials':
        '[default]\naws_access_key_id = AKIADEVELOPERDEFAULT\naws_secret_access_key = developer-secret\n[admin]\naws_access_key_id = AKIADEVELOPERADMIN01\naws_secret_access_key = admin-secret\n',
      '.aws/config':
        '[default]\nregion = us-east-1\n[profile admin]\nregion = us-east-1\n',
      '.boto':
        '[Credentials]\naws_access_key_id = AKIADEVELOPERDOTBOTO\naws_secret_access_key = boto-secret\n',
      'boto.cfg':
        '[Credentials]\naws_access_key_id = AKIADEVELOPERBOTOCFG\naws_secret_access_key = boto-secret\n',
      '.ec2/credentials':
        'AWSAccessKeyId=AKIADEVELOPERCREDFILE\nAWSSecretKey=ec2-secret\n',
    })
    const files = write(tempDir(), {
      'aws-config': '',
      'aws-credentials': '',
      'boto-config': '',
    })
    return handlerEnvironment({
      machine: {
        ...baseEnv(),
        HOME: home,
        USERPROFILE: home,
        AWS_PROFILE: 'admin',
        AWS_ACCESS_KEY_ID: 'AKIADEVELOPERSHELL01',
        AWS_SECRET_ACCESS_KEY: 'shell-secret',
        ...extra(home),
      },
      forwarded: {
        AWS_REGION: 'us-east-1',
        AWS_ACCESS_KEY_ID: FUNCTION_ROLE.accessKeyId,
        AWS_SECRET_ACCESS_KEY: FUNCTION_ROLE.secretAccessKey,
        AWS_SESSION_TOKEN: FUNCTION_ROLE.sessionToken,
      },
      credentials: worker,
      configFiles: {
        config: path.join(files, 'aws-config'),
        credentials: path.join(files, 'aws-credentials'),
        boto: path.join(files, 'boto-config'),
      },
      runtimeApi: '127.0.0.1:1/lambda/w1',
      taskRoot: packageDir,
      handler: 'handler.handler',
    }).env
  }

  test("the SDK chain in a handler process resolves the function's credentials, not the developer's profile or keys", async () => {
    const env = await handlerEnv()
    const script = [
      "import { fromNodeProviderChain } from '@aws-sdk/credential-providers'",
      'const resolved = await fromNodeProviderChain()()',
      'process.stdout.write(JSON.stringify({ id: resolved.accessKeyId, token: resolved.sessionToken }))',
    ].join('\n')
    const result = await run(
      process.execPath,
      ['--input-type=module', '-e', script],
      { cwd: packageDir, env },
    )
    expect(result.stderr).toBe('')
    expect(JSON.parse(result.stdout)).toEqual({
      id: FUNCTION_ROLE.accessKeyId,
      token: FUNCTION_ROLE.sessionToken,
    })
  })

  // The JavaScript SDK v2 reads keys prefixed AMAZON_ before the container endpoint, and without
  // AWS_SDK_LOAD_CONFIG it reads ~/.aws/credentials whatever AWS_SHARED_CREDENTIALS_FILE says.
  test.each([
    ['~/.aws/credentials in the home directory', () => ({})],
    [
      'AMAZON_ keys in the shell',
      () => ({
        AMAZON_ACCESS_KEY_ID: 'AKIADEVELOPERAMAZON1',
        AMAZON_SECRET_ACCESS_KEY: 'amazon-secret',
        AMAZON_SESSION_TOKEN: 'amazon-token',
      }),
    ],
  ])(
    "the JavaScript SDK v2 in a handler process resolves the function's credentials despite %s",
    async (_, extra) => {
      const env = {
        ...(await handlerEnv(extra)),
        AWS_SDK_JS_SUPPRESS_MAINTENANCE_MODE_MESSAGE: '1',
      }
      const script = [
        "const AWS = require('aws-sdk')",
        'new AWS.CredentialProviderChain().resolve((error, resolved) => {',
        '  if (error) throw error',
        '  process.stdout.write(JSON.stringify({ id: resolved.accessKeyId, token: resolved.sessionToken }))',
        '})',
      ].join('\n')
      const result = await run(process.execPath, ['-e', script], {
        cwd: packageDir,
        env,
      })
      expect(JSON.parse(result.stdout)).toEqual({
        id: FUNCTION_ROLE.accessKeyId,
        token: FUNCTION_ROLE.sessionToken,
      })
    },
  )

  const withBotocore = hasPythonModule('botocore') ? test : test.skip
  // botocore reads AWS_CREDENTIAL_FILE, BOTO_CONFIG, ~/.boto and /etc/boto.cfg before the
  // container endpoint.
  withBotocore.each([
    ['~/.boto in the home directory', () => ({})],
    [
      'BOTO_CONFIG in the shell',
      (home) => ({ BOTO_CONFIG: path.join(home, 'boto.cfg') }),
    ],
    [
      'AWS_CREDENTIAL_FILE in the shell',
      (home) => ({
        AWS_CREDENTIAL_FILE: path.join(home, '.ec2', 'credentials'),
      }),
    ],
  ])(
    "botocore in a Python handler process resolves the function's credentials despite %s",
    async (_, extra) => {
      const env = await handlerEnv(extra)
      const script = [
        'import json, botocore.session',
        'c = botocore.session.get_session().get_credentials().get_frozen_credentials()',
        'print(json.dumps({"id": c.access_key, "token": c.token}))',
      ].join('\n')
      const result = await run(pythonCommand(), ['-c', script], {
        cwd: packageDir,
        env,
      })
      expect(JSON.parse(result.stdout)).toEqual({
        id: FUNCTION_ROLE.accessKeyId,
        token: FUNCTION_ROLE.sessionToken,
      })
    },
  )
})
