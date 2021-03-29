'use strict';

const { expect } = require('chai');

const resolveMeta = require('../../../../../../../lib/configuration/variables/resolve-meta');
const resolve = require('../../../../../../../lib/configuration/variables/resolve');
const selfSource = require('../../../../../../../lib/configuration/variables/sources/self');
const getSsmSource = require('../../../../../../../lib/configuration/variables/sources/instance-dependent/get-ssm');

describe('test/unit/lib/configuration/variables/sources/instance-dependent/get-ssm.test.js', () => {
  let configuration;
  let variablesMeta;
  let serverlessInstance;

  describe('modern', () => {
    before(async () => {
      configuration = {
        service: 'foo',
        variablesResolutionMode: '20210326',
        provider: { name: 'aws' },
        custom: {
          existing: '${ssm:existing}',
          existingInRegion: '${ssm(eu-west-1):existing}',
          existingList: '${ssm:existingList}',
          existingEncrypted: '${ssm:/aws/reference/secretsmanager/existing}',
          notExisting: '${ssm:notExisting, null}',
          missingAddress: '${ssm:}',
          nonStringAddress: '${ssm:${self:custom.someObject}}',
          someObject: {},
        },
      };
      variablesMeta = resolveMeta(configuration);

      serverlessInstance = {
        getProvider: () => ({
          request: async (name, method, { Name }, { region }) => {
            if (Name === 'existing') {
              return { Parameter: { Type: 'String', Value: region || 'value' } };
            }
            if (Name === 'existingList') {
              return { Parameter: { Type: 'StringList', Value: 'one,two,three' } };
            }
            if (Name === '/aws/reference/secretsmanager/existing') {
              return { Parameter: { Type: 'SecureString', Value: '{"someSecret":"someValue"}' } };
            }
            if (Name === 'notExisting') {
              throw Object.assign(
                new Error(
                  'ParameterNotFound: An error occurred ' +
                    '(ParameterNotFound) when referencing Secrets Manager'
                ),
                {
                  code: 'ParameterNotFound',
                }
              );
            }
            throw new Error('Unexpected call');
          },
        }),
      };

      await resolve({
        servicePath: process.cwd(),
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

    it('should resolve existing encrypted data', () => {
      if (variablesMeta.get('custom\0existingEncrypted')) {
        throw variablesMeta.get('custom\0existingEncrypted').error;
      }
      expect(configuration.custom.existingEncrypted).to.deep.equal({ someSecret: 'someValue' });
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

  describe('legacy', () => {
    before(async () => {
      configuration = {
        service: 'foo',
        provider: { name: 'aws' },
        custom: {
          existing: '${ssm:existing}',
          existingWithSplit: '${ssm:existing~split}',
          existingList: '${ssm:existingList}',
          existingListWithSplit: '${ssm:existingList~split}',
          existingEncrypted: '${ssm:/aws/reference/secretsmanager/existing}',
          existingEncryptedWithDecrypt: '${ssm:/aws/reference/secretsmanager/existing~true}',
        },
      };
      variablesMeta = resolveMeta(configuration);

      serverlessInstance = {
        getProvider: () => ({
          request: async (name, method, { Name }, { region }) => {
            if (Name === 'existing') {
              return { Parameter: { Type: 'String', Value: region || 'value' } };
            }
            if (Name === 'existingList') {
              return { Parameter: { Type: 'StringList', Value: 'one,two,three' } };
            }
            if (Name === '/aws/reference/secretsmanager/existing') {
              return { Parameter: { Type: 'SecureString', Value: '{"someSecret":"someValue"}' } };
            }
            if (Name === 'notExisting') {
              throw Object.assign(
                new Error(
                  'ParameterNotFound: An error occurred ' +
                    '(ParameterNotFound) when referencing Secrets Manager'
                ),
                {
                  code: 'ParameterNotFound',
                }
              );
            }
            throw new Error('Unexpected call');
          },
        }),
      };

      await resolve({
        servicePath: process.cwd(),
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

    it('should abort if string param has "split" instruction', () => {
      expect(variablesMeta.get('custom\0existingWithSplit').error.code).to.equal(
        'VARIABLE_RESOLUTION_ERROR'
      );
    });

    it('should abort if string list param misses "split" instruction', () => {
      expect(variablesMeta.get('custom\0existingList').error.code).to.equal(
        'VARIABLE_RESOLUTION_ERROR'
      );
    });

    it('should resolve existing string list param', () => {
      if (variablesMeta.get('custom\0existingListWithSplit')) {
        throw variablesMeta.get('custom\0existingListWithSplit').error;
      }
      expect(configuration.custom.existingListWithSplit).to.deep.equal(['one', 'two', 'three']);
    });

    it('should abort if encrypted param misses "true" instruction', () => {
      expect(variablesMeta.get('custom\0existingEncrypted').error.code).to.equal(
        'VARIABLE_RESOLUTION_ERROR'
      );
    });

    it('should resolve existing encrypted data', () => {
      if (variablesMeta.get('custom\0existingEncryptedWithDecrypt')) {
        throw variablesMeta.get('custom\0existingEncryptedWithDecrypt').error;
      }
      expect(configuration.custom.existingEncryptedWithDecrypt).to.deep.equal({
        someSecret: 'someValue',
      });
    });
  });
});
