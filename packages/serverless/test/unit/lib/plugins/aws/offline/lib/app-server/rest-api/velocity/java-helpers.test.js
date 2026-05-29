import { runInPollutedScope } from '../../../../../../../../../../lib/plugins/aws/offline/lib/app-server/rest-api/velocity/java-helpers.js'

describe('runInPollutedScope', () => {
  it('exposes equalsIgnoreCase on strings during the scope', () => {
    runInPollutedScope(() => {
      expect('abc'.equalsIgnoreCase('ABC')).toBe(true)
    })
  })

  it('exposes contains on strings during the scope', () => {
    runInPollutedScope(() => {
      expect('abc'.contains('b')).toBe(true)
    })
  })

  it('exposes matches on strings during the scope', () => {
    runInPollutedScope(() => {
      expect('a1b'.matches('\\d')).toBeTruthy()
    })
  })

  it('exposes replaceFirst on strings during the scope', () => {
    runInPollutedScope(() => {
      expect('aXa'.replaceFirst('a', 'b')).toBe('bXa')
    })
  })

  it('exposes equals on strings during the scope', () => {
    runInPollutedScope(() => {
      expect('abc'.equals('abc')).toBe(true)
    })
  })

  it('exposes regionMatches (4-arg) on strings during the scope', () => {
    runInPollutedScope(() => {
      // 'Hello'[0..3] vs 'Help'[0..3] => 'Hel' === 'Hel'
      expect('Hello'.regionMatches(0, 'Help', 0, 3)).toBe(true)
      expect('Hello'.regionMatches(0, 'help', 0, 3)).toBe(false)
    })
  })

  it('exposes regionMatches (5-arg, ignoreCase) on strings during the scope', () => {
    runInPollutedScope(() => {
      expect('Hello'.regionMatches(true, 0, 'help', 0, 3)).toBe(true)
      // out-of-bounds length still returns false
      expect('Hello'.regionMatches(true, 0, 'help', 0, 99)).toBe(false)
    })
  })

  it('restores all six helpers after the scope returns', () => {
    runInPollutedScope(() => {})
    expect('x'.equals).toBeUndefined()
    expect('x'.equalsIgnoreCase).toBeUndefined()
    expect('x'.contains).toBeUndefined()
    expect('x'.matches).toBeUndefined()
    expect('x'.regionMatches).toBeUndefined()
    expect('x'.replaceFirst).toBeUndefined()
  })

  it('restores the String prototype after the scope returns', () => {
    runInPollutedScope(() => {})
    expect('x'.equalsIgnoreCase).toBeUndefined()
    expect('x'.contains).toBeUndefined()
  })

  it('restores the String prototype even when the scope throws', () => {
    expect(() =>
      runInPollutedScope(() => {
        throw new Error('boom')
      }),
    ).toThrow('boom')
    expect('x'.equalsIgnoreCase).toBeUndefined()
    expect('x'.contains).toBeUndefined()
  })

  it('returns the value its callback returns', () => {
    expect(runInPollutedScope(() => 42)).toBe(42)
  })
})
