'use strict';

const { expect } = require('chai');

const path = require('path');
const resolve = require('../../../../../../lib/configuration/variables/resolve');
const resolveMeta = require('../../../../../../lib/configuration/variables/resolve-meta');

const selfSource = require('../../../../../../lib/configuration/variables/sources/self');
const mergeSource = require('../../../../../../lib/configuration/variables/sources/merge');

describe('test/unit/lib/configuraiton/variables/sources/merge.test.js', () => {
  const serviceDir = path.resolve(__dirname, 'fixture');
  let configuration;
  let variablesMeta;

  before(async () => {
    configuration = {
      list1: ['a', 'b'],
      list2: [{ c: 'd' }, ['e']],
      listTest: '${merge(${self:list1}, ${self:list2})}',

      obj1: { a: 'b' },
      obj2: { c: 'd' },
      objTest: '${merge(${self:obj1}, ${self:obj2})}',

      duplicate: '${merge(${self:obj1}, ${self:obj1})}',

      empty: '${merge()}',

      notObjects: '${merge(1,2)}',
    };

    variablesMeta = resolveMeta(configuration);
    await resolve({
      serviceDir,
      configuration,
      variablesMeta,
      sources: { self: selfSource, merge: mergeSource },
      options: {},
      fulfilledSources: new Set(['self', 'merge']),
    });
  });

  it('should merge lists by concatenation', () => {
    expect(configuration.listTest).to.deep.equal(['a', 'b', { c: 'd' }, ['e']]);
  });

  it('should merge objects', () => {
    expect(configuration.objTest).to.deep.equal({ a: 'b', c: 'd' });
  });

  it('should raise an error for duplicate object keys', () => {
    expect(variablesMeta.get('duplicate').error.code).to.equal('VARIABLE_RESOLUTION_ERROR');
  });

  it('should raise an error for empty merge', () => {
    expect(variablesMeta.get('empty').error.code).to.equal('VARIABLE_RESOLUTION_ERROR');
  });

  it('should raise an error when merged items are not objects or arrays', () => {
    expect(variablesMeta.get('notObjects').error.code).to.equal('VARIABLE_RESOLUTION_ERROR');
  });
});
