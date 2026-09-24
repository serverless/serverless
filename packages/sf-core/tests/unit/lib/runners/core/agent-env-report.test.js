import { jest } from '@jest/globals'
import { mkdtemp, readdir, rm, writeFile } from 'fs/promises'
import os, { tmpdir } from 'os'
import path from 'path'
import { getRcFileName } from '@serverless/util'
import {
  detectServerlessAuth,
  detectAwsCredentials,
  otherStageAwsSources,
  renderEnvironmentReport,
} from '../../../../../src/lib/runners/core/agent-env-report.js'

describe('detectServerlessAuth', () => {
  // authenticate() trims these values, so a key of only spaces is no key.
  it('treats an env key or a licenseKey of only spaces as unset', async () => {
    const r = await detectServerlessAuth({
      env: { SERVERLESS_ACCESS_KEY: '  ', SERVERLESS_LICENSE_KEY: ' ' },
      config: { licenseKey: '   ' },
      getRcConfig: async () => null,
    })
    expect(r).toEqual({ state: 'none' })
  })

  it('auth: license key env wins', async () => {
    const r = await detectServerlessAuth({
      env: { SERVERLESS_LICENSE_KEY: 'x' },
      getRcConfig: async () => null,
    })
    expect(r).toEqual({ state: 'env-license' })
  })

  // The authentication flow uses the access key when both are set.
  it('auth: an access key wins over a license key and over the rc store', async () => {
    const r = await detectServerlessAuth({
      env: { SERVERLESS_LICENSE_KEY: 'x', SERVERLESS_ACCESS_KEY: 'y' },
      getRcConfig: async () => {
        throw new Error('rc must not be consulted')
      },
    })
    expect(r).toEqual({ state: 'env-access' })
  })

  it('auth: the alias names the authentication flow accepts, reported by name', async () => {
    const noRc = async () => null
    expect(
      await detectServerlessAuth({
        env: { SERVERLESS_USER_ACCESS_KEY: 'y' },
        getRcConfig: noRc,
      }),
    ).toEqual({ state: 'env-access', variable: 'SERVERLESS_USER_ACCESS_KEY' })
    expect(
      await detectServerlessAuth({
        env: { SERVERLESS_ORG_ACCESS_KEY: 'x' },
        getRcConfig: noRc,
      }),
    ).toEqual({ state: 'env-license', variable: 'SERVERLESS_ORG_ACCESS_KEY' })
    expect(
      await detectServerlessAuth({
        env: {
          SERVERLESS_ORG_ACCESS_KEY: 'x',
          SERVERLESS_USER_ACCESS_KEY: 'y',
        },
        getRcConfig: noRc,
      }),
    ).toEqual({ state: 'env-access', variable: 'SERVERLESS_USER_ACCESS_KEY' })
  })

  it('auth: access key env', async () => {
    const r = await detectServerlessAuth({
      env: { SERVERLESS_ACCESS_KEY: 'y' },
      getRcConfig: async () => null,
    })
    expect(r).toEqual({ state: 'env-access' })
  })

  it('auth: rc-store signed-in user', async () => {
    const rc = {
      userId: 'u1',
      users: {
        u1: { username: 'alex', dashboard: { accessKeys: { myorg: 'k' } } },
      },
    }
    const r = await detectServerlessAuth({
      env: {},
      getRcConfig: async () => rc,
    })
    expect(r).toEqual({ state: 'rc-user', user: 'alex', org: 'myorg' })
  })

  it('auth: prefers the rc store defaultOrgName over the first access key', async () => {
    // Multi-org users are common; `Object.keys(accessKeys)[0]` is insertion
    // order, not the org a deploy would actually target.
    const rc = {
      userId: 'u1',
      users: {
        u1: {
          username: 'alex',
          defaultOrgName: 'second',
          dashboard: { accessKeys: { first: 'k1', second: 'k2' } },
        },
      },
    }
    const r = await detectServerlessAuth({
      env: {},
      getRcConfig: async () => rc,
    })
    expect(r).toEqual({ state: 'rc-user', user: 'alex', org: 'second' })
  })

  it('auth: reports the defaultOrgName even when no access key for it is saved yet', async () => {
    // A command targets the default org and fetches its key on first use, so
    // right after `serverless login` (or `login --org`) the default has no
    // key yet and is still the org a deploy goes to.
    const rc = {
      userId: 'u1',
      users: {
        u1: {
          username: 'alex',
          defaultOrgName: 'new-default',
          dashboard: { accessKeys: { first: 'k1', second: 'k2' } },
        },
      },
    }
    const r = await detectServerlessAuth({
      env: {},
      getRcConfig: async () => rc,
    })
    expect(r).toEqual({ state: 'rc-user', user: 'alex', org: 'new-default' })
  })

  it('auth: with no defaultOrgName, falls back to the first access key', async () => {
    const rc = {
      userId: 'u1',
      users: {
        u1: {
          username: 'alex',
          dashboard: { accessKeys: { first: 'k1', second: 'k2' } },
        },
      },
    }
    const r = await detectServerlessAuth({
      env: {},
      getRcConfig: async () => rc,
    })
    expect(r).toEqual({ state: 'rc-user', user: 'alex', org: 'first' })
  })

  it('auth: rc-store user with no org keys omits the org', async () => {
    const rc = {
      userId: 'u1',
      users: { u1: { username: 'alex', dashboard: {} } },
    }
    const r = await detectServerlessAuth({
      env: {},
      getRcConfig: async () => rc,
    })
    expect(r).toEqual({ state: 'rc-user', user: 'alex' })
  })

  it('auth: falls back to userName, then to "user"', async () => {
    const withUserName = await detectServerlessAuth({
      env: {},
      getRcConfig: async () => ({
        userId: 'u1',
        users: { u1: { userName: 'alex', dashboard: {} } },
      }),
    })
    expect(withUserName).toEqual({ state: 'rc-user', user: 'alex' })

    const anonymous = await detectServerlessAuth({
      env: {},
      getRcConfig: async () => ({
        userId: 'u1',
        users: { u1: { dashboard: {} } },
      }),
    })
    expect(anonymous).toEqual({ state: 'rc-user', user: 'user' })
  })

  // What the interactive prompt saves when the user enters a license key
  // (accessKeys.orgs); the authentication flow uses it after a user session.
  it('auth: a license key saved in the rc store', async () => {
    const saved = (accessKeys) =>
      detectServerlessAuth({
        env: {},
        getRcConfig: async () => ({ accessKeys }),
      })
    expect(await saved({ orgs: { acme: { accessKey: 'k' } } })).toEqual({
      state: 'rc-license',
      org: 'acme',
    })
    expect(
      await saved({
        defaultOrgName: 'beta',
        orgs: { acme: { accessKey: 'k1' }, beta: { accessKey: 'k2' } },
      }),
    ).toEqual({ state: 'rc-license', org: 'beta' })
    expect(
      await saved({
        orgs: { acme: { accessKey: 'k1' }, beta: { accessKey: 'k2' } },
      }),
    ).toEqual({ state: 'rc-license' })
    expect(await saved({ orgs: {} })).toEqual({ state: 'none' })
  })

  // authenticate() takes a user session before any license key, and an env
  // license key before one in serverless.yml.
  it('auth: follows the order sign-in uses', async () => {
    const session = {
      userId: 'u1',
      users: { u1: { username: 'alex', dashboard: {} } },
    }
    const detect = (env, rc, config) =>
      detectServerlessAuth({ env, config, getRcConfig: async () => rc })
    expect(await detect({ SERVERLESS_LICENSE_KEY: 'x' }, session)).toEqual({
      state: 'rc-user',
      user: 'alex',
    })
    expect(
      await detect({}, session, { licenseKey: '${ssm:/license}' }),
    ).toEqual({ state: 'rc-user', user: 'alex' })
    expect(
      await detect({ SERVERLESS_LICENSE_KEY: 'x' }, null, { licenseKey: 'y' }),
    ).toEqual({ state: 'env-license' })
    expect(await detect({}, null, { licenseKey: 'y' })).toEqual({
      state: 'config-license',
    })
    expect(
      await detect(
        {},
        { accessKeys: { orgs: { acme: { accessKey: 'k' } } } },
        { licenseKey: 'y' },
      ),
    ).toEqual({ state: 'config-license' })
    expect(await detect({}, null, { licenseKey: '' })).toEqual({
      state: 'none',
    })
  })

  it('auth: a user session wins over a saved license key', async () => {
    const r = await detectServerlessAuth({
      env: {},
      getRcConfig: async () => ({
        userId: 'u1',
        users: { u1: { username: 'alex', dashboard: {} } },
        accessKeys: { orgs: { acme: { accessKey: 'k' } } },
      }),
    })
    expect(r).toEqual({ state: 'rc-user', user: 'alex' })
  })

  it('auth: rc without a dashboard is not signed in', async () => {
    const r = await detectServerlessAuth({
      env: {},
      getRcConfig: async () => ({ userId: 'u1', users: { u1: {} } }),
    })
    expect(r).toEqual({ state: 'none' })
  })

  it('auth: empty / absent rc is not signed in', async () => {
    expect(
      await detectServerlessAuth({ env: {}, getRcConfig: async () => null }),
    ).toEqual({ state: 'none' })
    expect(
      await detectServerlessAuth({
        env: {},
        getRcConfig: async () => ({ userId: null, users: {} }),
      }),
    ).toEqual({ state: 'none' })
  })

  it('auth: an unreadable rc store degrades to not-signed-in, never throws', async () => {
    const r = await detectServerlessAuth({
      env: {},
      getRcConfig: async () => {
        throw new Error('EACCES')
      },
    })
    expect(r).toEqual({ state: 'none' })
  })

  it('auth: the DEFAULT rc reader never creates a missing rc file', async () => {
    // The obvious getter, util's getRcGlobalConfig, WRITES a fresh default rc
    // when none exists. A detection-only check must leave the disk untouched.
    const fakeHome = await mkdtemp(path.join(tmpdir(), 'rc-home-'))
    const homeSpy = jest.spyOn(os, 'homedir').mockImplementation(() => fakeHome)
    let result, leftBehind
    try {
      // No getRcConfig injected: this exercises the real default reader.
      result = await detectServerlessAuth({ env: {} })
      leftBehind = await readdir(fakeHome)
    } finally {
      homeSpy.mockRestore()
    }
    expect(result).toEqual({ state: 'none' })
    expect(leftBehind).toEqual([])
    await rm(fakeHome, { recursive: true, force: true })
  })

  it('auth: the DEFAULT rc reader reads an existing rc file', async () => {
    const fakeHome = await mkdtemp(path.join(tmpdir(), 'rc-home-'))
    const homeSpy = jest.spyOn(os, 'homedir').mockImplementation(() => fakeHome)
    let result
    try {
      await writeFile(
        path.join(fakeHome, getRcFileName('serverless')),
        JSON.stringify({
          userId: 'u1',
          users: {
            u1: { username: 'alex', dashboard: { accessKeys: { o: 'k' } } },
          },
        }),
      )
      result = await detectServerlessAuth({ env: {} })
    } finally {
      homeSpy.mockRestore()
    }
    expect(result).toEqual({ state: 'rc-user', user: 'alex', org: 'o' })
    await rm(fakeHome, { recursive: true, force: true })
  })

  // authenticate() merges a .serverlessrc in the current directory over the
  // global one; detection has to see the same sign-in, or `login` reports it
  // as a License Key from SSM.
  it('auth: the DEFAULT rc reader sees a .serverlessrc in the current directory', async () => {
    const fakeHome = await mkdtemp(path.join(tmpdir(), 'rc-home-'))
    const cwd = await mkdtemp(path.join(tmpdir(), 'rc-cwd-'))
    const homeSpy = jest.spyOn(os, 'homedir').mockImplementation(() => fakeHome)
    const originalCwd = process.cwd()
    let result, leftBehind
    try {
      await writeFile(
        path.join(cwd, getRcFileName('serverless')),
        JSON.stringify({
          userId: 'u1',
          users: {
            u1: { username: 'local', dashboard: { accessKeys: { o: 'k' } } },
          },
        }),
      )
      process.chdir(cwd)
      result = await detectServerlessAuth({ env: {} })
      leftBehind = await readdir(fakeHome)
    } finally {
      process.chdir(originalCwd)
      homeSpy.mockRestore()
    }
    expect(result).toEqual({ state: 'rc-user', user: 'local', org: 'o' })
    expect(leftBehind).toEqual([])
    await rm(fakeHome, { recursive: true, force: true })
    await rm(cwd, { recursive: true, force: true })
  })

  it('auth: the DEFAULT rc reader leaves an unreadable local .serverlessrc in place', async () => {
    const fakeHome = await mkdtemp(path.join(tmpdir(), 'rc-home-'))
    const cwd = await mkdtemp(path.join(tmpdir(), 'rc-cwd-'))
    const homeSpy = jest.spyOn(os, 'homedir').mockImplementation(() => fakeHome)
    const originalCwd = process.cwd()
    let result, files
    try {
      await writeFile(path.join(cwd, getRcFileName('serverless')), '{not json')
      process.chdir(cwd)
      result = await detectServerlessAuth({ env: {} })
      files = await readdir(cwd)
    } finally {
      process.chdir(originalCwd)
      homeSpy.mockRestore()
    }
    expect(result).toEqual({ state: 'none' })
    // util's getRcLocalConfig would rename it to .bak.
    expect(files).toEqual([getRcFileName('serverless')])
    await rm(fakeHome, { recursive: true, force: true })
    await rm(cwd, { recursive: true, force: true })
  })
})

describe('detectAwsCredentials', () => {
  // The check goes through deploy's own credential provider (getProvider):
  // the same chain, the same profile rule (--aws-profile, else
  // provider.profile) and the same STS account lookup.
  const verified = (accountId = '123456789012', region = 'eu-west-1') =>
    jest.fn(async () => ({
      region,
      resolveCredentials: async () => ({ accountId, region }),
    }))
  const failing = (error) =>
    jest.fn(async () => ({
      region: 'us-east-1',
      resolveCredentials: async () => {
        throw error
      },
    }))
  const serverlessError = (code, message, originalMessage, extra = {}) =>
    Object.assign(new Error(message), {
      code,
      // Same shape as @serverless/util's ServerlessError.
      ...(originalMessage && { originalMessage }),
      ...extra,
    })

  it('env keys, verified: names the account and region', async () => {
    const getProvider = verified()
    const r = await detectAwsCredentials({
      env: { AWS_ACCESS_KEY_ID: 'a', AWS_SECRET_ACCESS_KEY: 'b' },
      getProvider,
    })
    expect(r).toEqual({
      state: 'env',
      check: 'verified',
      account: '123456789012',
      region: 'eu-west-1',
    })
  })

  it('uses the profile a deploy would: --aws-profile, else provider.profile', async () => {
    const getProvider = verified()
    const r = await detectAwsCredentials({
      env: { AWS_PROFILE: 'ignored' },
      config: { provider: { profile: 'prod', region: 'eu-west-1' } },
      options: {},
      getProvider,
    })
    expect(getProvider).toHaveBeenCalledWith(
      expect.objectContaining({ awsProfile: 'prod' }),
    )
    expect(r).toMatchObject({ state: 'profile', profile: 'prod' })

    const cli = verified()
    await detectAwsCredentials({
      env: {},
      config: { provider: { profile: 'prod' } },
      options: { 'aws-profile': 'cli' },
      getProvider: cli,
    })
    expect(cli).toHaveBeenCalledWith(
      expect.objectContaining({ awsProfile: 'cli' }),
    )
  })

  it('a service that deploys through an aws resolver is checked with that resolver', async () => {
    const getProvider = verified('999999999999', 'eu-west-1')
    const credentialResolver = {
      name: 'accountA',
      config: { type: 'aws', profile: 'account-a', region: 'eu-west-1' },
    }
    const r = await detectAwsCredentials({
      env: { AWS_PROFILE: 'ignored' },
      config: { provider: {} },
      options: { 'aws-profile': 'ignored-too' },
      credentialResolver,
      getProvider,
    })
    // Deploy builds its credential resolver from this block; so does the check.
    expect(getProvider).toHaveBeenCalledWith(
      expect.objectContaining({ resolverConfig: credentialResolver.config }),
    )
    expect(r).toEqual({
      state: 'profile',
      profile: 'account-a',
      resolver: 'accountA',
      check: 'verified',
      account: '999999999999',
      region: 'eu-west-1',
    })
  })

  it('an aws resolver with keys in serverless.yml', async () => {
    const r = await detectAwsCredentials({
      env: {},
      credentialResolver: {
        name: 'keys',
        config: { type: 'aws', accessKeyId: 'a', secretAccessKey: 'b' },
      },
      getProvider: verified(),
    })
    expect(r).toMatchObject({
      state: 'resolver-keys',
      resolver: 'keys',
      check: 'verified',
    })
  })

  it('an aws resolver whose settings are variables is not checked', async () => {
    const getProvider = verified()
    const r = await detectAwsCredentials({
      env: {},
      credentialResolver: {
        name: 'accountA',
        config: { type: 'aws', profile: '${env:DEPLOY_PROFILE}' },
      },
      getProvider,
    })
    expect(getProvider).not.toHaveBeenCalled()
    expect(r).toEqual({
      state: 'profile',
      profile: '${env:DEPLOY_PROFILE}',
      resolver: 'accountA',
      check: 'unverified',
      reason: 'variable',
    })
  })

  // A region written as a variable would reach the SDK as literal text and
  // be reported as a network failure; like a variable profile, it is left
  // to "serverless package".
  it('a provider.region written as a variable is not checked', async () => {
    const getProvider = verified()
    const r = await detectAwsCredentials({
      env: { AWS_ACCESS_KEY_ID: 'a', AWS_SECRET_ACCESS_KEY: 'b' },
      config: { provider: { region: "${opt:region, 'eu-west-1'}" } },
      getProvider,
    })
    expect(getProvider).not.toHaveBeenCalled()
    expect(r).toEqual({
      state: 'env',
      check: 'unverified',
      reason: 'variable',
      variableRegion: "${opt:region, 'eu-west-1'}",
    })
  })

  it('--region takes precedence over a variable provider.region, so the check runs', async () => {
    const getProvider = verified('123456789012', 'eu-west-1')
    const r = await detectAwsCredentials({
      env: { AWS_ACCESS_KEY_ID: 'a', AWS_SECRET_ACCESS_KEY: 'b' },
      config: { provider: { region: '${opt:region}' } },
      options: { region: 'eu-west-1' },
      getProvider,
    })
    expect(getProvider).toHaveBeenCalledTimes(1)
    expect(r).toMatchObject({ state: 'env', check: 'verified' })
  })

  it("an aws resolver's own region takes precedence over a variable provider.region", async () => {
    const getProvider = verified()
    const r = await detectAwsCredentials({
      env: {},
      config: { provider: { region: '${opt:region}' } },
      credentialResolver: {
        name: 'accountA',
        config: { type: 'aws', profile: 'account-a', region: 'eu-west-1' },
      },
      getProvider,
    })
    expect(getProvider).toHaveBeenCalledTimes(1)
    expect(r).toMatchObject({ resolver: 'accountA', check: 'verified' })
  })

  it('a resolver with dashboard: false is marked on every result', async () => {
    const r = await detectAwsCredentials({
      env: {},
      credentialResolver: {
        name: 'acct',
        config: { type: 'aws', profile: 'p', dashboard: false },
      },
      getProvider: verified(),
    })
    expect(r).toMatchObject({ check: 'verified', dashboardDisabled: true })
  })

  it('no profile named: AWS_PROFILE, else the default profile', async () => {
    expect(
      await detectAwsCredentials({
        env: { AWS_PROFILE: 'dev' },
        getProvider: verified(),
      }),
    ).toMatchObject({ state: 'profile', profile: 'dev', check: 'verified' })
    expect(
      await detectAwsCredentials({ env: {}, getProvider: verified() }),
    ).toMatchObject({ state: 'profile', profile: 'default' })
  })

  it('AWS rejects the credentials: rejected, quoting AWS', async () => {
    const r = await detectAwsCredentials({
      env: { AWS_ACCESS_KEY_ID: 'a', AWS_SECRET_ACCESS_KEY: 'b' },
      getProvider: failing(
        serverlessError(
          'AWS_ACCOUNT_ID_RESOLUTION_FAILED',
          'Failed to resolve AWS account ID: … The credentials come from …',
          'The security token included in the request is invalid.',
          { credentialsRejected: true },
        ),
      ),
    })
    expect(r).toEqual({
      state: 'env',
      check: 'rejected',
      reason: 'The security token included in the request is invalid.',
    })
  })

  it('the lookup never reaches AWS: unverified, naming the network error', async () => {
    const r = await detectAwsCredentials({
      env: { AWS_ACCESS_KEY_ID: 'a', AWS_SECRET_ACCESS_KEY: 'b' },
      getProvider: failing(
        serverlessError(
          'AWS_ACCOUNT_ID_RESOLUTION_FAILED',
          'Failed to resolve AWS account ID: connect ECONNREFUSED 127.0.0.1:9',
          'connect ECONNREFUSED 127.0.0.1:9',
          { credentialsRejected: false },
        ),
      ),
    })
    expect(r).toEqual({
      state: 'env',
      check: 'unverified',
      reason: 'network',
      detail: 'connect ECONNREFUSED 127.0.0.1:9',
    })
    expect(
      renderEnvironmentReport({
        auth: { state: 'none' },
        aws: r,
        service: { present: true },
      })[2],
    ).toBe(
      'aws credentials: environment variables — not verified: could not reach AWS (connect ECONNREFUSED 127.0.0.1:9); check the network or proxy, then re-run "serverless agent setup"',
    )
  })

  it('no credentials anywhere maps to none', async () => {
    const r = await detectAwsCredentials({
      env: {},
      getProvider: failing(
        serverlessError(
          'AWS_CREDENTIALS_MISSING',
          'AWS credentials missing or invalid.',
          'Could not load credentials from any providers',
        ),
      ),
    })
    expect(r).toEqual({ state: 'none' })
  })

  it('a profile the service names but that has no credentials is reported by name', async () => {
    const r = await detectAwsCredentials({
      env: {},
      config: { provider: { profile: 'no-such-profile' } },
      getProvider: failing(
        serverlessError(
          'AWS_CREDENTIALS_MISSING',
          'AWS credentials missing or invalid.',
          'Could not resolve credentials using profile: [no-such-profile] in configuration/credentials file(s).',
        ),
      ),
    })
    expect(r).toEqual({ state: 'none', profile: 'no-such-profile' })
  })

  // The resolver is what names the profile, and --aws-profile does not
  // override it: the report names both, so the fix points at serverless.yml.
  it('an aws resolver whose profile has no credentials is reported with the resolver', async () => {
    const r = await detectAwsCredentials({
      env: {},
      credentialResolver: {
        name: 'aws-account',
        config: { type: 'aws', profile: 'staging-account' },
      },
      getProvider: failing(
        serverlessError(
          'AWS_CREDENTIALS_MISSING',
          'AWS credentials missing or invalid.',
          'Could not resolve credentials using profile: [staging-account] in configuration/credentials file(s).',
        ),
      ),
    })
    expect(r).toEqual({
      state: 'none',
      profile: 'staging-account',
      resolver: 'aws-account',
    })
  })

  it('an expired SSO session maps to sso-expired', async () => {
    const r = await detectAwsCredentials({
      env: { AWS_PROFILE: 'dev' },
      getProvider: failing(
        serverlessError(
          'AWS_CREDENTIALS_MISSING',
          'AWS credentials missing or invalid.',
          'The SSO session associated with this profile has expired or is otherwise invalid.',
        ),
      ),
    })
    // The profile is named so the sign-in command can target it.
    expect(r).toEqual({ state: 'sso-expired', profile: 'dev' })
  })

  it('an expired SSO session behind an aws resolver names both', async () => {
    const r = await detectAwsCredentials({
      env: {},
      credentialResolver: {
        name: 'aws-account',
        config: { type: 'aws', profile: 'staging-account' },
      },
      getProvider: failing(
        serverlessError(
          'AWS_CREDENTIALS_MISSING',
          'AWS credentials missing or invalid.',
          "Token is expired. To refresh this SSO session run 'aws sso login' with the corresponding profile.",
        ),
      ),
    })
    expect(r).toEqual({
      state: 'sso-expired',
      profile: 'staging-account',
      resolver: 'aws-account',
    })
  })

  it('a resolver that sets dashboard: false is marked, so no Dashboard provider is offered', async () => {
    const missing = () =>
      failing(
        serverlessError(
          'AWS_CREDENTIALS_MISSING',
          'AWS credentials missing or invalid.',
        ),
      )
    const check = (config) =>
      detectAwsCredentials({
        env: {},
        credentialResolver: { name: 'acct', config },
        getProvider: missing(),
      })
    expect(
      await check({ type: 'aws', profile: 'p', dashboard: false }),
    ).toEqual({
      state: 'none',
      profile: 'p',
      resolver: 'acct',
      dashboardDisabled: true,
    })
    expect(await check({ type: 'aws', profile: 'p' })).toEqual({
      state: 'none',
      profile: 'p',
      resolver: 'acct',
    })
  })

  it('expired temporary env keys are rejected, not reported as an SSO problem', async () => {
    const r = await detectAwsCredentials({
      env: { AWS_ACCESS_KEY_ID: 'a', AWS_SECRET_ACCESS_KEY: 'b' },
      getProvider: failing(
        serverlessError(
          'AWS_CREDENTIALS_EXPIRED',
          'AWS credentials appear to have expired. … Original error from AWS: "The security token included in the request is expired"',
        ),
      ),
    })
    expect(r).toMatchObject({ state: 'env', check: 'rejected' })
    expect(r.reason).toContain('expired')
  })

  it('a profile given as a variable is not checked (agent setup resolves no variables)', async () => {
    const getProvider = verified()
    const r = await detectAwsCredentials({
      env: {},
      config: { provider: { profile: '${param:awsProfile}' } },
      getProvider,
    })
    expect(getProvider).not.toHaveBeenCalled()
    expect(r).toEqual({
      state: 'profile',
      profile: '${param:awsProfile}',
      check: 'unverified',
      reason: 'variable',
    })
  })

  it('AWS not answering in time: unverified, never stalls the command', async () => {
    const r = await detectAwsCredentials({
      env: { AWS_PROFILE: 'dev' },
      getProvider: () => new Promise(() => {}),
      timeoutMs: 5,
    })
    expect(r).toEqual({
      state: 'profile',
      profile: 'dev',
      check: 'unverified',
      reason: 'timeout',
    })
  })

  it('never rejects out of the detector', async () => {
    const r = await detectAwsCredentials({
      env: {},
      getProvider: () => {
        throw new Error('sync boom')
      },
    })
    expect(r).toMatchObject({ state: 'profile', check: 'rejected' })
  })
})

describe('renderEnvironmentReport', () => {
  const render = (auth, aws, service = { present: true }) =>
    renderEnvironmentReport({ auth, aws, service })

  it('renders the exact not-signed-in line', () => {
    const lines = renderEnvironmentReport({
      auth: { state: 'none' },
      aws: { state: 'profile', profile: 'default' },
      service: { present: true },
    })
    expect(lines).toContain(
      'auth: not signed in — if the user is at the keyboard, run "serverless login" (without a terminal it prints a sign-in URL for them to open and waits up to 10 minutes); for unattended runs, set SERVERLESS_ACCESS_KEY (create one at https://app.serverless.com/settings/accessKeys) or SERVERLESS_LICENSE_KEY (create one at https://app.serverless.com/settings/licenseKeys)',
    )
    expect(lines).toContain('aws credentials: profile "default"')
    expect(lines).toContain('service: serverless.yml found')
  })

  it('renders the exact service-absent line', () => {
    const lines = render(
      { state: 'none' },
      { state: 'none' },
      { present: false },
    )
    expect(lines[0]).toBe(
      'service: no serverless.yml in this directory — create one (see the serverless-framework skill), then run "serverless agent setup" again there to install the project skills; or run "serverless" in an interactive terminal to scaffold a project',
    )
  })

  it('renders the exact compose service line for both extensions', () => {
    for (const configFileName of [
      'serverless-compose.yml',
      'serverless-compose.yaml',
    ]) {
      const lines = render(
        { state: 'none' },
        { state: 'none' },
        {
          present: true,
          configFileName,
        },
      )
      expect(lines[0]).toBe(`service: ${configFileName} found`)
    }
  })

  it('names the service config file that was found', () => {
    for (const configFileName of [
      'serverless.yml',
      'serverless.yaml',
      'serverless.ts',
      'serverless.js',
      'serverless.json',
    ]) {
      const lines = render(
        { state: 'none' },
        { state: 'none' },
        {
          present: true,
          configFileName,
        },
      )
      expect(lines[0]).toBe(`service: ${configFileName} found`)
    }
  })

  it('falls back to the serverless.yml line without a config file name', () => {
    for (const configFileName of [undefined, '']) {
      const lines = render(
        { state: 'none' },
        { state: 'none' },
        {
          present: true,
          configFileName,
        },
      )
      expect(lines[0]).toBe('service: serverless.yml found')
    }
  })

  it('renders names that are also Object keys as plain text', () => {
    // No lookup through Object.prototype: "constructor" must not render as a
    // function or crash the report.
    for (const configFileName of ['constructor', 'toString', '__proto__']) {
      const lines = render(
        { state: 'none' },
        { state: 'none' },
        {
          present: true,
          configFileName,
        },
      )
      expect(lines[0]).toBe(`service: ${configFileName} found`)
    }
  })

  it('renders the exact env-license auth line', () => {
    expect(render({ state: 'env-license' }, { state: 'env' })[1]).toBe(
      'auth: using SERVERLESS_LICENSE_KEY from the environment',
    )
  })

  it('names the alias an env key was read from', () => {
    expect(
      render(
        { state: 'env-access', variable: 'SERVERLESS_USER_ACCESS_KEY' },
        { state: 'env' },
      )[1],
    ).toBe('auth: using SERVERLESS_USER_ACCESS_KEY from the environment')
    expect(
      render(
        { state: 'env-license', variable: 'SERVERLESS_ORG_ACCESS_KEY' },
        { state: 'env' },
      )[1],
    ).toBe('auth: using SERVERLESS_ORG_ACCESS_KEY from the environment')
  })

  it('renders the serverless.yml license key auth line', () => {
    expect(render({ state: 'config-license' }, { state: 'env' })[1]).toBe(
      'auth: using the License Key in serverless.yml',
    )
  })

  it('renders the saved license key auth line', () => {
    expect(
      render({ state: 'rc-license', org: 'acme' }, { state: 'env' })[1],
    ).toBe('auth: using a License Key saved on this machine (org "acme")')
    expect(render({ state: 'rc-license' }, { state: 'env' })[1]).toBe(
      'auth: using a License Key saved on this machine',
    )
  })

  it('renders the exact env-access auth line', () => {
    expect(render({ state: 'env-access' }, { state: 'env' })[1]).toBe(
      'auth: using SERVERLESS_ACCESS_KEY from the environment',
    )
  })

  it('renders the exact rc-user auth line with an org', () => {
    expect(
      render(
        { state: 'rc-user', user: 'alex', org: 'myorg' },
        { state: 'env' },
      )[1],
    ).toBe('auth: signed in as alex (org "myorg")')
  })

  it('renders the exact rc-user auth line without an org', () => {
    expect(
      render({ state: 'rc-user', user: 'alex' }, { state: 'env' })[1],
    ).toBe('auth: signed in as alex')
  })

  it('renders the exact aws env line', () => {
    expect(render({ state: 'none' }, { state: 'env' })[2]).toBe(
      'aws credentials: environment variables',
    )
  })

  it('renders the exact aws profile line', () => {
    expect(
      render({ state: 'none' }, { state: 'profile', profile: 'dev' })[2],
    ).toBe('aws credentials: profile "dev"')
  })

  it('renders the sso-expired line with the profile and resolver to sign in again', () => {
    expect(
      render(
        { state: 'none' },
        {
          state: 'sso-expired',
          profile: 'staging-account',
          resolver: 'aws-account',
        },
      )[2],
    ).toBe(
      'aws credentials: the SSO session of profile "staging-account", which resolver "aws-account" uses, has expired — sign in again with "serverless login aws sso --aws-profile staging-account" in an interactive terminal',
    )
  })

  it('renders the exact aws sso-expired line', () => {
    expect(render({ state: 'none' }, { state: 'sso-expired' })[2]).toBe(
      'aws credentials: the SSO session has expired — sign in again with "serverless login aws sso" in an interactive terminal',
    )
  })

  it('renders the exact aws not-found line', () => {
    expect(render({ state: 'none' }, { state: 'none' })[2]).toBe(
      'aws credentials: not found — set AWS_PROFILE or AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY, or run "serverless login aws" in an interactive terminal',
    )
  })

  it('a verified source names the account and region', () => {
    expect(
      render(
        { state: 'none' },
        {
          state: 'profile',
          profile: 'prod',
          check: 'verified',
          account: '123456789012',
          region: 'eu-west-1',
        },
      )[2],
    ).toBe(
      'aws credentials: profile "prod" — account 123456789012, region eu-west-1',
    )
  })

  it('rejected credentials quote AWS and carry the same fix as the deploy error', () => {
    expect(
      render(
        { state: 'none' },
        {
          state: 'env',
          check: 'rejected',
          reason: 'The security token included in the request is invalid.',
        },
      )[2],
    ).toBe(
      'aws credentials: environment variables — rejected by AWS: The security token included in the request is invalid. Fix: the credentials come from AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY in the environment, which take priority over any profile: replace them, or unset them to use a profile',
    )
  })

  it('unverified: says why and how to check', () => {
    expect(
      render(
        { state: 'none' },
        {
          state: 'profile',
          profile: 'dev',
          check: 'unverified',
          reason: 'timeout',
        },
      )[2],
    ).toBe(
      'aws credentials: profile "dev" — not verified: no answer from AWS within 15 s (the network, not the credentials); re-run "serverless agent setup", or "serverless package" checks them',
    )
    expect(
      render(
        { state: 'none' },
        {
          state: 'profile',
          profile: '${param:awsProfile}',
          check: 'unverified',
          reason: 'variable',
        },
      )[2],
    ).toBe(
      'aws credentials: profile set by a variable in serverless.yml (${param:awsProfile}) — not checked here; "serverless package" checks it',
    )
    expect(
      render(
        { state: 'none' },
        {
          state: 'env',
          check: 'unverified',
          reason: 'variable',
          variableRegion: "${opt:region, 'eu-west-1'}",
        },
      )[2],
    ).toBe(
      'aws credentials: environment variables; region set by a variable in serverless.yml (${opt:region, \'eu-west-1\'}) — not checked here; "serverless package" checks it',
    )
  })

  it('names the aws resolver a deploy uses', () => {
    expect(
      render(
        { state: 'none' },
        {
          state: 'profile',
          profile: 'account-a',
          resolver: 'accountA',
          check: 'verified',
          account: '999999999999',
          region: 'eu-west-1',
        },
      )[2],
    ).toBe(
      'aws credentials: resolver "accountA", profile "account-a" — account 999999999999, region eu-west-1',
    )
    expect(
      render(
        { state: 'none' },
        {
          state: 'resolver-keys',
          resolver: 'keys',
          check: 'rejected',
          reason: 'The security token included in the request is invalid.',
        },
      )[2],
    ).toBe(
      'aws credentials: resolver "keys", keys in serverless.yml — rejected by AWS: The security token included in the request is invalid. Fix: the credentials come from accessKeyId/secretAccessKey in the aws resolver configuration in serverless.yml: update them',
    )
    expect(
      render(
        { state: 'none' },
        {
          state: 'profile',
          profile: '${env:DEPLOY_PROFILE}',
          resolver: 'accountA',
          check: 'unverified',
          reason: 'variable',
        },
      )[2],
    ).toBe(
      'aws credentials: resolver "accountA" is set with a variable in serverless.yml — not checked here; "serverless package" checks it',
    )
  })

  it('a named profile without credentials: names it and how to create it', () => {
    expect(
      render(
        { state: 'none' },
        { state: 'none', profile: 'no-such-profile' },
      )[2],
    ).toBe(
      'aws credentials: profile "no-such-profile" has no usable credentials — create it with "serverless login aws --aws-profile no-such-profile" in an interactive terminal, or name another profile in provider.profile or with --aws-profile',
    )
  })

  it('a resolver profile without credentials: names the resolver, and never suggests provider.profile', () => {
    const line = render(
      { state: 'rc-user', user: 'alex' },
      { state: 'none', profile: 'staging-account', resolver: 'aws-account' },
    )[2]
    expect(line).toBe(
      'aws credentials: resolver "aws-account" uses profile "staging-account", which has no usable credentials — create it with "serverless login aws --aws-profile staging-account" in an interactive terminal, or change the profile of resolver "aws-account" in serverless.yml; if the org has a Serverless Dashboard Provider, deploys use that instead',
    )
    expect(line).not.toMatch(/provider\.profile|--aws-profile [^s]/)
  })

  it('rejected credentials from a resolver profile: the fix changes the resolver, not --aws-profile', () => {
    const line = render(
      { state: 'none' },
      {
        state: 'profile',
        profile: 'staging-account',
        resolver: 'aws-account',
        check: 'rejected',
        reason: 'The security token included in the request is invalid.',
      },
    )[2]
    expect(line).toContain('set by resolver "aws-account" in serverless.yml')
    expect(line).toContain('change the profile of resolver "aws-account"')
    expect(line).not.toContain('choose another profile with --aws-profile')
  })

  it('not found while signed in: points at Dashboard AWS providers too', () => {
    expect(
      render({ state: 'rc-user', user: 'alex' }, { state: 'none' })[2],
    ).toBe(
      'aws credentials: not found — set AWS_PROFILE or AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY, or run "serverless login aws" in an interactive terminal; if the org has a Serverless Dashboard Provider, deploys use that instead',
    )
  })

  // Deploy takes the Dashboard provider before a resolver's profile or keys,
  // unless the resolver sets dashboard: false; a license key gets no provider.
  it('the Dashboard hint follows where deploy can use a Dashboard provider', () => {
    const HINT =
      '; if the org has a Serverless Dashboard Provider, deploys use that instead'
    const line = (auth, aws) => render(auth, aws)[2]
    const user = { state: 'rc-user', user: 'alex' }
    expect(line(user, { state: 'none', resolver: 'acct' })).toContain(HINT)
    expect(line(user, { state: 'none', profile: 'missing' })).toContain(HINT)
    expect(line({ state: 'env-access' }, { state: 'none' })).toContain(HINT)
    expect(
      line(user, { state: 'none', resolver: 'acct', dashboardDisabled: true }),
    ).not.toContain(HINT)
    expect(line({ state: 'env-license' }, { state: 'none' })).not.toContain(
      HINT,
    )
    expect(line({ state: 'none' }, { state: 'none' })).not.toContain(HINT)
  })

  // A verified local account is not the one a deploy uses when the org has a
  // Dashboard Provider, so a successful check carries the same hint.
  it('a verified local check carries the Dashboard hint where a Provider can apply', () => {
    const HINT =
      '; if the org has a Serverless Dashboard Provider, deploys use that instead'
    const ok = {
      state: 'profile',
      profile: 'dev',
      check: 'verified',
      account: '123456789012',
      region: 'eu-west-1',
    }
    const line = (auth, aws) => render(auth, aws)[2]
    expect(line({ state: 'rc-user', user: 'alex' }, ok)).toBe(
      `aws credentials: profile "dev" — account 123456789012, region eu-west-1${HINT}`,
    )
    expect(line({ state: 'env-access' }, ok)).toContain(HINT)
    expect(
      line(
        { state: 'rc-user', user: 'alex' },
        { ...ok, resolver: 'acct', dashboardDisabled: true },
      ),
    ).not.toContain(HINT)
    expect(line({ state: 'env-license' }, ok)).not.toContain(HINT)
    expect(line({ state: 'config-license' }, ok)).not.toContain(HINT)
    expect(line({ state: 'none' }, ok)).not.toContain(HINT)
    // Only a successful check: an unverified or rejected one keeps its own fix.
    expect(
      line(
        { state: 'rc-user', user: 'alex' },
        { ...ok, check: 'unverified', reason: 'timeout' },
      ),
    ).not.toContain(HINT)
  })

  it('orders the report service, auth, aws credentials', () => {
    const lines = render(
      { state: 'env-license' },
      { state: 'profile', profile: 'dev' },
    )
    expect(lines).toEqual([
      'service: serverless.yml found',
      'auth: using SERVERLESS_LICENSE_KEY from the environment',
      'aws credentials: profile "dev"',
    ])
  })
})

// `agent setup` checks one stage's AWS credentials. Stages whose credentials
// come from somewhere else are named, not checked: a check per stage would
// cost an AWS call each and flag accounts a developer deliberately lacks.
describe('otherStageAwsSources', () => {
  const sameNamedPerStage = {
    stages: {
      default: {
        resolvers: { 'aws-account': { type: 'aws', profile: 'default' } },
      },
      staging: {
        resolvers: {
          'aws-account': { type: 'aws', profile: 'staging-account' },
        },
      },
    },
    provider: { name: 'aws' },
  }

  it('names a stage whose same-named resolver uses another profile', () => {
    expect(
      otherStageAwsSources({ config: sameNamedPerStage, stage: 'dev' }),
    ).toEqual([
      { stage: 'staging', resolver: 'aws-account', profile: 'staging-account' },
    ])
  })

  it('from that stage, the checked one is not listed again', () => {
    expect(
      otherStageAwsSources({ config: sameNamedPerStage, stage: 'staging' }),
    ).toEqual([])
  })

  it('a stage block without its own aws settings is not listed', () => {
    const config = {
      ...sameNamedPerStage,
      stages: {
        ...sameNamedPerStage.stages,
        prod: { params: { domain: 'example.com' } },
      },
    }
    expect(otherStageAwsSources({ config, stage: 'dev' })).toEqual([
      { stage: 'staging', resolver: 'aws-account', profile: 'staging-account' },
    ])
  })

  it('follows provider.resolver, and says so for keys in serverless.yml', () => {
    const config = {
      stages: {
        default: {
          resolvers: {
            deployer: { type: 'aws', profile: 'dev-account' },
            other: { type: 'aws', profile: 'unused' },
          },
        },
        prod: {
          resolvers: {
            deployer: {
              type: 'aws',
              accessKeyId: '${env:PROD_KEY_ID}',
              secretAccessKey: '${env:PROD_SECRET}',
            },
          },
        },
      },
      provider: { name: 'aws', resolver: 'deployer' },
    }
    expect(otherStageAwsSources({ config, stage: 'dev' })).toEqual([
      { stage: 'prod', resolver: 'deployer', keys: true },
    ])
  })

  it('a stage that falls back to the default credentials is named as such', () => {
    const config = {
      stages: {
        dev: { resolvers: { acct: { type: 'aws', profile: 'dev-account' } } },
        qa: { params: { x: 1 } },
      },
      provider: { name: 'aws' },
    }
    expect(otherStageAwsSources({ config, stage: 'dev' })).toEqual([
      { stage: 'qa', defaultChain: true },
    ])
  })

  it('nothing when provider.profile applies to every stage, or there are no stages', () => {
    expect(
      otherStageAwsSources({
        config: { ...sameNamedPerStage, provider: { profile: 'default' } },
        stage: 'dev',
      }),
    ).toEqual([])
    expect(
      otherStageAwsSources({ config: { provider: {} }, stage: 'dev' }),
    ).toEqual([])
    expect(otherStageAwsSources({ config: undefined, stage: 'dev' })).toEqual(
      [],
    )
  })

  // agent setup resolves no variables, so "--stage" could not check such a
  // stage either (docs: cli-reference/agent-setup.md).
  // `dashboard: false` alone changes the credentials: that stage never uses
  // the org's Dashboard provider.
  it('a stage that differs only in its dashboard setting is listed', () => {
    const config = {
      stages: {
        default: { resolvers: { acct: { type: 'aws', profile: 'shared' } } },
        prod: {
          resolvers: {
            acct: { type: 'aws', profile: 'shared', dashboard: false },
          },
        },
      },
      provider: { name: 'aws' },
    }
    expect(otherStageAwsSources({ config, stage: 'dev' })).toEqual([
      { stage: 'prod', resolver: 'acct', profile: 'shared' },
    ])
  })

  it('a stage whose profile is a variable is not listed', () => {
    const config = {
      stages: {
        default: {
          resolvers: { acct: { type: 'aws', profile: 'dev-account' } },
        },
        staging: {
          resolvers: {
            acct: { type: 'aws', profile: '${env:STAGING_PROFILE}' },
          },
        },
        prod: { resolvers: { acct: { type: 'aws', profile: 'prod-account' } } },
      },
      provider: { name: 'aws' },
    }
    expect(otherStageAwsSources({ config, stage: 'dev' })).toEqual([
      { stage: 'prod', resolver: 'acct', profile: 'prod-account' },
    ])
  })

  it('a stage with several aws resolvers and no provider.resolver is left to deploy to report', () => {
    const config = {
      stages: {
        default: { resolvers: { a: { type: 'aws', profile: 'a' } } },
        staging: { resolvers: { b: { type: 'aws', profile: 'b' } } },
      },
      provider: { name: 'aws' },
    }
    expect(otherStageAwsSources({ config, stage: 'dev' })).toEqual([])
  })
})

describe('renderEnvironmentReport: other stages', () => {
  it('lists them after the AWS line, with the command that checks one', () => {
    const lines = renderEnvironmentReport({
      auth: { state: 'env-license' },
      aws: { state: 'profile', profile: 'default', resolver: 'aws-account' },
      service: { present: true },
      otherStages: [
        {
          stage: 'staging',
          resolver: 'aws-account',
          profile: 'staging-account',
        },
        { stage: 'prod', resolver: 'deployer', keys: true },
        { stage: 'qa', defaultChain: true },
      ],
    })
    expect(lines.at(-1)).toBe(
      'other stages, not checked: "staging" (resolver "aws-account", profile "staging-account"), "prod" (resolver "deployer", keys in serverless.yml), "qa" (the default AWS credentials) — check one with "serverless agent setup --stage <name>"',
    )
  })

  it('no line when every stage uses the checked credentials', () => {
    const lines = renderEnvironmentReport({
      auth: { state: 'env-license' },
      aws: { state: 'profile', profile: 'default' },
      service: { present: true },
      otherStages: [],
    })
    expect(lines).toHaveLength(3)
  })
})

describe('renderEnvironmentReport: checked stage', () => {
  it('names the stage the AWS check followed, in a service', () => {
    const [serviceLine] = renderEnvironmentReport({
      auth: { state: 'rc-user', user: 'alex' },
      aws: { state: 'profile', profile: 'default' },
      service: { present: true, configFileName: 'serverless.yml' },
      stage: 'alex',
    })
    expect(serviceLine).toBe(
      'service: serverless.yml found; AWS credentials checked for stage "alex"',
    )
  })

  it('names no stage outside a service', () => {
    const [serviceLine] = renderEnvironmentReport({
      auth: { state: 'none' },
      aws: { state: 'profile', profile: 'default' },
      service: { present: false },
    })
    expect(serviceLine).not.toContain('stage')
  })
})
