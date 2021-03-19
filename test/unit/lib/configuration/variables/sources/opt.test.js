'use strict';

const { expect } = require('chai');

const resolveMeta = require('../../../../../../lib/configuration/variables/resolve-meta');
const resolve = require('../../../../../../lib/configuration/variables/resolve');
const selfSource = require('../../../../../../lib/configuration/variables/sources/self');
const optSource = require('../../../../../../lib/configuration/variables/sources/opt');

describe('test/unit/lib/configuration/variables/sources/opt.test.js', () => {
  let configuration;
  let variablesMeta;
  before(async () => {
    configuration = {
      opt: '${opt:foobar}',
      optBool: '${opt:bool}',
      optMissing: "${opt:missing, 'fallback'}",
      noAddress: '${opt:}',
      nonStringAddress: '${opt:${self:someObject}}',
      someObject: {},
    };
    variablesMeta = resolveMeta(configuration);
    await resolve({
      servicePath: process.cwd(),
      configuration,
      variablesMeta,
      sources: { opt: optSource, self: selfSource },
      options: { foobar: 'elo', bool: false },
      fulfilledSources: new Set(['opt']),
    });
  });

  it('should resolve string option', () => expect(configuration.opt).to.equal('elo'));
  it('should resolve bool option', () => expect(configuration.optBool).to.equal(false));
  it('should resolve null on missing option', () =>
    expect(configuration.optMissing).to.equal('fallback'));

  it('should expose all options when no address is providerd', () =>
    expect(configuration.noAddress).to.deep.equal({ foobar: 'elo', bool: false }));

  it('should report with an error a non-string address argument', () =>
    expect(variablesMeta.get('nonStringAddress').error.code).to.equal('VARIABLE_RESOLUTION_ERROR'));
});
