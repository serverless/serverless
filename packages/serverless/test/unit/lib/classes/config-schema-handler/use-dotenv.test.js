import { describe, beforeAll, it, expect } from '@jest/globals'
import Ajv from 'ajv'
import schema from '../../../../../lib/config-schema.js'

/**
 * Schema tests for the top-level `useDotenv` config entry: accepts `true`,
 * `false`, a non-empty path string, or a non-empty array of non-empty path
 * strings. The `false` and `true` branches use `const` (value equality) so
 * the literal boolean reaches the loader unmutated — important because the
 * loader uses strict equality (`useDotenv === false`) to recognize the
 * explicit opt-out.
 *
 * The AJV options mirror those used by the runtime ConfigSchemaHandler in
 * `lib/classes/config-schema-handler/resolve-ajv-validate.js`. In particular
 * `coerceTypes: 'array'` is preserved, which means a handful of non-string
 * scalars (numbers, etc.) still get silently coerced to strings during
 * validation — see "coercion-driven acceptance" below. The loader treats
 * those coerced strings as path entries; nonexistent paths are silently
 * skipped, so the practical effect is harmless.
 *
 * `ajv-formats` is intentionally omitted: the `useDotenv` subschema does not
 * use any string formats, and `addFormats` requires additional AJV options.
 */
describe('config-schema useDotenv', () => {
  let validate

  beforeAll(() => {
    const ajv = new Ajv({
      allErrors: true,
      coerceTypes: 'array',
      verbose: true,
      strict: false,
      strictRequired: false,
    })
    validate = ajv.compile(schema.properties.useDotenv)
  })

  describe('accepted values', () => {
    it('accepts true', () => {
      expect(validate(true)).toBe(true)
    })

    it('accepts false (the explicit opt-out)', () => {
      // The loader uses strict equality on the boolean to skip all loading.
      // Verify here that the value reaches validate() unmutated — i.e. the
      // `{ const: false }` branch matches before any `type: 'string'` branch
      // gets a chance to coerce.
      const wrap = { v: false }
      const wrapValidator = new Ajv({
        allErrors: true,
        coerceTypes: 'array',
        verbose: true,
        strict: false,
        strictRequired: false,
      }).compile({
        type: 'object',
        properties: { v: schema.properties.useDotenv },
      })
      expect(wrapValidator(wrap)).toBe(true)
      expect(wrap.v).toBe(false)
    })

    it('accepts a non-empty path string', () => {
      expect(validate('./shared')).toBe(true)
    })

    it('accepts a path with parent traversal', () => {
      expect(validate('../shared/.env')).toBe(true)
    })

    it('accepts a non-empty array of path strings', () => {
      expect(validate(['./a', '../b'])).toBe(true)
    })
  })

  describe('rejected values', () => {
    it.each([
      ['empty string', ''],
      ['empty array', []],
      ['null', null],
      ['plain object', { path: './shared' }],
    ])('rejects %s', (_label, value) => {
      expect(validate(value)).toBe(false)
    })
  })

  // Document the behavior AJV's coerceTypes: 'array' imposes. These values
  // would ideally be rejected (they are not literally true, false, strings,
  // or string arrays) but the runtime AJV configuration coerces them to
  // strings before validating. They become "paths" that don't exist on disk,
  // and the loader silently skips missing paths — so the practical effect
  // is the same as `useDotenv: true`.
  describe('coercion-driven acceptance (documented runtime behavior)', () => {
    it.each([
      ['number 0 (coerced to "0")', 0],
      ['number 1 (coerced to "1")', 1],
      ['array with boolean (coerced to ["true"])', [true]],
    ])('accepts %s due to coerceTypes: array', (_label, value) => {
      expect(validate(value)).toBe(true)
    })
  })
})
