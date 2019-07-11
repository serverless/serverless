'use strict';

/**
 * Test: YamlParser Function Class
 */

const chai = require('chai');
const YAML = require('js-yaml');
const path = require('path');
const Serverless = require('../../lib/Serverless');
const { getTmpFilePath, getTmpDirPath } = require('../../tests/utils/fs');

// Configure chai
chai.use(require('chai-as-promised'));
const expect = require('chai').expect;

const serverless = new Serverless();

describe('YamlParser', () => {
  describe('#parse()', () => {
    it('should parse a simple .yaml file', () => {
      const tmpFilePath = getTmpFilePath('simple.yaml');

      serverless.utils.writeFileSync(tmpFilePath, YAML.dump({ foo: 'bar' }));

      return expect(serverless.yamlParser.parse(tmpFilePath))
        .to.eventually.have.property('foo')
        .to.equal('bar');
    });

    it('should parse a simple .yml file', () => {
      const tmpFilePath = getTmpFilePath('simple.yml');

      serverless.utils.writeFileSync(tmpFilePath, YAML.dump({ foo: 'bar' }));

      return expect(serverless.yamlParser.parse(tmpFilePath))
        .to.eventually.have.property('foo')
        .to.equal('bar');
    });

    it('should parse a .yml file with JSON-REF to YAML', () => {
      const tmpDirPath = getTmpDirPath();

      serverless.utils.writeFileSync(path.join(tmpDirPath, 'ref.yml'), { foo: 'bar' });

      const testYml = {
        main: {
          $ref: './ref.yml',
        },
      };

      serverless.utils.writeFileSync(path.join(tmpDirPath, 'test.yml'), testYml);

      return expect(serverless.yamlParser.parse(path.join(tmpDirPath, 'test.yml')))
        .to.eventually.have.nested.property('main.foo')
        .to.equal('bar');
    });

    it('should parse a .yml file with JSON-REF to JSON', () => {
      const tmpDirPath = getTmpDirPath();

      serverless.utils.writeFileSync(path.join(tmpDirPath, 'ref.json'), { foo: 'bar' });

      const testYml = {
        main: {
          $ref: './ref.json',
        },
      };

      serverless.utils.writeFileSync(path.join(tmpDirPath, 'test.yml'), testYml);

      return expect(serverless.yamlParser.parse(path.join(tmpDirPath, 'test.yml')))
        .to.eventually.have.nested.property('main.foo')
        .to.equal('bar');
    });

    it('should parse a .yml file with recursive JSON-REF', () => {
      const tmpDirPath = getTmpDirPath();

      serverless.utils.writeFileSync(path.join(tmpDirPath, 'three.yml'), { foo: 'bar' });

      const twoYml = {
        two: {
          $ref: './three.yml',
        },
      };

      serverless.utils.writeFileSync(path.join(tmpDirPath, 'two.yml'), twoYml);

      const oneYml = {
        one: {
          $ref: './two.yml',
        },
      };

      serverless.utils.writeFileSync(path.join(tmpDirPath, 'one.yml'), oneYml);

      return expect(serverless.yamlParser.parse(path.join(tmpDirPath, 'one.yml')))
        .to.eventually.have.nested.property('one.two.foo')
        .to.equal('bar');
    });
  });
});
