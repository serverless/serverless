import {
  compilePatterns,
  isPathIncluded,
  isDirIncluded,
  filterPaths,
} from '../../../../lib/utils/package-patterns.js'

describe('package-patterns', () => {
  describe('compilePatterns', () => {
    test('splits negation prefix and keeps order', () => {
      expect(
        compilePatterns(['!node_modules/**', 'node_modules/keep/**']),
      ).toEqual([
        { negated: true, pattern: 'node_modules/**' },
        { negated: false, pattern: 'node_modules/keep/**' },
      ])
    })

    test('defaults to empty list', () => {
      expect(compilePatterns()).toEqual([])
      expect(compilePatterns([])).toEqual([])
    })

    // An empty pattern carries no glob, so it cannot toggle anything -- and
    // micromatch rejects the empty string outright ("Expected pattern to be a
    // non-empty string"), which would fail packaging for a configuration that
    // used to package fine. `''` and a bare `'!'` are reachable without a typo,
    // from a variable resolving to nothing.
    test('drops empty patterns, keeping the surrounding ones', () => {
      expect(compilePatterns(['', '!'])).toEqual([])
      expect(
        compilePatterns(['!', 'assets/**', '', '!assets/secret.txt']),
      ).toEqual([
        { negated: false, pattern: 'assets/**' },
        { negated: true, pattern: 'assets/secret.txt' },
      ])
    })

    test('every helper tolerates empty patterns instead of throwing', () => {
      const compiled = compilePatterns(['!', '', '!assets/secret.txt'])
      expect(() => isPathIncluded(compiled, 'assets/logo.png')).not.toThrow()
      expect(() => isDirIncluded(compiled, 'assets')).not.toThrow()
      expect(() => filterPaths(compiled, ['assets/logo.png'])).not.toThrow()
      // The surviving real pattern still applies.
      expect(isPathIncluded(compiled, 'assets/secret.txt')).toBe(false)
      expect(isPathIncluded(compiled, 'assets/logo.png')).toBe(true)
      expect(filterPaths(compiled, [])).toEqual([])
    })
  })

  describe('isPathIncluded (ordered toggle, last match wins)', () => {
    test('no patterns keeps everything included', () => {
      expect(isPathIncluded([], 'node_modules/fastify/lib/route.js')).toBe(true)
    })

    test('negation excludes matching file', () => {
      const compiled = compilePatterns(['!node_modules/fastify/**'])
      expect(
        isPathIncluded(compiled, 'node_modules/fastify/lib/route.js'),
      ).toBe(false)
      expect(isPathIncluded(compiled, 'node_modules/other/index.js')).toBe(true)
    })

    test('later positive pattern re-includes (last match wins)', () => {
      const compiled = compilePatterns([
        '!node_modules/**',
        'node_modules/keep/**',
      ])
      expect(isPathIncluded(compiled, 'node_modules/keep/index.js')).toBe(true)
      expect(isPathIncluded(compiled, 'node_modules/drop/index.js')).toBe(false)
    })

    test('later negation wins over earlier positive', () => {
      const compiled = compilePatterns(['assets/**', '!assets/secret.txt'])
      expect(isPathIncluded(compiled, 'assets/logo.png')).toBe(true)
      expect(isPathIncluded(compiled, 'assets/secret.txt')).toBe(false)
    })

    test('matches dotfiles (dot: true)', () => {
      const compiled = compilePatterns(['!node_modules/pkg/.internal/**'])
      expect(isPathIncluded(compiled, 'node_modules/pkg/.internal/x.js')).toBe(
        false,
      )
    })

    // micromatch's globstar matches zero segments, so `X/**` also matches the
    // bare path `X`. Classic packaging feeds this toggle file paths only
    // (globby runs with `nodir: true`), so bare directory entries never reach
    // it there; the directory-aware form below is what deals with them.
    test('bare directory path is matched by X/** (globstar matches zero segments)', () => {
      const compiled = compilePatterns(['!node_modules/fastify/**'])
      expect(isPathIncluded(compiled, 'node_modules/fastify')).toBe(false)
    })
  })

  describe('isDirIncluded (bare-base rule for directory entries)', () => {
    test('negated X/** also excludes the bare directory X', () => {
      const compiled = compilePatterns(['!node_modules/fastify/**'])
      expect(isDirIncluded(compiled, 'node_modules/fastify')).toBe(false)
      expect(isDirIncluded(compiled, 'node_modules/fastify/lib')).toBe(false)
      expect(isDirIncluded(compiled, 'node_modules/other')).toBe(true)
    })

    test('re-included subtree keeps its bare directory', () => {
      const compiled = compilePatterns([
        '!node_modules/**',
        'node_modules/keep/**',
      ])
      expect(isDirIncluded(compiled, 'node_modules/keep')).toBe(true)
      expect(isDirIncluded(compiled, 'node_modules/drop')).toBe(false)
    })

    // Do NOT collapse isDirIncluded into isPathIncluded. For a literal prefix
    // the two agree (micromatch's globstar matches zero segments), but for a
    // `/**` pattern with a wildcard in its prefix they diverge: micromatch does
    // not match `foo/bar` against `foo/*/**`, while the stripped base `foo/*`
    // does — which is exactly what makes the directory entry get dropped.
    test('diverges from isPathIncluded for /** patterns with a wildcard prefix', () => {
      const compiled = compilePatterns(['!foo/*/**'])
      expect(isPathIncluded(compiled, 'foo/bar')).toBe(true)
      expect(isDirIncluded(compiled, 'foo/bar')).toBe(false)
      // Files under the excluded subtree drop out of both forms.
      expect(isPathIncluded(compiled, 'foo/bar/index.js')).toBe(false)
      expect(isDirIncluded(compiled, 'foo/bar/lib')).toBe(false)
    })
  })

  describe('filterPaths (batch form)', () => {
    test('applies ordered toggle over a list, preserving list order', () => {
      const compiled = compilePatterns([
        '!node_modules/**',
        'node_modules/keep/**',
      ])
      expect(
        filterPaths(compiled, [
          'src/handler.js',
          'node_modules/drop/index.js',
          'node_modules/keep/index.js',
        ]),
      ).toEqual(['src/handler.js', 'node_modules/keep/index.js'])
    })

    test('agrees with isPathIncluded on every path', () => {
      const compiled = compilePatterns([
        'assets/**',
        '!assets/secret.txt',
        '!**/*.map',
      ])
      const paths = [
        'assets/logo.png',
        'assets/secret.txt',
        'dist/handler.js.map',
        'dist/handler.js',
      ]
      expect(filterPaths(compiled, paths)).toEqual(
        paths.filter((p) => isPathIncluded(compiled, p)),
      )
    })
  })
})
