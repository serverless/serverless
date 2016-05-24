'use strict';

/**
 * Test: YamlParser Function Class
 */

const expect = require('chai').expect;
const YAML = require('js-yaml');
const path = require('path');
const os = require('os');
const Serverless = require('../../lib/Serverless');

const serverless = new Serverless();

describe('YamlParser', () => {
  describe('#parse()', () => {
    it('should parse a simple yaml file', () => {
      const tmpFilePath = path.join(os.tmpdir(), (new Date).getTime().toString(), 'simple.yml');

      serverless.utils.writeFileSync(tmpFilePath, YAML.dump({ foo: 'bar' }));

      return serverless.yamlParser.parse(tmpFilePath).then((obj) => {
        expect(obj.foo).to.equal('bar');
      });
    });

    it('should parse a yaml file with JSON-REF to yaml', () => {
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());

      serverless.utils.writeFileSync(path.join(tmpDirPath, 'ref.yaml'), { foo: 'bar' });

      const testYaml = {
        main: {
          $ref: './ref.yaml',
        },
      };

      serverless.utils.writeFileSync(path.join(tmpDirPath, 'test.yaml'), testYaml);

      return serverless.yamlParser.parse(path.join(tmpDirPath, 'test.yaml')).then((obj) => {
        expect(obj.main.foo).to.equal('bar');
      });
    });

    it('should parse a yaml file with JSON-REF to json', () => {
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());

      serverless.utils.writeFileSync(path.join(tmpDirPath, 'ref.json'), { foo: 'bar' });

      const testYaml = {
        main: {
          $ref: './ref.json',
        },
      };

      serverless.utils.writeFileSync(path.join(tmpDirPath, 'test.yaml'), testYaml);

      return serverless.yamlParser.parse(path.join(tmpDirPath, 'test.yaml')).then((obj) => {
        expect(obj.main.foo).to.equal('bar');
      });
    });

    it('should parse yaml file with recursive JSON-REF', () => {
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());

      serverless.utils.writeFileSync(path.join(tmpDirPath, 'three.yaml'), { foo: 'bar' });

      const twoYaml = {
        two: {
          $ref: './three.yaml',
        },
      };

      serverless.utils.writeFileSync(path.join(tmpDirPath, 'two.yaml'), twoYaml);

      const oneYaml = {
        one: {
          $ref: './two.yaml',
        },
      };

      serverless.utils.writeFileSync(path.join(tmpDirPath, 'one.yaml'), oneYaml);

      return serverless.yamlParser.parse(path.join(tmpDirPath, 'one.yaml')).then((obj) => {
        expect(obj.one.two.foo).to.equal('bar');
      });
    });
  });
});
