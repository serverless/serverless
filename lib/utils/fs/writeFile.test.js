'use strict';

const fse = require('./fse');
const Serverless = require('../../../lib/Serverless');
const chai = require('chai');
const writeFile = require('./writeFile');
const readFile = require('./readFile');
const { getTmpFilePath } = require('../../../tests/utils/fs');

// Configure chai
chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));
const expect = require('chai').expect;

describe('#writeFile()', function() {
  let serverless;
  this.timeout(0);

  beforeEach(() => {
    serverless = new Serverless();
  });

  it('should write a .json file asynchronously', () => {
    const tmpFilePath = getTmpFilePath('anything.json');
    return writeFile(tmpFilePath, { foo: 'bar' }).then(() =>
      expect(readFile(tmpFilePath)).to.eventually.deep.equal({ foo: 'bar' })
    );
  });

  it('should write a .yml file synchronously', () => {
    const tmpFilePath = getTmpFilePath('anything.yml');

    return writeFile(tmpFilePath, { foo: 'bar' }).then(() =>
      expect(serverless.yamlParser.parse(tmpFilePath)).to.eventually.deep.equal({ foo: 'bar' })
    );
  });

  it('should write a .yaml file synchronously', () => {
    const tmpFilePath = getTmpFilePath('anything.yaml');

    return writeFile(tmpFilePath, { foo: 'bar' }).then(() =>
      expect(serverless.yamlParser.parse(tmpFilePath)).to.eventually.deep.equal({ foo: 'bar' })
    );
  });

  it('should be able to write an object with circular references', () => {
    const tmpFilePath = getTmpFilePath('anything.json');
    const bar = {};
    bar.foo = bar;
    const expected = '{\n  "foo": {\n    "$ref": "$"\n  }\n}';

    return writeFile(tmpFilePath, bar, true).then(() =>
      expect(fse.readFileAsync(tmpFilePath, 'utf8')).to.eventually.equal(expected)
    );
  });
});
