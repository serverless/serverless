'use strict';

const testUtils = require('../../../tests/utils');
const Serverless = require('../../../lib/Serverless');
const expect = require('chai').expect;
const writeFileSync = require('./writeFileSync');
const readFileSync = require('./readFileSync');

describe('#writeFile()', () => {
  let serverless;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.init();
  });

  it('should write a .json file asynchronously', () => {
    const tmpFilePath = testUtils.getTmpFilePath('anything.json');

    return writeFile(tmpFilePath, { foo: 'bar' })
      .then(() => readFile(tmpFilePath)).to.eventually.deep.equal({ foo: 'bar' });
  });

  it('should write a .yml file synchronously', () => {
    const tmpFilePath = testUtils.getTmpFilePath('anything.yml');

    return writeFile(tmpFilePath, { foo: 'bar' })
      .then(() => serverless.yamlParser.parse(tmpFilePath)).to.eventually.deep.equal({ foo: 'bar' });
  });

  it('should write a .yaml file synchronously', () => {
    const tmpFilePath = testUtils.getTmpFilePath('anything.yaml');

    return writeFile(tmpFilePath, { foo: 'bar' })
      .then(() => serverless.yamlParser.parse(tmpFilePath)).to.eventually.deep.equal({ foo: 'bar' });
  });

  it('should throw error if invalid path is provided', () => {
    return writeFile(null).to.eventually.throw(Error);
  });
});
