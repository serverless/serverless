'use strict';

const { expect } = require('chai');

const resolveMeta = require('../../../../../../lib/configuration/variables/resolve-meta');
const resolve = require('../../../../../../lib/configuration/variables/resolve');
const selfSource = require('../../../../../../lib/configuration/variables/sources/self');

describe('test/unit/lib/configuration/variables/sources/self.test.js', () => {
  it('should resolve "self" sources', async () => {
    const configuration = {
      nest: {
        prop1: '${self:nest2.prop}',
        prop2: 'bar',
        prop3: '${self:nest.prop2}',
      },
      nest2: {
        prop: 'nest2',
        otherProp: '${self:nest.prop2}',
      },
      full: '${self:nest}',
      nonExisting: '${self:hola.mola}',
    };
    await resolve({
      serviceDir: process.cwd(),
      configuration,
      variablesMeta: resolveMeta(configuration),
      sources: { self: selfSource },
      options: {},
      fulfilledSources: new Set(['self']),
    });

    expect(configuration).to.deep.equal({
      nest: {
        prop1: 'nest2',
        prop2: 'bar',
        prop3: 'bar',
      },
      nest2: {
        prop: 'nest2',
        otherProp: 'bar',
      },
      full: {
        prop1: 'nest2',
        prop2: 'bar',
        prop3: 'bar',
      },
      nonExisting: '${self:hola.mola}',
    });
  });

  it('should reject cicular reference', async () => {
    const configuration = { foo: '${self:}' };
    const variablesMeta = resolveMeta(configuration);
    await resolve({
      serviceDir: process.cwd(),
      configuration,
      variablesMeta,
      sources: { self: selfSource },
      options: {},
      fulfilledSources: new Set(['self']),
    });
    expect(configuration).to.deep.equal({ foo: '${self:}' });
    expect(variablesMeta.get('foo').error.code).to.equal('VARIABLE_RESOLUTION_ERROR');
  });
});
