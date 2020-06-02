'use strict';

const { expect } = require('chai');
const resolveCliInput = require('./resolveCliInput');

describe('#resolveCliInput', () => {
  it('Should crash on multiple config paths', () => {
    expect(() => resolveCliInput('--config world --config hello')).to.throw(
      /Expected single value/
    );
    expect(() => resolveCliInput('--config world --c hello')).to.throw(/Expected single value/);
    expect(() => resolveCliInput('--c world --c hello')).to.throw(/Expected single value/);
  });
  it('Should resole singular config', () => {
    expect(resolveCliInput('--config world').options.config).to.equal('world');
  });
});
