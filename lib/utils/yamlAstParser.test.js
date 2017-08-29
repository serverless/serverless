'use strict';

const path = require('path');
const expect = require('chai').expect;
const testUtils = require('../../tests/utils');
const writeFileSync = require('./fs/writeFileSync');
const readFileSync = require('./fs/readFileSync');
const yamlAstParser = require('./yamlAstParser');

describe('#yamlAstParser', () => {
  let tmpDirPath;

  beforeEach(() => {
    tmpDirPath = testUtils.getTmpDirPath();
  });

  describe('#addNewArrayItem()', () => {
    it('should add a top level object and item into the yaml file', () => {
      const yamlFilePath = path.join(tmpDirPath, 'test.yaml');

      writeFileSync(yamlFilePath, 'serveice: test-service');
      yamlAstParser.addNewArrayItem(yamlFilePath, 'toplevel', 'foo');

      const yaml = readFileSync(yamlFilePath, 'utf8');
      expect(yaml).to.have.property('toplevel');
      expect(yaml.toplevel).to.be.deep.equal(['foo']);
    });

    it('should add an item under the existing object which you specify', () => {
      const yamlFilePath = path.join(tmpDirPath, 'test.yaml');

      writeFileSync(yamlFilePath, { toplevel: ['foo'] });
      yamlAstParser.addNewArrayItem(yamlFilePath, 'toplevel', 'bar');

      const yaml = readFileSync(yamlFilePath, 'utf8');
      expect(yaml).to.have.property('toplevel');
      expect(yaml.toplevel).to.be.deep.equal(['foo', 'bar']);
    });

    it('should add a multiple level object and item into the yaml file', () => {
      const yamlFilePath = path.join(tmpDirPath, 'test.yaml');

      writeFileSync(yamlFilePath, 'serveice: test-service');
      yamlAstParser.addNewArrayItem(yamlFilePath, 'toplevel.second.third', 'foo');

      const yaml = readFileSync(yamlFilePath, 'utf8');
      expect(yaml).to.have.property('toplevel');
      expect(yaml.toplevel).to.be.deep.equal({
        second: {
          third: ['foo'],
        },
      });
    });

    it('should add an item under the existing multiple level object which you specify', () => {
      const yamlFilePath = path.join(tmpDirPath, 'test.yaml');

      writeFileSync(yamlFilePath, {
        toplevel: {
          second: {
            third: ['foo'],
          },
        },
      });
      yamlAstParser.addNewArrayItem(yamlFilePath, 'toplevel.second.third', 'bar');

      const yaml = readFileSync(yamlFilePath, 'utf8');
      expect(yaml).to.have.property('toplevel');
      expect(yaml.toplevel).to.be.deep.equal({
        second: {
          third: ['foo', 'bar'],
        },
      });
    });

    it('should do nothing when adding the existing item', () => {
      const yamlFilePath = path.join(tmpDirPath, 'test.yaml');

      writeFileSync(yamlFilePath, { toplevel: ['foo'] });
      yamlAstParser.addNewArrayItem(yamlFilePath, 'toplevel', 'foo');

      const yaml = readFileSync(yamlFilePath, 'utf8');
      expect(yaml).to.have.property('toplevel');
      expect(yaml.toplevel).to.be.deep.equal(['foo']);
    });
  });

  describe('#removeExistingArrayItem()', () => {
    it('should remove the existing top level object and item from the yaml file', () => {
      const yamlFilePath = path.join(tmpDirPath, 'test.yaml');

      writeFileSync(yamlFilePath, {
        serveice: 'test-service',
        toplevel: ['foo'],
      });
      yamlAstParser.removeExistingArrayItem(yamlFilePath, 'toplevel', 'foo');

      const yaml = readFileSync(yamlFilePath, 'utf8');
      expect(yaml).to.have.not.property('toplevel');
    });

    it('should remove the existing item under the object which you specify', () => {
      const yamlFilePath = path.join(tmpDirPath, 'test.yaml');

      writeFileSync(yamlFilePath, {
        serveice: 'test-service',
        toplevel: ['foo', 'bar'],
      });
      yamlAstParser.removeExistingArrayItem(yamlFilePath, 'toplevel', 'bar');

      const yaml = readFileSync(yamlFilePath, 'utf8');
      expect(yaml).to.have.property('toplevel');
      expect(yaml.toplevel).to.be.deep.equal(['foo']);
    });

    it('should remove the multiple level object and item from the yaml file', () => {
      const yamlFilePath = path.join(tmpDirPath, 'test.yaml');

      writeFileSync(yamlFilePath, {
        serveice: 'test-service',
        toplevel: {
          second: {
            third: ['foo'],
          },
        },
      });
      yamlAstParser.removeExistingArrayItem(yamlFilePath, 'toplevel.second.third', 'foo');

      const yaml = readFileSync(yamlFilePath, 'utf8');
      expect(yaml).to.have.not.property('toplevel');
    });

    it('should remove the existing item under the multiple level object which you specify', () => {
      const yamlFilePath = path.join(tmpDirPath, 'test.yaml');

      writeFileSync(yamlFilePath, {
        serveice: 'test-service',
        toplevel: {
          second: {
            third: ['foo', 'bar'],
          },
        },
      });
      yamlAstParser.removeExistingArrayItem(yamlFilePath, 'toplevel.second.third', 'bar');

      const yaml = readFileSync(yamlFilePath, 'utf8');
      expect(yaml).to.have.property('toplevel');
      expect(yaml.toplevel).to.be.deep.equal({
        second: {
          third: ['foo'],
        },
      });
    });

    it('should do nothing when you can not find the object which you specify', () => {
      const yamlFilePath = path.join(tmpDirPath, 'test.yaml');

      writeFileSync(yamlFilePath, {
        serveice: 'test-service',
        toplevel: ['foo', 'bar'],
      });
      yamlAstParser.removeExistingArrayItem(yamlFilePath, 'toplevel', 'foo2');

      const yaml = readFileSync(yamlFilePath, 'utf8');
      expect(yaml).to.have.property('toplevel');
      expect(yaml.toplevel).to.be.deep.equal(['foo', 'bar']);
    });
  });

  describe('#checkArrayItemExists()', () => {
    it('should return true if the specific item is found in the yaml file', () => {
      const yamlFilePath = path.join(tmpDirPath, 'test.yaml');

      writeFileSync(yamlFilePath, { toplevel: ['foo'] });
      expect(yamlAstParser.checkArrayItemExists(
        yamlFilePath, 'toplevel', 'foo')).to.be.deep.equal(true);
    });

    it('should return false if the specific item is not found in the yaml file', () => {
      const yamlFilePath = path.join(tmpDirPath, 'test.yaml');

      writeFileSync(yamlFilePath, { toplevel: ['foo'] });
      expect(yamlAstParser.checkArrayItemExists(
        yamlFilePath, 'toplevel', 'bar')).to.be.deep.equal(false);
    });
  });
});
