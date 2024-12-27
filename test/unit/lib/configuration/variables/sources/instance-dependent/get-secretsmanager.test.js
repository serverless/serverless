'use strict';

const { expect } = require('chai');

const resolveMeta = require('../../../../../../../lib/configuration/variables/resolve-meta');
const resolve = require('../../../../../../../lib/configuration/variables/resolve');
const selfSource = require('../../../../../../../lib/configuration/variables/sources/self');
const getSecretsManagerSource = require('../../../../../../../lib/configuration/variables/sources/instance-dependent/get-secretsmanager');

const allowedRegionTypes = new Set(['undefined', 'string']);

describe('test/unit/lib/configuration/variables/sources/instance-dependent/get-secretsmanager.test.js', () => {
  let configuration;
  let variablesMeta;
  let serverlessInstance;

  before(async () => {
    configuration = {
      service: 'foo',
      provider: { name: 'aws' },
      custom: {
        existing: '${secretsmanager:existing}',
        existingInRegion: '${secretsmanager(us-west-2):existing}',
        existingList: '${secretsmanager:existingList}',
        existingListRaw: '${secretsmanager(raw):existingList}',
        existingFullArn:
          '${secretsmanager:arn:aws:secretsmanager:us-west-2:123456789012:secret:existing-a1b2c3}',
        existingJSON: '${secretsmanager:existingJSON}',
        existingJSONRaw: '${secretsmanager(raw):existingJSON}',
        existingVersionId:
          '${secretsmanager(versionId=EXAMPLE1-90ab-cdef-fedc-ba987SECRET1):existing}',
        existingVersionStage: '${secretsmanager(versionStage=AWSCURRENT):existing}',
        existingVersionIdAndStage:
          '${secretsmanager(versionId=EXAMPLE1-90ab-cdef-fedc-ba987SECRET1, versionStage=AWSCURRENT):existing}',
        notExisting: '${secretsmanager:notExisting, null}',
        existingSecretBinary: '${secretsmanager:existingSecretBinary}',
        missingAddress: '${secretsmanager:}',
        nonStringAddress: '${secretsmanager:${self:custom.someObject}}',
        someObject: {},
      },
    };
    variablesMeta = resolveMeta(configuration);

    serverlessInstance = {
      getProvider: () => ({
        request: async (name, method, { SecretId, VersionId, VersionStage }, { region }) => {
          if (!allowedRegionTypes.has(typeof region)) throw new Error('Invalid region value');
          if (
            SecretId === 'existing' ||
            SecretId === 'arn:aws:secretsmanager:us-west-2:123456789012:secret:existing-a1b2c3'
          ) {
            return {
              ARN: 'arn:aws:secretsmanager:us-west-2:123456789012:secret:existing-a1b2c3',
              Name: 'existing',
              VersionId: VersionId || 'EXAMPLE1-90ab-cdef-fedc-ba987SECRET1',
              SecretString: 'secretString',
              VersionStages: VersionStage ? [VersionStage] : ['AWSCURRENT'],
            };
          }
          if (SecretId === 'existingList') {
            return {
              ARN: 'arn:aws:secretsmanager:us-west-2:123456789012:secret:existingList-a1b2c3',
              Name: 'existingList',
              VersionId: VersionId || 'EXAMPLE1-90ab-cdef-fedc-ba987SECRET1',
              SecretString: JSON.stringify(['one', 'two', 'three']),
              VersionStages: VersionStage ? [VersionStage] : ['AWSCURRENT'],
            };
          }
          if (SecretId === 'existingJSON') {
            return {
              ARN: 'arn:aws:secretsmanager:us-west-2:123456789012:secret:existingJSON-a1b2c3',
              Name: 'existingJSON',
              VersionId: VersionId || 'EXAMPLE1-90ab-cdef-fedc-ba987SECRET1',
              SecretString: JSON.stringify({ someSecret: 'someValue' }),
              VersionStages: VersionStage ? [VersionStage] : ['AWSCURRENT'],
            };
          }
          if (SecretId === 'existingSecretBinary') {
            return {
              ARN: 'arn:aws:secretsmanager:us-west-2:123456789012:secret:existingSecretBinary-a1b2c3',
              Name: 'existingSecretBinary',
              VersionId: VersionId || 'EXAMPLE1-90ab-cdef-fedc-ba987SECRET1',
              SecretBinary: Buffer.from('secretBinary').toString('base64'),
              VersionStages: VersionStage ? [VersionStage] : ['AWSCURRENT'],
            };
          }
          if (SecretId === 'notExisting') {
            throw Object.assign(
              new Error(
                'InvalidParameterException: An error occurred ' +
                  '(InvalidParameterException) when referencing Secrets Manager'
              ),
              {
                code: 'AWS_SECRETS_MANAGER_GET_SECRET_VALUE_INVALID_PARAMETER_EXCEPTION',
              }
            );
          }
          throw new Error(
            `Unexpected call: SecretId=${SecretId}, VersionId=${VersionId}, VersionStage=${VersionStage}`
          );
        },
      }),
    };

    await resolve({
      serviceDir: process.cwd(),
      configuration,
      variablesMeta,
      sources: { self: selfSource, secretsmanager: getSecretsManagerSource(serverlessInstance) },
      options: {},
      fulfilledSources: new Set(['cf', 'self']),
    });
  });

  it('should resolve existing string param', () => {
    if (variablesMeta.get('custom\0existing')) throw variablesMeta.get('custom\0existing').error;
    expect(configuration.custom.existing).to.equal('secretString');
  });

  it('should resolve existing string param with region', () => {
    if (variablesMeta.get('custom\0existingInRegion')) {
      throw variablesMeta.get('custom\0existingInRegion').error;
    }
    expect(configuration.custom.existingInRegion).to.equal('secretString');
  });

  it('should resolve existing string list param', () => {
    if (variablesMeta.get('custom\0existingList')) {
      throw variablesMeta.get('custom\0existingList').error;
    }
    expect(configuration.custom.existingList).to.deep.equal(['one', 'two', 'three']);
  });

  it('should support "raw" output for list param', () => {
    if (variablesMeta.get('custom\0existingListRaw')) {
      throw variablesMeta.get('custom\0existingListRaw').error;
    }
    expect(configuration.custom.existingListRaw).to.equal('["one","two","three"]');
  });

  it('should resolve existing string param with full ARN', () => {
    if (variablesMeta.get('custom\0existingFullArn')) {
      throw variablesMeta.get('custom\0existingFullArn').error;
    }
    expect(configuration.custom.existingFullArn).to.equal('secretString');
  });

  it('should resolve existing JSON param', () => {
    if (variablesMeta.get('custom\0existingJSON')) {
      throw variablesMeta.get('custom\0existingJSON').error;
    }
    expect(configuration.custom.existingJSON).to.deep.equal({ someSecret: 'someValue' });
  });

  it('should support "raw" output for JSON param', () => {
    if (variablesMeta.get('custom\0existingJSONRaw')) {
      throw variablesMeta.get('custom\0existingJSONRaw').error;
    }
    expect(configuration.custom.existingJSONRaw).to.equal('{"someSecret":"someValue"}');
  });

  it('should resolve existing with versionId param', () => {
    if (variablesMeta.get('custom\0existingVersionId')) {
      throw variablesMeta.get('custom\0existingVersionId').error;
    }
    expect(configuration.custom.existingVersionId).to.equal('secretString');
  });

  it('should resolve existing with versionStage param', () => {
    if (variablesMeta.get('custom\0existingVersionStage')) {
      throw variablesMeta.get('custom\0existingVersionStage').error;
    }
    expect(configuration.custom.existingVersionStage).to.equal('secretString');
  });

  it('should resolve existing with versionStage and versionId param', () => {
    if (variablesMeta.get('custom\0existingVersionIdAndStage')) {
      throw variablesMeta.get('custom\0existingVersionIdAndStage').error;
    }
    expect(configuration.custom.existingVersionStage).to.equal('secretString');
  });

  it('should resolve with secret binary', () => {
    if (variablesMeta.get('custom\0existingSecretBinary')) {
      throw variablesMeta.get('custom\0existingSecretBinary').error;
    }
    expect(configuration.custom.existingSecretBinary).to.equal('secretBinary');
  });

  it('should report an error when not existing param', () => {
    expect(variablesMeta.get('custom\0notExisting').error.code).to.equal(
      'VARIABLE_RESOLUTION_ERROR'
    );
    expect(variablesMeta.get('custom\0notExisting').error.message).to.contain(
      'Error: InvalidParameterException: An error occurred (InvalidParameterException) when referencing Secrets Manager'
    );
  });

  it('should report an error with missing address', () => {
    expect(variablesMeta.get('custom\0missingAddress').error.code).to.equal(
      'VARIABLE_RESOLUTION_ERROR'
    );
    expect(variablesMeta.get('custom\0missingAddress').error.message).to.contain(
      'Missing address argument in variable "secretsmanager" source'
    );
  });

  it('should report an error with non-string address', () => {
    expect(variablesMeta.get('custom\0nonStringAddress').error.code).to.equal(
      'VARIABLE_RESOLUTION_ERROR'
    );
    expect(variablesMeta.get('custom\0nonStringAddress').error.message).to.contain(
      'Non-string address argument in variable "secretsmanager" source'
    );
  });
});
