import { describe, expect, it } from '@jest/globals'
import Ajv from 'ajv'
import normalizeAjvErrors from '../../../../../lib/classes/config-schema-handler/normalize-ajv-errors.js'

const additionalPropertyError = (instancePath, additionalProperty) => ({
  keyword: 'additionalProperties',
  instancePath,
  schemaPath: '#/additionalProperties',
  params: { additionalProperty },
  message: 'must NOT have additional properties',
})

const messagesOf = (errors) => normalizeAjvErrors(errors).map((e) => e.message)

const messagesFor = (schema, data) => {
  const ajv = new Ajv({ allErrors: true, verbose: true, strict: false })
  const validate = ajv.compile(schema)
  validate(data)
  return normalizeAjvErrors(validate.errors).map(({ message }) => message)
}

describe('normalizeAjvErrors', () => {
  it('points an `entry` on a functions entry to webApps', () => {
    expect(
      messagesOf([additionalPropertyError('/functions/hello', 'entry')]),
    ).toEqual([
      "at 'functions.hello': unrecognized property 'entry'. To run an HTTP server, define it under webApps.",
    ])
  })

  it('leaves other unrecognized function properties unchanged', () => {
    expect(
      messagesOf([additionalPropertyError('/functions/hello', 'entryPoint')]),
    ).toEqual(["at 'functions.hello': unrecognized property 'entryPoint'"])
  })

  it('leaves `entry` elsewhere unchanged', () => {
    expect(
      messagesOf([
        additionalPropertyError('/functions/hello/events/0/http', 'entry'),
      ]),
    ).toEqual([
      "at 'functions.hello.events.0.http': unrecognized property 'entry'",
    ])
  })

  it('appends the accepted values to a webApps rateLimit enum error', () => {
    expect(
      messagesOf([
        {
          keyword: 'enum',
          instancePath: '/webApps/api/url/rateLimit',
          schemaPath: '#/enum',
          params: { allowedValues: [0, 100, 2000] },
          message: 'must be equal to one of the allowed values',
        },
      ]),
    ).toEqual([
      "at 'webApps.api.url.rateLimit': must be equal to one of the allowed values. Lambda accepts 0, 100 to 1000 in steps of 100, and 2000 to 10000 in steps of 1000; supported values can vary by Region, see https://docs.aws.amazon.com/lambda/latest/dg/web-functions-scaling.html",
    ])
  })

  it('names the supported versions for a webApps runtime pattern error', () => {
    expect(
      messagesOf([
        {
          keyword: 'pattern',
          instancePath: '/webApps/api/runtime',
          schemaPath: '#/pattern',
          params: { pattern: '^nodejs(2[4-9])\\.x$' },
          message: 'must match pattern "^nodejs(2[4-9])\\.x$"',
        },
      ]),
    ).toEqual([
      "at 'webApps.api.runtime': must be nodejs24.x or newer (nodejsNN.x)",
    ])
  })

  it('leaves other pattern errors unchanged', () => {
    expect(
      messagesOf([
        {
          keyword: 'pattern',
          instancePath: '/webApps/api/name',
          schemaPath: '#/pattern',
          params: { pattern: '^a$' },
          message: 'must match pattern "^a$"',
        },
      ]),
    ).toEqual(['at \'webApps.api.name\': must match pattern "^a$"'])
  })

  const schema = {
    type: 'object',
    properties: { kind: { type: 'string' }, value: { type: 'object' } },
    if: { properties: { kind: { const: 'open' } } },
    then: { properties: { value: { required: ['id'] } } },
    else: { properties: { value: { additionalProperties: false } } },
  }

  it('reports the else branch error without the "if" error', () => {
    expect(messagesFor(schema, { kind: 'closed', value: { foo: 1 } })).toEqual([
      "at 'value': unrecognized property 'foo'",
    ])
  })

  it('reports the then branch error without the "if" error', () => {
    expect(messagesFor(schema, { kind: 'open', value: {} })).toEqual([
      "at 'value': must have required property 'id'",
    ])
  })
})
