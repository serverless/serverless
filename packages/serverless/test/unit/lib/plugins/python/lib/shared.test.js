import { describe, it, expect } from '@jest/globals'
import path from 'path'

const { getUserCachePath, getDefaultUserCachePath } =
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
