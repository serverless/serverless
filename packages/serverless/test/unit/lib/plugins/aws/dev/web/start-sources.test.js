import { afterEach, describe, expect, test } from '@jest/globals'
import path from 'path'
import {
  BUILD_OUTPUT_DIRECTORIES,
  START_SOURCES,
  resolveStartSource,
} from '../../../../../../../lib/plugins/aws/dev/web/start-sources.js'
import { classifyWebApp } from '../../../../../../../lib/plugins/aws/dev/web/eligibility.js'
import { cleanTempDirs, tempDir, write } from '../local/helpers.js'

afterEach(cleanTempDirs)

const service = (files = {}) =>
  write(tempDir('sls-dev-web-start-'), {
    'src/server.ts': 'export {}\n',
    '.next/standalone/server.js': '\n',
    ...files,
  })

describe('START_SOURCES', () => {
  test('config comes before entry', () => {
    expect(START_SOURCES.map(({ name }) => name)).toEqual(['config', 'entry'])
  })
})

describe('resolveStartSource', () => {
  test('config wins over entry', () => {
    const serviceDir = service()
    expect(
      resolveStartSource({
        key: 'web',
        webApp: { entry: 'src/server.ts', dev: { command: 'npm run dev' } },
        serviceDir,
      }),
    ).toEqual({ source: 'config', command: 'npm run dev', cwd: serviceDir })
  })

  test('config applies to a build-output entry too', () => {
    const serviceDir = service()
    expect(
      resolveStartSource({
        key: 'web',
        webApp: {
          entry: '.next/standalone/server.js',
          dev: { command: 'next dev' },
        },
        serviceDir,
      }),
    ).toMatchObject({ source: 'config', command: 'next dev' })
  })

  test('a blank command is no command', () => {
    const serviceDir = service()
    expect(
      resolveStartSource({
        key: 'web',
        webApp: { entry: 'src/server.ts', dev: { command: '   ' } },
        serviceDir,
      }),
    ).toMatchObject({ source: 'entry' })
  })

  test('src/server.ts resolves to entry', () => {
    const serviceDir = service()
    expect(
      resolveStartSource({
        key: 'web',
        webApp: { entry: 'src/server.ts' },
        serviceDir,
      }),
    ).toEqual({
      source: 'entry',
      entryFile: path.join(serviceDir, 'src', 'server.ts'),
      cwd: serviceDir,
    })
  })

  test('.next/standalone/server.js resolves to null', () => {
    const serviceDir = service()
    expect(
      resolveStartSource({
        key: 'web',
        webApp: { entry: '.next/standalone/server.js' },
        serviceDir,
      }),
    ).toBeNull()
  })

  test.each(BUILD_OUTPUT_DIRECTORIES.map((dir) => [dir]))(
    'an entry under %s/ is a build output',
    (dir) => {
      const serviceDir = service({ [`${dir}/server.js`]: '\n' })
      expect(
        resolveStartSource({
          key: 'web',
          webApp: { entry: `${dir}/server.js` },
          serviceDir,
        }),
      ).toBeNull()
    },
  )

  test('an entry under a build output directory deeper down is one too', () => {
    const serviceDir = service({ 'apps/web/dist/server.js': '\n' })
    expect(
      resolveStartSource({
        key: 'web',
        webApp: { entry: 'apps/web/dist/server.js' },
        serviceDir,
      }),
    ).toBeNull()
  })

  test.each([
    ['darwin', null],
    ['win32', null],
    ['linux', 'entry'],
  ])(
    'build output directory names compare without case on %s',
    (platform, expected) => {
      const serviceDir = service({
        'Dist/server.js': '\n',
        '.NEXT/server.js': '\n',
      })
      for (const entry of ['Dist/server.js', '.NEXT/server.js']) {
        expect(
          resolveStartSource({
            key: 'web',
            webApp: { entry },
            serviceDir,
            platform,
          })?.source ?? null,
        ).toBe(expected)
      }
    },
  )

  test('build: false means the entry is a build output', () => {
    const serviceDir = service()
    expect(
      resolveStartSource({
        key: 'web',
        webApp: { entry: 'src/server.ts', build: false },
        serviceDir,
      }),
    ).toBeNull()
  })

  test('prebuilt zip with entry present as source resolves to entry', () => {
    const serviceDir = service({ 'server.mjs': '\n' })
    expect(
      resolveStartSource({
        key: 'web',
        webApp: {
          entry: 'server.mjs',
          package: { artifact: 'artifacts/web.zip' },
        },
        serviceDir,
      }),
    ).toEqual({
      source: 'entry',
      entryFile: path.join(serviceDir, 'server.mjs'),
      cwd: serviceDir,
    })
  })

  test('prebuilt zip whose entry is not a file here resolves to null', () => {
    const serviceDir = service()
    expect(
      resolveStartSource({
        key: 'web',
        webApp: {
          entry: 'index.mjs',
          package: { artifact: 'artifacts/web.zip' },
        },
        serviceDir,
      }),
    ).toBeNull()
  })

  test.each([
    ['a directory', 'src'],
    ['a missing file', 'src/missing.ts'],
    ['a file outside the service directory', '../server.js'],
    ['no entry', undefined],
  ])('%s resolves to null', (label, entry) => {
    const serviceDir = service()
    expect(
      resolveStartSource({ key: 'web', webApp: { entry }, serviceDir }),
    ).toBeNull()
  })

  test('null gives eligibility its build_output_entry row', () => {
    const serviceDir = service()
    const config = { entry: '.next/standalone/server.js' }
    expect(
      classifyWebApp({
        key: 'web',
        config,
        deployed: { functionName: 'svc-dev-web' },
        startSource:
          resolveStartSource({ key: 'web', webApp: config, serviceDir })
            ?.source ?? null,
      }),
    ).toMatchObject({ mode: 'deployed', reason: 'build_output_entry' })
  })
})
