'use strict';

/**
 * Test: YamlParser Function Class
 */

const expect = require('chai').expect;
const YAML = require('js-yaml');
const path = require('path');
const os = require('os');
const Serverless = require('../../../lib/Serverless');
const YamlParser = require('../../../lib/classes/YamlParser');
const Utils = require('../../../lib/classes/Utils');

const S = new Serverless();
const SUtils = new Utils();
const yamlParser = new YamlParser(S);

describe('YamlParser', () => {

  describe('#parse()', () => {

    it('should parse a simple yaml file', () => {
      const tmpFilePath = path.join(os.tmpdir(), (new Date).getTime().toString(), 'simple.yml');

      SUtils.writeFileSync(tmpFilePath, YAML.dump({ foo: 'bar' }));

      return yamlParser.parse(tmpFilePath).then((obj) => {
        expect(obj.foo).to.equal('bar');
      });
    });

    it('should parse a yaml file with JSON-REF to yaml', () => {
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());

      SUtils.writeFileSync(path.join(tmpDirPath, 'ref.yaml'), { foo: 'bar' });

      const testYaml = {
        main: {
          $ref: './ref.yaml',
        },
      };

      SUtils.writeFileSync(path.join(tmpDirPath, 'test.yaml'), testYaml);

      return yamlParser.parse(path.join(tmpDirPath, 'test.yaml')).then((obj) => {
        expect(obj.main.foo).to.equal('bar');
      });
    });

    it('should parse a yaml file with JSON-REF to json', () => {
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());

      SUtils.writeFileSync(path.join(tmpDirPath, 'ref.json'), { foo: 'bar' });

      const testYaml = {
        main: {
          $ref: './ref.json',
        },
      };

      SUtils.writeFileSync(path.join(tmpDirPath, 'test.yaml'), testYaml);

      return yamlParser.parse(path.join(tmpDirPath, 'test.yaml')).then((obj) => {
        expect(obj.main.foo).to.equal('bar');
      });
    });

    it('should parse yaml file with recursive JSON-REF', () => {
      const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());

      SUtils.writeFileSync(path.join(tmpDirPath, 'three.yaml'), { foo: 'bar' });

      const twoYaml = {
        two: {
          $ref: './three.yaml',
        },
      };

      SUtils.writeFileSync(path.join(tmpDirPath, 'two.yaml'), twoYaml);

      const oneYaml = {
        one: {
          $ref: './two.yaml',
        },
      };

      SUtils.writeFileSync(path.join(tmpDirPath, 'one.yaml'), oneYaml);

      return yamlParser.parse(path.join(tmpDirPath, 'one.yaml')).then((obj) => {
        expect(obj.one.two.foo).to.equal('bar');
      });
    });
  });

});
