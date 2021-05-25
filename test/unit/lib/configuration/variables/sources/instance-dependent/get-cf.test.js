'use strict';

const { expect } = require('chai');

const resolveMeta = require('../../../../../../../lib/configuration/variables/resolve-meta');
const resolve = require('../../../../../../../lib/configuration/variables/resolve');
const selfSource = require('../../../../../../../lib/configuration/variables/sources/self');
const getCfSource = require('../../../../../../../lib/configuration/variables/sources/instance-dependent/get-cf');

describe('test/unit/lib/configuration/variables/sources/instance-dependent/get-cf.test.js', () => {
  let configuration;
  let variablesMeta;
  let serverlessInstance;

  before(async () => {
    configuration = {
      service: 'foo',
      provider: { name: 'aws' },
      custom: {
        existing: '${cf:existing.someOutput}',
        existingInRegion: '${cf(eu-west-1):existing.someOutput}',
        noOutput: '${cf:existing.unrecognizedOutput, null}',
        noStack: '${cf:notExisting.someOutput, null}',
        missingAddress: '${cf:}',
        invalidAddress: '${cf:invalid}',
        nonStringAddress: '${cf:${self:custom.someObject}}',
        someObject: {},
      },
    };
    variablesMeta = resolveMeta(configuration);

    serverlessInstance = {
      getProvider: () => ({
        request: async (name, method, { StackName }, { region }) => {
          if (StackName === 'existing') {
            return {
              Stacks: [
                { Outputs: [{ OutputKey: 'someOutput', OutputValue: region || 'someValue' }] },
              ],
            };
          }
          if (StackName === 'notExisting') {
            throw Object.assign(new Error('Stack with id not-existing does not exist'), {
              code: 'AWS_CLOUD_FORMATION_DESCRIBE_STACKS_VALIDATION_ERROR',
            });
          }
          throw new Error('Unexpected call');
        },
      }),
    };

    await resolve({
      serviceDir: process.cwd(),
      configuration,
      variablesMeta,
      sources: { self: selfSource, cf: getCfSource(serverlessInstance) },
      options: {},
      fulfilledSources: new Set(['cf', 'self']),
    });
  });

  it('should resolve existing output', () => {
    if (variablesMeta.get('custom\0existing')) throw variablesMeta.get('custom\0existing').error;
    expect(configuration.custom.existing).to.equal('someValue');
  });
  it('should resolve existing output in specific region', () => {
    if (variablesMeta.get('custom\0existingInRegion')) {
      throw variablesMeta.get('custom\0existingInRegion').error;
    }
    expect(configuration.custom.existingInRegion).to.equal('eu-west-1');
  });
  it('should resolve null on missing output', () => {
    if (variablesMeta.get('custom\0noOutput')) throw variablesMeta.get('custom\0noOutput').error;
    expect(configuration.custom.noOutput).to.equal(null);
  });
  it('should resolve null on missing stack', () => {
    if (variablesMeta.get('custom\0noStack')) throw variablesMeta.get('custom\0noStack').error;
    expect(configuration.custom.noStack).to.equal(null);
  });

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
