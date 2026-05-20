import { describe, beforeAll, it, expect } from '@jest/globals'
import Ajv from 'ajv'
import schema from '../../../../../lib/config-schema.js'

/**
 * Regression tests pinning down the CURRENT shape of the top-level `useDotenv`
 * schema entry (BC-7). Before this file existed there was zero direct schema-
 * validation coverage for `useDotenv` — the only tests that touched it
 * (packages/serverless/test/unit/lib/plugins/package/lib/package-service.test.js)
 * bypass the schema by setting `serverless.configurationInput` directly.
 *
 * The assertions below describe today's behavior (`const: true`). When the
 * schema is widened to accept strings/arrays in Commit 2 of the plan, the
 * accept/reject expectations will be flipped accordingly. Both versions of
 * this file must stay in lockstep with `config-schema.js`.
 *
 * The AJV options mirror those used by the runtime ConfigSchemaHandler in
 * `lib/classes/config-schema-handler/resolve-ajv-validate.js` so behavior
 * matches what a user would see at runtime.
 */
describe('config-schema useDotenv (BC-7)', () => {
  let validate

  beforeAll(() => {
    // Mirror the runtime AJV configuration used by ConfigSchemaHandler
    // (lib/classes/config-schema-handler/resolve-ajv-validate.js). `ajv-formats`
    // is intentionally omitted: the `useDotenv` subschema does not use any
    // string formats, and `addFormats` requires a different AJV setup than what
    // is exercised here.
    const ajv = new Ajv({
      allErrors: true,
      coerceTypes: 'array',
      verbose: true,
      strict: false,
      strictRequired: false,
    })
    validate = ajv.compile(schema.properties.useDotenv)
  })

  describe('accepted values (current schema is `const: true`)', () => {
    it('accepts true', () => {
      expect(validate(true)).toBe(true)
    })
  })

  describe('rejected values (current schema is `const: true`)', () => {
    it.each([
      ['false', false],
      ['number 0', 0],
      ['number 1', 1],
      ['empty string', ''],
      ['non-empty string', './shared'],
      ['empty array', []],
      ['array of strings', ['./a', '../b']],
      ['array with non-string', [true]],
      ['object', { path: './shared' }],
      ['null', null],
    ])('rejects %s', (_label, value) => {
      expect(validate(value)).toBe(false)
    })
  })
})
