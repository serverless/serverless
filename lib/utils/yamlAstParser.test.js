'use strict';

const path = require('path');
const chai = require('chai');
const testUtils = require('../../tests/utils');
const writeFileSync = require('./fs/writeFileSync');
const readFileSync = require('./fs/readFileSync');
const yamlAstParser = require('./yamlAstParser');
chai.use(require('chai-as-promised'));
const expect = require('chai').expect;

describe('#yamlAstParser', () => {
  let tmpDirPath;

  beforeEach(() => {
    tmpDirPath = testUtils.getTmpDirPath();
  });

  describe('#addNewArrayItem()', () => {
    it('should add a top level object and item into the yaml file', () => {
      const yamlFilePath = path.join(tmpDirPath, 'test.yaml');

      writeFileSync(yamlFilePath, 'service: test-service');
      return expect(yamlAstParser.addNewArrayItem(yamlFilePath, 'toplevel', 'foo'))
        .to.be.fulfilled.then(() => {
          const yaml = readFileSync(yamlFilePath, 'utf8');
          expect(yaml).to.have.property('toplevel');
          expect(yaml.toplevel).to.be.deep.equal(['foo']);
        });
    });

    it('should add an item under the existing object which you specify', () => {
      const yamlFilePath = path.join(tmpDirPath, 'test.yaml');

      writeFileSync(yamlFilePath, { toplevel: ['foo'] });
      return expect(yamlAstParser.addNewArrayItem(yamlFilePath, 'toplevel', 'bar'))
        .to.be.fulfilled.then(() => {
          const yaml = readFileSync(yamlFilePath, 'utf8');
          expect(yaml).to.have.property('toplevel');
          expect(yaml.toplevel).to.be.deep.equal(['foo', 'bar']);
        });
    });

    it('should add a multiple level object and item into the yaml file', () => {
      const yamlFilePath = path.join(tmpDirPath, 'test.yaml');

      writeFileSync(yamlFilePath, 'service: test-service');
      return expect(yamlAstParser.addNewArrayItem(yamlFilePath, 'toplevel.second.third', 'foo'))
        .to.be.fulfilled.then(() => {
          const yaml = readFileSync(yamlFilePath, 'utf8');
          expect(yaml).to.have.property('toplevel');
          expect(yaml.toplevel).to.be.deep.equal({
            second: {
              third: ['foo'],
            },
          });
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
      return expect(yamlAstParser.addNewArrayItem(yamlFilePath, 'toplevel.second.third', 'bar'))
        .to.be.fulfilled.then(() => {
          const yaml = readFileSync(yamlFilePath, 'utf8');
          expect(yaml).to.have.property('toplevel');
          expect(yaml.toplevel).to.be.deep.equal({
            second: {
              third: ['foo', 'bar'],
            },
          });
        });
    });

    it('should do nothing when adding the existing item', () => {
      const yamlFilePath = path.join(tmpDirPath, 'test.yaml');

      writeFileSync(yamlFilePath, { toplevel: ['foo'] });
      return expect(yamlAstParser.addNewArrayItem(yamlFilePath, 'toplevel', 'foo'))
        .to.be.fulfilled.then(() => {
          const yaml = readFileSync(yamlFilePath, 'utf8');
          expect(yaml).to.have.property('toplevel');
          expect(yaml.toplevel).to.be.deep.equal(['foo']);
        });
    });

    it('should survive with invalid yaml', () => {
      const yamlFilePath = path.join(tmpDirPath, 'test.yaml');

      writeFileSync(yamlFilePath, 'service:');
      return expect(yamlAstParser.addNewArrayItem(yamlFilePath, 'toplevel', 'foo'))
        .to.be.fulfilled.then(() => {
          const yaml = readFileSync(yamlFilePath, 'utf8');
          expect(yaml).to.have.property('toplevel');
          expect(yaml.toplevel).to.be.deep.equal(['foo']);
        });
    });
  });

  describe('#removeExistingArrayItem()', () => {
    it('should remove the existing top level object and item from the yaml file', () => {
      const yamlFilePath = path.join(tmpDirPath, 'test.yaml');

      writeFileSync(yamlFilePath, {
        serveice: 'test-service',
        toplevel: ['foo'],
      });
      return expect(yamlAstParser.removeExistingArrayItem(yamlFilePath, 'toplevel', 'foo'))
        .to.be.fulfilled.then(() => {
          const yaml = readFileSync(yamlFilePath, 'utf8');
          expect(yaml).to.have.not.property('toplevel');
        });
    });

    it('should remove the existing item under the object which you specify', () => {
      const yamlFilePath = path.join(tmpDirPath, 'test.yaml');

      writeFileSync(yamlFilePath, {
        serveice: 'test-service',
        toplevel: ['foo', 'bar'],
      });
      return expect(yamlAstParser.removeExistingArrayItem(yamlFilePath, 'toplevel', 'bar'))
        .to.be.fulfilled.then(() => {
          const yaml = readFileSync(yamlFilePath, 'utf8');
          expect(yaml).to.have.property('toplevel');
          expect(yaml.toplevel).to.be.deep.equal(['foo']);
        });
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
      return expect(yamlAstParser.removeExistingArrayItem(
        yamlFilePath, 'toplevel.second.third', 'foo')).to.be.fulfilled.then(() => {
          const yaml = readFileSync(yamlFilePath, 'utf8');
          expect(yaml).to.have.not.property('toplevel');
        });
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
      return expect(yamlAstParser.removeExistingArrayItem(
        yamlFilePath, 'toplevel.second.third', 'bar')).to.be.fulfilled.then(() => {
          const yaml = readFileSync(yamlFilePath, 'utf8');
          expect(yaml).to.have.property('toplevel');
          expect(yaml.toplevel).to.be.deep.equal({
            second: {
              third: ['foo'],
            },
          });
        });
    });

    it('should do nothing when you can not find the object which you specify', () => {
      const yamlFilePath = path.join(tmpDirPath, 'test.yaml');

      writeFileSync(yamlFilePath, {
        serveice: 'test-service',
        toplevel: ['foo', 'bar'],
      });
      return expect(yamlAstParser.removeExistingArrayItem(yamlFilePath, 'toplevel', 'foo2'))
      .to.be.fulfilled.then(() => {
        const yaml = readFileSync(yamlFilePath, 'utf8');
        expect(yaml).to.have.property('toplevel');
        expect(yaml.toplevel).to.be.deep.equal(['foo', 'bar']);
      });
    });
  });
});
