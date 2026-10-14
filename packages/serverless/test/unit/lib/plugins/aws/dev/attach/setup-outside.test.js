import {
  afterAll,
  beforeAll,
  describe,
  expect,
  jest,
  test,
} from '@jest/globals'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  DEFAULT_SETUP_REGION,
  createSetupProvider,
  resolveSetupRegion,
  sdkProfileRegion,
  runDevSetupOutsideService,
  setupRegionLine,
} from '../../../../../../../lib/plugins/aws/dev/attach/setup-outside.js'
import { ACCOUNT, fakeIam, fakeLog, fakeProgress } from './fakes.js'

let savedSuffix
beforeAll(() => {
  savedSuffix = process.env.SLS_DEV_TEST_SUFFIX
  delete process.env.SLS_DEV_TEST_SUFFIX
})
afterAll(() => {
  if (savedSuffix === undefined) delete process.env.SLS_DEV_TEST_SUFFIX
  else process.env.SLS_DEV_TEST_SUFFIX = savedSuffix
})

describe('the region of the selected profile', () => {
  const names = [
    'AWS_CONFIG_FILE',
    'AWS_SHARED_CREDENTIALS_FILE',
    'AWS_REGION',
    'AWS_DEFAULT_REGION',
    'AWS_PROFILE',
  ]
  let saved
  let dir
  beforeAll(() => {
    saved = Object.fromEntries(names.map((name) => [name, process.env[name]]))
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-dev-t-'))
    fs.writeFileSync(
      path.join(dir, 'config'),
      '[default]\nregion = eu-west-1\n\n[profile other]\nregion = ap-south-1\n',
    )
    fs.writeFileSync(path.join(dir, 'credentials'), '')
    for (const name of names) delete process.env[name]
    process.env.AWS_CONFIG_FILE = path.join(dir, 'config')
    process.env.AWS_SHARED_CREDENTIALS_FILE = path.join(dir, 'credentials')
  })
  afterAll(() => {
    for (const name of names) {
      if (saved[name] === undefined) delete process.env[name]
      else process.env[name] = saved[name]
    }
    fs.rmSync(dir, { recursive: true, force: true })
  })

  test('is read from that profile, not the default one', async () => {
    expect(await sdkProfileRegion('other')).toBe('ap-south-1')
    expect(await sdkProfileRegion(undefined)).toBe('eu-west-1')
    expect(
      await resolveSetupRegion({
        options: { 'aws-profile': 'other' },
        env: {},
      }),
    ).toEqual({ region: 'ap-south-1', source: 'profile', profile: 'other' })
  })
})

const noProfile = async () => {
  throw new Error('the profile must not be read')
}
const credentialsError = () =>
  Object.assign(new Error('Could not load credentials from any providers'), {
    name: 'CredentialsProviderError',
  })
const sdk = ({ credentials, account = ACCOUNT } = {}) => ({
  credentialsFor: jest.fn(
    () =>
      credentials ??
      (async () => ({
        accessKeyId: 'AKIAEXAMPLE',
        secretAccessKey: 'secret',
        sessionToken: 'token',
        expiration: new Date(0),
      })),
  ),
  sts: {
    send: jest.fn(async () => ({
      Account: account,
      Arn: `arn:aws:sts::${account}:assumed-role/Admin/root`,
      UserId: 'AROAEXAMPLE:root',
    })),
  },
})

describe('the region dev setup uses outside a service', () => {
  test.each([
    [
      '--region first',
      { region: 'eu-west-1' },
      { AWS_REGION: 'us-west-2' },
      noProfile,
      { region: 'eu-west-1', source: '--region' },
    ],
    [
      '-r as well',
      { r: 'eu-west-1' },
      {},
      noProfile,
      { region: 'eu-west-1', source: '--region' },
    ],
    [
      'then AWS_REGION',
      {},
      { AWS_REGION: 'us-west-2', AWS_DEFAULT_REGION: 'eu-central-1' },
      noProfile,
      { region: 'us-west-2', source: 'AWS_REGION' },
    ],
    [
      'then AWS_DEFAULT_REGION',
      {},
      { AWS_DEFAULT_REGION: 'eu-central-1' },
      noProfile,
      { region: 'eu-central-1', source: 'AWS_DEFAULT_REGION' },
    ],
    [
      'then the region of --aws-profile',
      { 'aws-profile': 'admin' },
      { AWS_PROFILE: 'ops' },
      async (profile) => (profile === 'admin' ? 'ap-south-1' : 'wrong'),
      { region: 'ap-south-1', source: 'profile', profile: 'admin' },
    ],
    [
      'then the region of AWS_PROFILE',
      {},
      { AWS_PROFILE: 'ops' },
      async (profile) => (profile === 'ops' ? 'sa-east-1' : 'wrong'),
      { region: 'sa-east-1', source: 'profile', profile: 'ops' },
    ],
    [
      "then the default profile's region",
      {},
      {},
      async (profile) => (profile === undefined ? 'ca-central-1' : 'wrong'),
      { region: 'ca-central-1', source: 'profile', profile: 'default' },
    ],
    [
      'then us-east-1',
      {},
      {},
      async () => undefined,
      { region: DEFAULT_SETUP_REGION, source: 'default' },
    ],
  ])('%s', async (_name, options, env, profileRegion, expected) => {
    expect(await resolveSetupRegion({ options, env, profileRegion })).toEqual(
      expected,
    )
  })

  test('a profile that cannot be read falls back to us-east-1', async () => {
    expect(
      await resolveSetupRegion({
        options: {},
        env: {},
        profileRegion: async () => {
          throw new Error('Region is missing')
        },
      }),
    ).toEqual({ region: 'us-east-1', source: 'default' })
  })

  test('says where the region came from', () => {
    expect(setupRegionLine({ region: 'eu-west-1', source: '--region' })).toBe(
      'Region eu-west-1, from --region.',
    )
    expect(setupRegionLine({ region: 'us-west-2', source: 'AWS_REGION' })).toBe(
      'Region us-west-2, from AWS_REGION.',
    )
    expect(
      setupRegionLine({ region: 'eu-central-1', source: 'AWS_DEFAULT_REGION' }),
    ).toBe('Region eu-central-1, from AWS_DEFAULT_REGION.')
    expect(
      setupRegionLine({
        region: 'ap-south-1',
        source: 'profile',
        profile: 'admin',
      }),
    ).toBe('Region ap-south-1, from the AWS profile "admin".')
    expect(setupRegionLine({ region: 'us-east-1', source: 'default' })).toBe(
      'Region us-east-1, the default: use --region to set up another region.',
    )
  })
})

describe('the provider dev setup uses outside a service', () => {
  test('reads credentials of the profile and the account from the SDK', async () => {
    const fakes = sdk()
    const provider = createSetupProvider({
      region: 'eu-west-1',
      profile: 'admin',
      sdk: fakes,
    })
    expect(fakes.credentialsFor).toHaveBeenCalledWith('admin')
    expect(provider.getRegion()).toBe('eu-west-1')
    expect(provider.getProfile()).toBe('admin')
    expect(await provider.getCredentials()).toEqual({
      accessKeyId: 'AKIAEXAMPLE',
      secretAccessKey: 'secret',
      sessionToken: 'token',
    })
    expect(await provider.getAccountInfo()).toEqual({
      accountId: ACCOUNT,
      partition: 'aws',
      arn: `arn:aws:sts::${ACCOUNT}:assumed-role/Admin/root`,
      userId: 'AROAEXAMPLE:root',
    })
  })

  test('no credentials anywhere is one clear error', async () => {
    const fakes = sdk({
      credentials: async () => {
        throw credentialsError()
      },
    })
    fakes.sts.send = jest.fn(async () => {
      throw credentialsError()
    })
    const provider = createSetupProvider({
      region: 'eu-west-1',
      sdk: fakes,
      env: {},
    })
    for (const call of [provider.getCredentials, provider.getAccountInfo]) {
      await expect(call()).rejects.toMatchObject({
        code: 'DEV_SETUP_AWS_CREDENTIALS_MISSING',
        message:
          'Dev Mode could not load AWS credentials to set up eu-west-1: not found (Could not load credentials from any providers). To fix it, set AWS_PROFILE or AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY, or run "serverless login aws" in an interactive terminal.',
      })
    }
  })

  test('a profile whose SSO session expired is named, with the sign-in for that profile', async () => {
    const missing = () =>
      Object.assign(new Error('The SSO session has expired or is invalid'), {
        name: 'TokenProviderError',
      })
    const fakes = sdk({
      credentials: async () => {
        throw missing()
      },
    })
    fakes.sts.send = jest.fn(async () => {
      throw missing()
    })
    const provider = createSetupProvider({
      region: 'eu-west-1',
      profile: 'admin',
      sdk: fakes,
    })
    for (const call of [provider.getCredentials, provider.getAccountInfo]) {
      await expect(call()).rejects.toMatchObject({
        code: 'DEV_SETUP_AWS_CREDENTIALS_MISSING',
        message:
          'Dev Mode could not load AWS credentials to set up eu-west-1: the SSO session of profile "admin" has expired (The SSO session has expired or is invalid). To fix it, sign in again with "serverless login aws sso --aws-profile admin" in an interactive terminal.',
      })
    }
  })

  test.each([
    ['expired credentials', 'ExpiredTokenException'],
    ['a denied call', 'AccessDenied'],
  ])(
    '%s are not called missing: the error goes on as it is',
    async (_, name) => {
      const error = Object.assign(new Error(`${name} happened`), { name })
      const fakes = sdk({
        credentials: async () => {
          throw error
        },
      })
      fakes.sts.send = jest.fn(async () => {
        throw error
      })
      const provider = createSetupProvider({ region: 'eu-west-1', sdk: fakes })
      for (const call of [provider.getCredentials, provider.getAccountInfo]) {
        await expect(call()).rejects.toBe(error)
      }
    },
  )
})

describe('dev setup outside a service', () => {
  test('says the region, then runs the same setup as inside a service', async () => {
    const logger = fakeLog()
    const iam = fakeIam()
    await runDevSetupOutsideService({
      options: { region: 'eu-west-1' },
      env: {},
      deps: {
        logger,
        sdk: sdk(),
        setupDeps: { clients: { iam }, logger, progress: fakeProgress() },
      },
    })
    const texts = logger.lines.map((line) => line.text)
    expect(texts[0]).toBe('Region eu-west-1, from --region.')
    expect(texts[1]).toMatch(
      /^Dev Mode is set up in eu-west-1: created IAM role .*serverless-dev-broker-eu-west-1/,
    )
    expect(texts[2]).toBe(
      'Developers can now run "serverless dev" in this account and region without permission to create IAM roles.',
    )
  })

  test('a profile AWS_PROFILE names is the one a credentials error names', async () => {
    const fakes = sdk({
      credentials: async () => {
        throw credentialsError()
      },
    })
    await expect(
      runDevSetupOutsideService({
        options: { region: 'eu-west-1' },
        env: { AWS_PROFILE: 'ops' },
        deps: {
          logger: fakeLog(),
          sdk: fakes,
          setup: ({ provider }) => provider.getCredentials(),
        },
      }),
    ).rejects.toMatchObject({
      code: 'DEV_SETUP_AWS_CREDENTIALS_MISSING',
      message:
        'Dev Mode could not load AWS credentials to set up eu-west-1: profile "ops" has no usable credentials (Could not load credentials from any providers). To fix it, create it with "serverless login aws --aws-profile ops" in an interactive terminal, or name another profile with --aws-profile.',
    })
  })

  test('passes --path and --permissions-boundary through unchanged', async () => {
    const setup = jest.fn(async () => {})
    const options = {
      region: 'eu-west-1',
      path: '/serverless/',
      'permissions-boundary': 'arn:aws:iam::aws:policy/PowerUserAccess',
    }
    await runDevSetupOutsideService({
      options,
      env: {},
      deps: { logger: fakeLog(), sdk: sdk(), setup },
    })
    expect(setup).toHaveBeenCalledWith(expect.objectContaining({ options }))
    expect(setup.mock.calls[0][0].provider.getRegion()).toBe('eu-west-1')
  })
})
