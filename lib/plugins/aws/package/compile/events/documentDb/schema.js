'use strict';

/**
 * @type {import("ajv").JSONSchemaType<any>}
 */
const schema = {
  type: 'object',
  properties: {
    cluster: { type: 'string', pattern: 'arn:aws:rds:.*:\\d{12}:cluster:.*-.*' },
    auth: { const: 'BASIC_AUTH' },
    batchSize: { type: 'integer', minimum: 1, maximum: 10000 },
    batchWindow: { type: 'integer', minimum: 0, maximum: 300 },
    collection: { type: 'string', maxLength: 57 },
    db: { type: 'string', maxLength: 63 },
    document: { type: 'string', enum: ['Default', 'UpdateLookup'] },
    enabled: { type: 'boolean' },
    smk: {
      type: 'string',
      pattern: 'arn:[a-z-]+:secretsmanager:[a-z0-9-]+:\\d+:secret:[A-Za-z0-9/_+=.@-]+',
    },
    startingPosition: { enum: ['LATEST', 'TRIM_HORIZON', 'AT_TIMESTAMP'] },
  },
  required: ['cluster', 'db', 'smk'],
  additionalProperties: false,
};

module.exports = schema;
