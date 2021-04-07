'use strict';

const { expect } = require('chai');

const resolveMeta = require('../../../../../lib/configuration/variables/resolve-meta');
const isPropertyResolved = require('../../../../../lib/configuration/variables/is-property-resolved');

describe('test/unit/lib/configuration/variables/is-property-resolved.test.js', () => {
  let variablesMeta;
  before(() => {
    variablesMeta = resolveMeta({
      root: '${a:}',
      childParent: { child: '${a:}', ok: true },
      parent: '${a:}',
      rooto: 'foo',
    });
  });
  it('should match property directly', () => {
    expect(isPropertyResolved(variablesMeta, 'root')).to.be.false;
    expect(isPropertyResolved(variablesMeta, 'childParent\0child')).to.be.false;
  });
  it('should match if children are behind variables', () => {
    expect(isPropertyResolved(variablesMeta, 'childParent')).to.be.false;
  });
  it('should match if parent is behind variables', () => {
    expect(isPropertyResolved(variablesMeta, 'parent\0parentChild')).to.be.false;
  });
  it('should not match not affected', () => {
    expect(isPropertyResolved(variablesMeta, 'rooto')).to.be.true;
    expect(isPropertyResolved(variablesMeta, 'childParent\0ok')).to.be.true;
  });
  it('should not match not existing', () => {
    expect(isPropertyResolved(variablesMeta, 'elo')).to.be.true;
    expect(isPropertyResolved(variablesMeta, 'childParent\0none')).to.be.true;
  });
});
