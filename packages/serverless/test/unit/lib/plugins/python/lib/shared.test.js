import { describe, it, expect } from '@jest/globals'
import path from 'path'

const {
  getUserCachePath,
  getDefaultUserCachePath,
  getRequirementsLayerPath,
  getRequirementsWorkingPath,
  installSettingsHash,
  getSourceDateEpoch,
} = await import('../../../../../../lib/plugins/python/lib/shared.js')

const APP_NAME = 'serverless-python-requirements'
const APP_AUTHOR = 'ServerlessFramework'

describe('getDefaultUserCachePath', () => {
  // The darwin and linux expectations are characterization fixtures captured
  // from appdirectory@0.1.0 userCache() - they pin the on-disk cache location
  // of existing users and must not change or those caches are orphaned. The
  // win32 expectations pin the ServerlessFramework vendor directory.

  it('resolves ~/Library/Caches/<appName> on darwin', () => {
    expect(getDefaultUserCachePath('darwin', { HOME: '/Users/alice' })).toEqual(
      path.join('/Users/alice', 'Library', 'Caches', APP_NAME),
    )
  })

  it('resolves %LOCALAPPDATA%/<appAuthor>/<appName>/Cache on win32', () => {
    expect(
      getDefaultUserCachePath('win32', {
        LOCALAPPDATA: 'C:\\Users\\alice\\AppData\\Local',
        APPDATA: 'C:\\Users\\alice\\AppData\\Roaming',
      }),
    ).toEqual(
      path.join(
        'C:\\Users\\alice\\AppData\\Local',
        APP_AUTHOR,
        APP_NAME,
        'Cache',
      ),
    )
  })

  it('falls back to %APPDATA% on win32 when LOCALAPPDATA is unset', () => {
    expect(
      getDefaultUserCachePath('win32', {
        APPDATA: 'C:\\Users\\alice\\AppData\\Roaming',
      }),
    ).toEqual(
      path.join(
        'C:\\Users\\alice\\AppData\\Roaming',
        APP_AUTHOR,
        APP_NAME,
        'Cache',
      ),
    )
  })

  it('resolves $XDG_CACHE_HOME/<appName> on linux when set', () => {
    expect(
      getDefaultUserCachePath('linux', {
        HOME: '/home/alice',
        XDG_CACHE_HOME: '/home/alice/.custom-cache',
      }),
    ).toEqual(path.join('/home/alice/.custom-cache', APP_NAME))
  })

  it('resolves ~/.cache/<appName> on linux without XDG_CACHE_HOME', () => {
    expect(getDefaultUserCachePath('linux', { HOME: '/home/alice' })).toEqual(
      path.join('/home/alice', '.cache', APP_NAME),
    )
  })

  it('resolves $XDG_CACHE_HOME/<appName> on linux without HOME', () => {
    expect(
      getDefaultUserCachePath('linux', {
        XDG_CACHE_HOME: '/home/alice/.custom-cache',
      }),
    ).toEqual(path.join('/home/alice/.custom-cache', APP_NAME))
  })

  it('defaults to the current platform and environment', () => {
    expect(getDefaultUserCachePath()).toEqual(
      getDefaultUserCachePath(process.platform, process.env),
    )
  })
})

describe('getUserCachePath', () => {
  it('resolves an explicit cacheLocation override', () => {
    expect(getUserCachePath({ cacheLocation: 'custom-cache' })).toEqual(
      path.resolve('custom-cache'),
    )
  })

  it('uses the platform default cache path without cacheLocation', () => {
    expect(getUserCachePath({})).toEqual(getDefaultUserCachePath())
  })

  it('uses the platform default cache path when called without options', () => {
    expect(getUserCachePath()).toEqual(getDefaultUserCachePath())
  })
})

// The static cache is keyed on the requirements checksum and on the settings
// that change what an install produces, so switching to Docker or to Linux
// wheels installs afresh instead of reusing an install made another way.
describe('static cache names follow the install settings', () => {
  const serverless = {
    service: { provider: { runtime: 'python3.13', architecture: 'arm64' } },
  }
  const base = {
    useStaticCache: true,
    cacheLocation: '/cache',
    pythonBin: 'python3.13',
    pipCmdExtraArgs: [],
  }
  const working = (options, sls = serverless) =>
    getRequirementsWorkingPath('reqsha', '/svc', options, sls)

  it('keeps the checksum-first name, with the settings hash and architecture', () => {
    expect(working(base)).toBe(
      path.join(
        path.resolve('/cache'),
        `reqsha_${installSettingsHash(base, serverless)}_arm64_slspyc`,
      ),
    )
  })

  it('changes with the settings that change the install', () => {
    for (const change of [
      { pipCmdExtraArgs: ['--platform=manylinux2014_aarch64'] },
      { dockerizePip: true },
      { dockerImage: 'custom:latest' },
      { pythonBin: 'python3' },
      { installer: 'uv' },
      { slim: true },
      { vendor: './vendor' },
    ]) {
      expect(working({ ...base, ...change })).not.toBe(working(base))
    }
    const otherRuntime = {
      service: { provider: { runtime: 'python3.12', architecture: 'arm64' } },
    }
    expect(working(base, otherRuntime)).not.toBe(working(base))
    // With slim, strip decides whether the .so files are stripped.
    expect(working({ ...base, slim: true, strip: false })).not.toBe(
      working({ ...base, slim: true }),
    )
  })

  it('stays the same for settings that do not change the install', () => {
    expect(working({ ...base, zip: true, layer: {} })).toBe(working(base))
  })

  it('the layer archive cache follows the same settings', () => {
    const layer = (options) =>
      getRequirementsLayerPath('reqsha', '/fallback.zip', options, serverless)
    expect(layer(base)).toMatch(/reqsha_[0-9a-f]{12}_arm64_slspyc\.zip$/)
    expect(layer({ ...base, dockerizePip: true })).not.toBe(layer(base))
  })

  it('without the static cache the paths do not change', () => {
    expect(working({ ...base, useStaticCache: false })).toBe(
      path.join('/svc', 'requirements'),
    )
  })
})

describe('getSourceDateEpoch', () => {
  // The dependency install runs with SOURCE_DATE_EPOCH set so that pip writes
  // hash-based .pyc files (PEP 552). Timestamp-based ones are stale as soon as
  // the zip pins its entry dates, and are recompiled on every cold start.

  it('defaults to the earliest date a zip entry can carry', () => {
    expect(getSourceDateEpoch({})).toEqual('315532800')
    expect(new Date(315532800 * 1000).toISOString()).toEqual(
      '1980-01-01T00:00:00.000Z',
    )
  })

  it('keeps a value the user has already set', () => {
    expect(getSourceDateEpoch({ SOURCE_DATE_EPOCH: '1700000000' })).toEqual(
      '1700000000',
    )
  })

  it('treats an empty value as unset, as Python does', () => {
    expect(getSourceDateEpoch({ SOURCE_DATE_EPOCH: '' })).toEqual('315532800')
  })

  it('defaults to the current environment', () => {
    expect(getSourceDateEpoch()).toEqual(getSourceDateEpoch(process.env))
  })
})
