import fs from 'fs'
import os from 'os'
import path from 'path'
import { buildWebAppsAnalytics } from '../../../../../../lib/plugins/aws/web-apps/analytics.js'

const createdDirs = []

// A service directory holding the given (empty) files, so the esbuild
// selection rules behind `bundled` can see which entries exist.
function serviceDirWith(...files) {
  const dir = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'sls-web-apps-analytics-')),
  )
  createdDirs.push(dir)
  for (const file of files) {
    fs.mkdirSync(path.join(dir, path.dirname(file)), { recursive: true })
    fs.writeFileSync(path.join(dir, file), '')
  }
  return dir
}

afterAll(() => {
  for (const dir of createdDirs)
    fs.rmSync(dir, { recursive: true, force: true })
})

const throwingGetter = (target, key) =>
  Object.defineProperty(target, key, {
    enumerable: true,
    get() {
      throw new Error('boom')
    },
  })

describe('buildWebAppsAnalytics', () => {
  test('returns {} when the service defines no web apps', () => {
    expect(buildWebAppsAnalytics(undefined)).toEqual({})
    expect(buildWebAppsAnalytics(null)).toEqual({})
    expect(buildWebAppsAnalytics({})).toEqual({})
    expect(buildWebAppsAnalytics({ webApps: {} })).toEqual({})
    expect(buildWebAppsAnalytics({ webApps: 'nope' })).toEqual({})
    expect(buildWebAppsAnalytics({ webApps: [{ entry: 'a.ts' }] })).toEqual({})
  })

  test('reports the config shape of two web apps with fixed keys only', () => {
    const serviceDir = serviceDirWith('src/server.ts', 'admin/server.js')
    const config = {
      service: 'svc',
      provider: {
        name: 'aws',
        domains: [
          {
            name: 'App.Example.com',
            webApp: 'site',
            certificateArn: 'arn:aws:acm:us-east-1:123456789012:certificate/x',
          },
          { name: 'app.example.com', basePath: 'docs', webApp: 'site' },
          { name: 'old.example.com', webApp: 'site', enabled: false },
          'api.example.com',
        ],
      },
      webApps: {
        site: {
          entry: 'src/server.ts',
          timeout: 60,
          logs: { applicationLogLevel: 'info' },
          vpc: { securityGroupIds: ['sg-1'], subnetIds: ['subnet-1'] },
        },
        admin: {
          entry: 'admin/server.js',
          build: false,
          maxConcurrency: 10,
          role: 'arn:aws:iam::123456789012:role/admin',
          kmsKeyArn: { 'Fn::GetAtt': ['Key', 'Arn'] },
          url: { authorizer: 'AWS_IAM', maxEnvironments: 4, rateLimit: 200 },
        },
      },
    }

    const result = buildWebAppsAnalytics(config, serviceDir)

    expect(result).toEqual({
      webApps: {
        count: 2,
        entryKinds: { ts: 1, js: 1 },
        bundled: 1,
        url: { aws_iam: 1, domain: 1 },
        explicit: {
          timeout: 1,
          maxConcurrency: 1,
          maxEnvironments: 1,
          rateLimit: 1,
          logs: 1,
          role: 1,
          vpc: 1,
          kmsKeyArn: 1,
        },
        domains: { entries: 2, withCertificateArn: 1 },
      },
    })
    // Never a user-authored string: names, entries, hostnames, ARNs.
    const json = JSON.stringify(result)
    for (const userString of [
      'site',
      'admin',
      'server',
      'example.com',
      'arn:',
    ]) {
      expect(json).not.toContain(userString)
    }
  })

  test('counts a web app without url, or with url: true, as public', () => {
    expect(
      buildWebAppsAnalytics(
        {
          webApps: {
            a: { entry: 'a.js' },
            b: { entry: 'b.mjs', url: true },
            c: { entry: 'c.js', url: { maxEnvironments: 2 } },
          },
        },
        serviceDirWith('a.js', 'b.mjs', 'c.js'),
      ),
    ).toEqual({
      webApps: {
        count: 3,
        entryKinds: { js: 3 },
        url: { public: 3 },
        explicit: { maxEnvironments: 1 },
      },
    })
  })

  test('analytics counts devCommand', () => {
    expect(
      buildWebAppsAnalytics({
        webApps: {
          a: { entry: 'a.js', dev: { command: 'npm run dev' } },
          b: { entry: 'b.js' },
        },
      }).webApps.explicit,
    ).toEqual({ devCommand: 1 })
  })

  test('bundled follows the esbuild selection rules for each web app', () => {
    const serviceDir = serviceDirWith('a.ts', 'b.js', 'c.ts')
    const webApps = {
      a: { entry: 'a.ts' },
      b: { entry: 'b.js', build: 'esbuild' },
      c: { entry: 'c.ts', package: { artifact: 'c.zip' } },
      missing: { entry: 'missing.ts' },
    }
    expect(buildWebAppsAnalytics({ webApps }, serviceDir).webApps.bundled).toBe(
      2,
    )
    expect(
      buildWebAppsAnalytics({ build: { esbuild: false }, webApps }, serviceDir)
        .webApps.bundled,
    ).toBeUndefined()
  })

  test('a malformed entry counts toward count and nothing else', () => {
    expect(
      buildWebAppsAnalytics({ webApps: { a: null, b: { entry: 42 } } }),
    ).toEqual({ webApps: { count: 2, url: { public: 1 } } })
  })

  test('returns {} when reading the config throws', () => {
    expect(buildWebAppsAnalytics(throwingGetter({}, 'webApps'))).toEqual({})
    expect(
      buildWebAppsAnalytics({
        webApps: { a: throwingGetter({ entry: 'a.ts' }, 'timeout') },
      }),
    ).toEqual({})
    expect(
      buildWebAppsAnalytics({
        provider: throwingGetter({}, 'domains'),
        webApps: { a: { entry: 'a.ts' } },
      }),
    ).toEqual({})
  })
})
