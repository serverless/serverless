import { describe, beforeAll, it, expect } from '@jest/globals'
import Ajv from 'ajv'
import schema from '../../../../../lib/config-schema.js'

/**
 * Schema tests for the top-level `useDotenv` config entry: accepts `true`,
 * a non-empty path string, or a non-empty array of non-empty path strings.
 *
 * The AJV options mirror those used by the runtime ConfigSchemaHandler in
 * `lib/classes/config-schema-handler/resolve-ajv-validate.js`. In particular
 * `coerceTypes: 'array'` is preserved, which means a handful of non-string
 * scalars (false, numbers) get silently coerced to strings during validation
 * — see "coercion-driven acceptance" below. This is a deliberate trade-off:
 * the same coercion behavior applies to every other multi-type field in this
 * schema, and the loader treats nonexistent-path coercions as a silent skip,
 * so the user-visible effect is harmless.
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
  // would ideally be rejected (they are not literally true, strings, or
  // string arrays) but the runtime AJV configuration coerces them to strings
  // before validating. They become "paths" that don't exist on disk, and the
  // loader silently skips missing paths — so the practical effect is the
  // same as `useDotenv: true`.
  describe('coercion-driven acceptance (documented runtime behavior)', () => {
    it.each([
      ['false (coerced to "false")', false],
      ['number 0 (coerced to "0")', 0],
      ['number 1 (coerced to "1")', 1],
      ['array with boolean (coerced to ["true"])', [true]],
    ])('accepts %s due to coerceTypes: array', (_label, value) => {
      expect(validate(value)).toBe(true)
    })
  })
})
