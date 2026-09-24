import { jest } from '@jest/globals'
import { ServerlessErrorCodes } from '@serverless/util'
import loginNonInteractive from '../../../../../src/lib/runners/core/login-noninteractive.js'
import { Authentication } from '../../../../../src/lib/auth/index.js'

// Success lines and notices are collected separately so each test can say
// which channel a message belongs to.
const collect = () => {
  const lines = []
  const notices = []
  return {
    lines,
    notices,
    success: (text) => lines.push(text),
    notice: (text) => notices.push(text),
  }
}

// The sign-in check every command runs, standing in for authenticate(): it
// finds what detection finds, and nothing found is AUTH_REQUIRED.
const notSignedIn = () =>
  Object.assign(new Error('Not signed in'), {
    code: ServerlessErrorCodes.general.AUTH_REQUIRED,
  })
const checkLikeDetection = (detectAuth) => async () => {
  const { state } = (await detectAuth?.()) ?? {}
  if (!state || state === 'none') throw notSignedIn()
  return {}
}

// The repo's own CI sets CI=true: pin the environment, and opt into CI per test.
const login = (args = {}) =>
  loginNonInteractive({
    isCI: () => false,
    verifySignIn: checkLikeDetection(args.detectAuth),
    ...args,
  })

describe('serverless login (non-interactive)', () => {
  it('reports an existing session as a success line and does not start a browser flow', async () => {
    const { lines, success } = collect()
    const createAuthentication = jest.fn()
    const result = await login({
      detectAuth: async () => ({
        state: 'rc-user',
        user: 'tester',
        org: 'acme',
      }),
      createAuthentication,
      success,
    })
    expect(lines).toEqual(['Already signed in as tester (org "acme")'])
    expect(createAuthentication).not.toHaveBeenCalled()
    expect(result).toEqual({ state: 'rc-user' })
  })

  it('reports an env key the same way', async () => {
    const { lines, success } = collect()
    await login({
      detectAuth: async () => ({ state: 'env-access' }),
      createAuthentication: jest.fn(),
      success,
    })
    expect(lines).toEqual(['Using SERVERLESS_ACCESS_KEY from the environment'])
  })

  it('reports a saved license key as the existing sign-in', async () => {
    const { lines, success } = collect()
    const createAuthentication = jest.fn()
    await login({
      detectAuth: async () => ({ state: 'rc-license', org: 'acme' }),
      createAuthentication,
      success,
    })
    expect(lines).toEqual([
      'Already using a License Key saved on this machine (org "acme")',
    ])
    expect(createAuthentication).not.toHaveBeenCalled()
  })

  it('with no session: prints the sign-in URL, waits for the browser, then reports the new session', async () => {
    const { lines, notices, success, notice } = collect()
    const loginData = { username: 'tester', user_uid: 'u1', idToken: 't' }
    const authentication = new Authentication({ versionFramework: '4.0.0' })
    authentication.loginViaBrowser = async () => ({
      loginUrl: 'https://app.example.test?client=cli&transactionId=abc',
      loginData: Promise.resolve(loginData),
    })
    const completeBrowserLogin = jest.fn(async ({ chooseDefaultOrg }) => ({
      orgId: 'o1',
      orgName: 'acme',
      isDefault: true,
      username: 'tester',
      orgCount: 1,
      // Prove the non-interactive chooser needs no prompt: it applies the
      // fallback rule (the oldest org the user owns).
      chosen: chooseDefaultOrg([
        { orgName: 'member-of', role: 'member', createdAt: 1 },
        { orgName: 'owned-new', role: 'owner', createdAt: 3 },
        { orgName: 'owned-old', role: 'owner', createdAt: 2 },
      ]),
    }))
    authentication.completeBrowserLogin = completeBrowserLogin

    const result = await login({
      versionFramework: '4.0.0',
      detectAuth: async () => ({ state: 'none' }),
      createAuthentication: () => authentication,
      success,
      notice,
    })

    // The URL and the wait are notices; the outcome is one success line.
    expect(notices[0]).toContain(
      'https://app.example.test?client=cli&transactionId=abc',
    )
    expect(notices[1]).toContain('Waiting for the sign-in to complete')
    expect(lines).toEqual(['Signed in as tester (org "acme")'])
    expect(completeBrowserLogin).toHaveBeenCalledWith(
      expect.objectContaining({ loginData, baseFilename: 'serverless' }),
    )
    expect(result).toMatchObject({ state: 'rc-user', chosen: 'owned-old' })
  })

  // A fresh browser sign-in whose completion reports `completion`.
  const signIn = (completion) => {
    const authentication = new Authentication({ versionFramework: '4.0.0' })
    authentication.loginViaBrowser = async () => ({
      loginUrl: 'https://app.example.test',
      loginData: Promise.resolve({ username: 'tester' }),
    })
    authentication.completeBrowserLogin = jest.fn(async () => ({
      orgId: 'o1',
      isDefault: true,
      username: 'tester',
      ...completion,
    }))
    return authentication
  }

  it('with several orgs: names the default it set, lists the orgs, and says how to pick another', async () => {
    const { lines, success, notice } = collect()
    await login({
      detectAuth: async () => ({ state: 'none' }),
      createAuthentication: () =>
        signIn({
          orgName: 'acme',
          orgCount: 3,
          orgNames: ['acme', 'beta', 'gamma'],
          defaultSource: 'chosen',
        }),
      success,
      notice,
    })
    expect(lines[0]).toBe(
      'Signed in as tester (org "acme") — set as your default; you belong to 3 orgs: acme, beta, gamma. For a service in another org, add "org: <name>" to its serverless.yml; to change the default, run "serverless login --org <name>".',
    )
  })

  it('with several orgs and a saved default: says the default was kept', async () => {
    const { lines, success, notice } = collect()
    await login({
      detectAuth: async () => ({ state: 'none' }),
      createAuthentication: () =>
        signIn({
          orgName: 'beta',
          orgCount: 2,
          orgNames: ['acme', 'beta'],
          defaultSource: 'saved',
        }),
      success,
      notice,
    })
    expect(lines[0]).toMatch(
      /^Signed in as tester \(org "beta"\) — your saved default; you belong to 2 orgs: acme, beta\. /,
    )
  })

  it('lists at most ten orgs', async () => {
    const { lines, success, notice } = collect()
    const orgNames = Array.from({ length: 12 }, (_, i) => `org${i + 1}`)
    await login({
      detectAuth: async () => ({ state: 'none' }),
      createAuthentication: () =>
        signIn({
          orgName: 'org1',
          orgCount: 12,
          orgNames,
          defaultSource: 'chosen',
        }),
      success,
      notice,
    })
    expect(lines[0]).toContain(
      'you belong to 12 orgs: org1, org2, org3, org4, org5, org6, org7, org8, org9, org10, and 2 more.',
    )
  })

  it('--org on a fresh sign-in: passes the org through and reports it as the default', async () => {
    const { lines, success, notice } = collect()
    const authentication = signIn({
      orgName: 'beta',
      orgCount: 3,
      orgNames: ['acme', 'beta', 'gamma'],
      defaultSource: 'requested',
    })
    await login({
      org: 'beta',
      detectAuth: async () => ({ state: 'none' }),
      createAuthentication: () => authentication,
      success,
      notice,
    })
    expect(authentication.completeBrowserLogin).toHaveBeenCalledWith(
      expect.objectContaining({ requestedOrgName: 'beta' }),
    )
    expect(lines).toEqual([
      'Signed in as tester (org "beta"), now your default org',
    ])
  })

  it('--org with an existing session: switches the default without a browser sign-in', async () => {
    const { lines, notices, success, notice } = collect()
    const authentication = new Authentication({ versionFramework: '4.0.0' })
    authentication.loginViaBrowser = jest.fn()
    authentication.listSignedInUserOrgs = jest.fn(async () => ({
      userId: 'u1',
      username: 'tester',
      orgs: [{ orgName: 'acme' }, { orgName: 'beta' }],
    }))
    authentication.saveDefaultOrg = jest.fn(async () => {})
    await login({
      org: 'beta',
      detectAuth: async () => ({
        state: 'rc-user',
        user: 'tester',
        org: 'acme',
      }),
      createAuthentication: () => authentication,
      success,
      notice,
    })
    expect(authentication.saveDefaultOrg).toHaveBeenCalledWith({
      userId: 'u1',
      orgName: 'beta',
    })
    expect(authentication.loginViaBrowser).not.toHaveBeenCalled()
    expect(notices).toHaveLength(0)
    expect(lines).toEqual([
      'Signed in as tester (org "beta"), now your default org',
    ])
  })

  it('--org naming an org the user is not in: ORG_NOT_FOUND listing the orgs, nothing saved', async () => {
    const { lines, success } = collect()
    const authentication = new Authentication({ versionFramework: '4.0.0' })
    authentication.listSignedInUserOrgs = async () => ({
      userId: 'u1',
      username: 'tester',
      orgs: [{ orgName: 'acme' }, { orgName: 'beta' }],
    })
    authentication.saveDefaultOrg = jest.fn()
    const error = await login({
      org: 'nope',
      detectAuth: async () => ({
        state: 'rc-user',
        user: 'tester',
        org: 'acme',
      }),
      createAuthentication: () => authentication,
      success,
    }).catch((e) => e)
    expect(error.code).toBe(ServerlessErrorCodes.general.ORG_NOT_FOUND)
    expect(error.message).toContain('Your orgs: acme, beta.')
    expect(authentication.saveDefaultOrg).not.toHaveBeenCalled()
    expect(lines).toHaveLength(0)
  })

  it('--org with an env key: a stackless error, because the key already picks the org', async () => {
    const error = await login({
      org: 'beta',
      detectAuth: async () => ({ state: 'env-access' }),
      createAuthentication: jest.fn(),
      success: jest.fn(),
    }).catch((e) => e)
    expect(error.code).toBe(ServerlessErrorCodes.general.INVALID_CLI_INPUT)
    expect(error.message).toBe(
      'SERVERLESS_ACCESS_KEY is set, and it belongs to a single org, so --org has nothing to change. Unset SERVERLESS_ACCESS_KEY to sign in as a user and pick a default org.',
    )
    expect(error.stack).toBeUndefined()
  })

  // Nobody can open the sign-in URL in CI: fail at once with the keys to set.
  it('in CI with no session: fails at once with the keys to set, no browser flow', async () => {
    const { lines, success } = collect()
    const createAuthentication = jest.fn()
    const error = await login({
      detectAuth: async () => ({ state: 'none' }),
      createAuthentication,
      success,
      isCI: () => true,
    }).catch((e) => e)
    expect(error.code).toBe(ServerlessErrorCodes.general.AUTH_REQUIRED)
    expect(error.message).toContain('No one can open a sign-in URL in CI')
    expect(error.message).toContain('SERVERLESS_ACCESS_KEY')
    expect(error.message).toContain('SERVERLESS_LICENSE_KEY')
    expect(error.stack).toBeUndefined()
    expect(createAuthentication).not.toHaveBeenCalled()
    expect(lines).toHaveLength(0)
  })

  it('in CI with a session: reports it as before', async () => {
    const { lines, success } = collect()
    await login({
      detectAuth: async () => ({ state: 'rc-user', user: 'tester' }),
      createAuthentication: jest.fn(),
      success,
      isCI: () => true,
    })
    expect(lines).toEqual(['Already signed in as tester'])
  })

  // The login broker can accept the connection and never send the URL.
  it('gives up with the same error when the login broker never answers', async () => {
    const { lines, notices, success, notice } = collect()
    const authentication = new Authentication({ versionFramework: '4.0.0' })
    authentication.loginViaBrowser = () => new Promise(() => {})
    authentication.completeBrowserLogin = jest.fn()
    const error = await login({
      detectAuth: async () => ({ state: 'none' }),
      createAuthentication: () => authentication,
      success,
      notice,
      timeoutMs: 20,
    }).catch((e) => e)
    expect(error.code).toBe(ServerlessErrorCodes.general.AUTH_FAILED)
    expect(error.message).toContain('was not completed')
    expect(authentication.completeBrowserLogin).not.toHaveBeenCalled()
    expect(notices).toHaveLength(0)
    expect(lines).toHaveLength(0)
  })

  it('gives up with a stackless error when the browser sign-in never completes', async () => {
    const { lines, notices, success, notice } = collect()
    const authentication = new Authentication({ versionFramework: '4.0.0' })
    authentication.loginViaBrowser = async () => ({
      loginUrl: 'https://app.example.test',
      loginData: new Promise(() => {}),
    })
    authentication.completeBrowserLogin = jest.fn()
    const error = await login({
      detectAuth: async () => ({ state: 'none' }),
      createAuthentication: () => authentication,
      success,
      notice,
      timeoutMs: 20,
    }).catch((e) => e)
    expect(error.code).toBe(ServerlessErrorCodes.general.AUTH_FAILED)
    expect(error.message).toContain('was not completed')
    expect(error.stack).toBeUndefined()
    expect(authentication.completeBrowserLogin).not.toHaveBeenCalled()
    expect(notices).toHaveLength(2)
    expect(lines).toHaveLength(0)
  })
})

// Without --org, the existing sign-in is checked the way every command checks
// it, so a sign-in detection cannot see is reported, and a failing one fails.
describe('serverless login (non-interactive): the sign-in check', () => {
  it('reports a License Key in serverless.yml, with no browser flow', async () => {
    const { lines, success } = collect()
    const createAuthentication = jest.fn()
    await login({
      detectAuth: async () => ({ state: 'config-license' }),
      createAuthentication,
      success,
    })
    expect(lines).toEqual(['Already using the License Key in serverless.yml'])
    expect(createAuthentication).not.toHaveBeenCalled()
  })

  it('reports a License Key found in SSM, which detection cannot see', async () => {
    const { lines, success } = collect()
    const createAuthentication = jest.fn()
    const result = await login({
      detectAuth: async () => ({ state: 'none' }),
      verifySignIn: async () => ({ orgId: 'org-1' }),
      createAuthentication,
      success,
    })
    expect(result).toEqual({ state: 'ssm-license' })
    expect(lines).toEqual([
      'Already using the License Key from the /serverless-framework/license-key SSM parameter',
    ])
    expect(createAuthentication).not.toHaveBeenCalled()
  })

  it('passes on any failure other than nothing found, with no browser flow', async () => {
    const { lines, success } = collect()
    const createAuthentication = jest.fn()
    const failure = Object.assign(new Error('Session is no longer valid'), {
      code: ServerlessErrorCodes.general.AUTH_FAILED,
    })
    await expect(
      login({
        detectAuth: async () => ({ state: 'rc-user', user: 'tester' }),
        verifySignIn: async () => {
          throw failure
        },
        createAuthentication,
        success,
      }),
    ).rejects.toBe(failure)
    expect(lines).toEqual([])
    expect(createAuthentication).not.toHaveBeenCalled()
  })
})
