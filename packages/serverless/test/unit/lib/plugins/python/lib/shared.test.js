import { describe, it, expect } from '@jest/globals'
import path from 'path'

const { getUserCachePath, getDefaultUserCachePath, getSourceDateEpoch } =
  await import('../../../../../../lib/plugins/python/lib/shared.js')

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
