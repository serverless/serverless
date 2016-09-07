'use strict';

/**
 * Test: YamlParser Function Class
 */

const expect = require('chai').expect;
const YAML = require('js-yaml');
const path = require('path');
const Serverless = require('../../lib/Serverless');
const testUtils = require('../../tests/utils');

const serverless = new Serverless();

describe('YamlParser', () => {
  describe('#parse()', () => {
    it('should parse a simple .yaml file', () => {
      const tmpFilePath = testUtils.getTmpFilePath('simple.yaml');

      serverless.utils.writeFileSync(tmpFilePath, YAML.dump({ foo: 'bar' }));

      return serverless.yamlParser.parse(tmpFilePath).then((obj) => {
        expect(obj.foo).to.equal('bar');
      });
    });

    it('should parse a simple .yml file', () => {
      const tmpFilePath = testUtils.getTmpFilePath('simple.yml');

      serverless.utils.writeFileSync(tmpFilePath, YAML.dump({ foo: 'bar' }));

      return serverless.yamlParser.parse(tmpFilePath).then((obj) => {
        expect(obj.foo).to.equal('bar');
      });
    });

    it('should parse a .yml file with JSON-REF to YAML', () => {
      const tmpDirPath = testUtils.getTmpDirPath();

      serverless.utils.writeFileSync(path.join(tmpDirPath, 'ref.yml'), { foo: 'bar' });

      const testYml = {
        main: {
          $ref: './ref.yml',
        },
      };

      serverless.utils.writeFileSync(path.join(tmpDirPath, 'test.yml'), testYml);

      return serverless.yamlParser.parse(path.join(tmpDirPath, 'test.yml')).then((obj) => {
        expect(obj.main.foo).to.equal('bar');
      });
    });

    it('should parse a .yml file with JSON-REF to JSON', () => {
      const tmpDirPath = testUtils.getTmpDirPath();

      serverless.utils.writeFileSync(path.join(tmpDirPath, 'ref.json'), { foo: 'bar' });

      const testYml = {
        main: {
          $ref: './ref.json',
        },
      };

      serverless.utils.writeFileSync(path.join(tmpDirPath, 'test.yml'), testYml);

      return serverless.yamlParser.parse(path.join(tmpDirPath, 'test.yml')).then((obj) => {
        expect(obj.main.foo).to.equal('bar');
      });
    });

    it('should parse a .yml file with recursive JSON-REF', () => {
      const tmpDirPath = testUtils.getTmpDirPath();

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

      return serverless.yamlParser.parse(path.join(tmpDirPath, 'one.yml')).then((obj) => {
        expect(obj.one.two.foo).to.equal('bar');
      });
    });
  });
});
