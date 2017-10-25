'use strict';

const testUtils = require('../../../tests/utils');
const Serverless = require('../../../lib/Serverless');
const chai = require('chai');
const writeFile = require('./writeFile');
const readFile = require('./readFile');

// Configure chai
chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));
const expect = require('chai').expect;

describe('#writeFile()', function () {
  let serverless;
  this.timeout(0);

  beforeEach(() => {
    serverless = new Serverless();
  });

  it('should write a .json file asynchronously', () => {
    const tmpFilePath = testUtils.getTmpFilePath('anything.json');
    return writeFile(tmpFilePath, { foo: 'bar' })
      .then(() => expect(readFile(tmpFilePath))
        .to.eventually.deep.equal({ foo: 'bar' }));
  });

  it('should write a .yml file synchronously', () => {
    const tmpFilePath = testUtils.getTmpFilePath('anything.yml');

    return writeFile(tmpFilePath, { foo: 'bar' })
      .then(() => expect(serverless.yamlParser.parse(tmpFilePath))
        .to.eventually.deep.equal({ foo: 'bar' }));
  });

  it('should write a .yaml file synchronously', () => {
    const tmpFilePath = testUtils.getTmpFilePath('anything.yaml');

    return writeFile(tmpFilePath, { foo: 'bar' })
      .then(() => expect(serverless.yamlParser.parse(tmpFilePath))
        .to.eventually.deep.equal({ foo: 'bar' }));
  });
});
