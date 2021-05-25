'use strict';

const { expect } = require('chai');

const resolveMeta = require('../../../../../../../lib/configuration/variables/resolve-meta');
const resolve = require('../../../../../../../lib/configuration/variables/resolve');
const selfSource = require('../../../../../../../lib/configuration/variables/sources/self');
const getS3Source = require('../../../../../../../lib/configuration/variables/sources/instance-dependent/get-s3');

describe('test/unit/lib/configuration/variables/sources/instance-dependent/get-s3.test.js', () => {
  let configuration;
  let variablesMeta;
  let serverlessInstance;

  before(async () => {
    configuration = {
      service: 'foo',
      provider: { name: 'aws' },
      custom: {
        existing: '${s3:existing/someKey}',
        noKey: '${s3:existing/unrecognizedKey, null}',
        noBucket: '${s3:notExisting/someKey, null}',
        missingAddress: '${s3:}',
        invalidAddress: '${s3:invalid}',
        nonStringAddress: '${s3:${self:custom.someObject}}',
        someObject: {},
      },
    };
    variablesMeta = resolveMeta(configuration);

    serverlessInstance = {
      getProvider: () => ({
        request: async (name, method, { Bucket, Key }) => {
          if (Bucket === 'existing') {
            if (Key === 'someKey') return { Body: 'foo' };
            throw Object.assign(new Error('The specified key does not exist.'), {
              code: 'AWS_S3_GET_OBJECT_NO_SUCH_KEY',
            });
          }
          throw Object.assign(new Error('The specified bucket does not exist.'), {
            code: 'NoSuchBucket',
          });
        },
      }),
    };

    await resolve({
      serviceDir: process.cwd(),
      configuration,
      variablesMeta,
      sources: { self: selfSource, s3: getS3Source(serverlessInstance) },
      options: {},
      fulfilledSources: new Set(['s3', 'self']),
    });
  });

  it('should resolve existing output', () => {
    if (variablesMeta.get('custom\0existing')) throw variablesMeta.get('custom\0existing').error;
    expect(configuration.custom.existing).to.equal('foo');
  });

  it('should resolve null on missing key', () => {
    if (variablesMeta.get('custom\0noKey')) throw variablesMeta.get('custom\0noKey').error;
    expect(configuration.custom.noKey).to.equal(null);
  });
  it('should report with an error missing bucket', () =>
    expect(variablesMeta.get('custom\0noBucket').error.code).to.equal('VARIABLE_RESOLUTION_ERROR'));

  it('should report with an error missing address', () =>
    expect(variablesMeta.get('custom\0missingAddress').error.code).to.equal(
      'VARIABLE_RESOLUTION_ERROR'
    ));

  it('should report with an error invalid address', () =>
    expect(variablesMeta.get('custom\0invalidAddress').error.code).to.equal(
      'VARIABLE_RESOLUTION_ERROR'
    ));

  it('should report with an error a non-string address', () =>
    expect(variablesMeta.get('custom\0nonStringAddress').error.code).to.equal(
      'VARIABLE_RESOLUTION_ERROR'
    ));
});
