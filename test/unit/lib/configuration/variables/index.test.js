'use strict';

const { expect } = require('chai');

const fsp = require('fs').promises;
const resolve = require('../../../../../lib/configuration/variables');

describe('test/unit/lib/configuration/variables/index.test.js', () => {
  let configuration;
  before(async () => {
    process.env.ENV_SOURCE_TEST = 'foobar';
    await fsp.writeFile('foo.json', JSON.stringify({ json: 'content' }));
    configuration = {
      env: '${env:ENV_SOURCE_TEST}',
      file: '${file(foo.json)}',
      opt: '${opt:option}',
      self: '${self:opt}',
      strToBool: "${strToBool('false')}",
    };
    await resolve({
      serviceDir: process.cwd(),
      configuration,
      options: { option: 'bar' },
    });
  });

  after(() => {
    delete process.env.ENV_SOURCE_TEST;
  });

  it('should resolve "env" source', () => expect(configuration.env).to.equal('foobar'));
  it('should resolve "file" source', () =>
    expect(configuration.file).to.deep.equal({ json: 'content' }));
  it('should resolve "opt" source', () => expect(configuration.opt).to.equal('bar'));
  it('should resolve "self" source', () => expect(configuration.self).to.equal('bar'));
  it('should resolve "strToBool" source', () => expect(configuration.strToBool).to.equal(false));
});
