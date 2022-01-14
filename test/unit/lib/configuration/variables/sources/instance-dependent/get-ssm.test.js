'use strict';

const { expect } = require('chai');

const resolveMeta = require('../../../../../../../lib/configuration/variables/resolve-meta');
const resolve = require('../../../../../../../lib/configuration/variables/resolve');
const selfSource = require('../../../../../../../lib/configuration/variables/sources/self');
const getSsmSource = require('../../../../../../../lib/configuration/variables/sources/instance-dependent/get-ssm');

const allowedRegionTypes = new Set(['undefined', 'string']);

describe('test/unit/lib/configuration/variables/sources/instance-dependent/get-ssm.test.js', () => {
  let configuration;
  let variablesMeta;
  let serverlessInstance;

  before(async () => {
    configuration = {
      service: 'foo',
      provider: { name: 'aws' },
      custom: {
        existing: '${ssm:existing}',
        existingInRegion: '${ssm(eu-west-1):existing}',
        existingList: '${ssm:existingList}',
        existingListRaw: '${ssm(raw):existingList}',
        secretManager: '${ssm:/aws/reference/secretsmanager/existing}',
        existingEncrypted: '${ssm:/secret/existing}',
        encryptedWithSkipDecrypt: '${ssm(noDecrypt):/secret/existing}',
        encryptedWithSkipDecryptAndRegion: '${ssm(noDecrypt, eu-west-1):/secret/existing}',
        existingEncryptedDirect: '${ssm:/secret/direct}',
        existingEncryptedRaw: '${ssm(raw):/aws/reference/secretsmanager/existing}',
        notExisting: '${ssm:notExisting, null}',
        missingAddress: '${ssm:}',
        nonStringAddress: '${ssm:${self:custom.someObject}}',
        someObject: {},
      },
    };
    variablesMeta = resolveMeta(configuration);

    serverlessInstance = {
      getProvider: () => ({
        request: async (name, method, { Name, WithDecryption }, { region }) => {
          if (!allowedRegionTypes.has(typeof region)) throw new Error('Invalid region value');
          if (Name === 'existing') {
            return { Parameter: { Type: 'String', Value: region || 'value' } };
          }
          if (Name === 'existingList') {
            return { Parameter: { Type: 'StringList', Value: 'one,two,three' } };
          }
          if (Name === '/secret/existing' || Name === '/aws/reference/secretsmanager/existing') {
            return {
              Parameter: {
                Type: 'SecureString',
                Value: WithDecryption ? '{"someSecret":"someValue"}' : 'ENCRYPTED',
              },
            };
          }
          if (Name === '/secret/direct') {
            return {
              Parameter: {
                Type: 'SecureString',
                Value: WithDecryption ? '12345678901234567890' : 'ENCRYPTED',
              },
            };
          }
          if (Name === 'notExisting') {
            throw Object.assign(
              new Error(
                'ParameterNotFound: An error occurred ' +
                  '(ParameterNotFound) when referencing Secrets Manager'
              ),
              {
                code: 'AWS_S_S_M_GET_PARAMETER_PARAMETER_NOT_FOUND',
              }
            );
          }
          throw new Error('Unexpected call');
        },
      }),
    };

    await resolve({
      serviceDir: process.cwd(),
      configuration,
      variablesMeta,
      sources: { self: selfSource, ssm: getSsmSource(serverlessInstance) },
      options: {},
      fulfilledSources: new Set(['cf', 'self']),
    });
  });

  it('should resolve existing string param', () => {
    if (variablesMeta.get('custom\0existing')) throw variablesMeta.get('custom\0existing').error;
    expect(configuration.custom.existing).to.equal('value');
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
    expect(configuration.custom.existingListRaw).to.equal('one,two,three');
  });

  it('should resolve existing encrypted AWS secret manager data', () => {
    if (variablesMeta.get('custom\0secretManager')) {
      throw variablesMeta.get('custom\0secretManager').error;
    }
    expect(configuration.custom.secretManager).to.deep.equal({ someSecret: 'someValue' });
  });

  it('should resolve existing encrypted data', () => {
    if (variablesMeta.get('custom\0existingEncrypted')) {
      throw variablesMeta.get('custom\0existingEncrypted').error;
    }
    if (variablesMeta.get('custom\0existingDirect')) {
      throw variablesMeta.get('custom\0existingDirect').error;
    }
    if (variablesMeta.get('custom\0encryptedWithSkipDecrypt')) {
      throw variablesMeta.get('custom\0encryptedWithSkipDecrypt').error;
    }
    if (variablesMeta.get('custom\0encryptedWithSkipDecryptAndRegion')) {
      throw variablesMeta.get('custom\0encryptedWithSkipDecrypt').error;
    }
    expect(configuration.custom.existingEncrypted).to.deep.equal({ someSecret: 'someValue' });
    expect(configuration.custom.existingEncryptedDirect).to.equal('12345678901234567890');
    expect(configuration.custom.encryptedWithSkipDecrypt).to.equal('ENCRYPTED');
    expect(configuration.custom.encryptedWithSkipDecryptAndRegion).to.equal('ENCRYPTED');
  });

  it('should support "raw" output for decrypted data', () => {
    if (variablesMeta.get('custom\0existingEncryptedRaw')) {
      throw variablesMeta.get('custom\0existingEncryptedRaw').error;
    }
    expect(configuration.custom.existingEncryptedRaw).to.equal('{"someSecret":"someValue"}');
  });

  it('should resolve existing output in specific region', () => {
    if (variablesMeta.get('custom\0existingInRegion')) {
      throw variablesMeta.get('custom\0existingInRegion').error;
    }
    expect(configuration.custom.existingInRegion).to.equal('eu-west-1');
  });

  it('should resolve null on missing param', () => {
    if (variablesMeta.get('custom\0notExisting')) {
      throw variablesMeta.get('custom\0notExisting').error;
    }
    expect(configuration.custom.notExisting).to.equal(null);
  });

  it('should report with an error missing address', () =>
    expect(variablesMeta.get('custom\0missingAddress').error.code).to.equal(
      'VARIABLE_RESOLUTION_ERROR'
    ));

  it('should report with an error a non-string address', () =>
    expect(variablesMeta.get('custom\0nonStringAddress').error.code).to.equal(
      'VARIABLE_RESOLUTION_ERROR'
    ));
});
