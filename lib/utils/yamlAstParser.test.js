'use strict';

const path = require('path');
const chai = require('chai');
const writeFileSync = require('./fs/writeFileSync');
const readFileSync = require('./fs/readFileSync');
const yamlAstParser = require('./yamlAstParser');
const _ = require('lodash');
const chaiAsPromised = require('chai-as-promised');
const { getTmpDirPath } = require('../../tests/utils/fs');

chai.use(chaiAsPromised);
const expect = require('chai').expect;

describe('#yamlAstParser', () => {
  let tmpDirPath;

  beforeEach(() => {
    tmpDirPath = getTmpDirPath();
  });

  describe('#addNewArrayItem()', () => {
    const addNewArrayItemAndVerifyResult = (yamlContent, pathInYaml, newItem, expectedResult) => {
      const yamlFilePath = path.join(tmpDirPath, 'test.yaml');
      writeFileSync(yamlFilePath, yamlContent);
      return expect(
        yamlAstParser.addNewArrayItem(yamlFilePath, pathInYaml, newItem)
      ).to.be.fulfilled.then(() => {
        const yaml = readFileSync(yamlFilePath, 'utf8');
        expect(yaml).to.be.deep.equal(expectedResult);
      });
    };

    it('should add a top level object and item into the yaml file', () => {
      const yamlContent = { service: 'test-service' };
      const expectedResult = _.assign({}, yamlContent, {
        toplevel: ['foo'],
      });
      return addNewArrayItemAndVerifyResult(yamlContent, 'toplevel', 'foo', expectedResult);
    });

    it('should add an item under the existing object which you specify', () => {
      const yamlContent = { toplevel: ['foo'] };
      const expectedResult = { toplevel: ['foo', 'bar'] };
      return addNewArrayItemAndVerifyResult(yamlContent, 'toplevel', 'bar', expectedResult);
    });

    it('should add a multiple level object and item into the yaml file', () => {
      const yamlContent = { service: 'test-service' };
      const expectedResult = _.assign({}, yamlContent, {
        toplevel: {
          second: {
            third: ['foo'],
          },
        },
      });
      return addNewArrayItemAndVerifyResult(
        yamlContent,
        'toplevel.second.third',
        'foo',
        expectedResult
      );
    });

    it('should add an item under the existing multiple level object which you specify', () => {
      const yamlContent = {
        toplevel: {
          second: {
            third: ['foo'],
          },
        },
      };
      const expectedResult = {
        toplevel: {
          second: {
            third: ['foo', 'bar'],
          },
        },
      };
      return addNewArrayItemAndVerifyResult(
        yamlContent,
        'toplevel.second.third',
        'bar',
        expectedResult
      );
    });

    it('should add an item under partially existing multiple level object', () => {
      const yamlContent = {
        toplevel: {
          first: 'foo',
          second: {},
        },
      };
      const expectedResult = {
        toplevel: {
          first: 'foo',
          second: {
            third: ['bar'],
          },
        },
      };
      return addNewArrayItemAndVerifyResult(
        yamlContent,
        'toplevel.second.third',
        'bar',
        expectedResult
      );
    });

    it('should add an item in the middle branch', () => {
      const yamlContent = {
        initiallevel: 'bar',
        toplevel: {
          first: 'foo',
        },
        bottomlevel: 'bar',
      };
      const expectedResult = {
        initiallevel: 'bar',
        toplevel: {
          first: 'foo',
          second: ['bar'],
        },
        bottomlevel: 'bar',
      };
      return addNewArrayItemAndVerifyResult(yamlContent, 'toplevel.second', 'bar', expectedResult);
    });

    it('should add an item with multiple top level entries', () => {
      const yamlContent = {
        toplevel: {
          first: 'foo',
          second: {},
        },
        nexttoplevel: {
          first: 'bar',
        },
      };
      const expectedResult = {
        toplevel: {
          first: 'foo',
          second: {
            third: ['bar'],
          },
        },
        nexttoplevel: {
          first: 'bar',
        },
      };
      return addNewArrayItemAndVerifyResult(
        yamlContent,
        'toplevel.second.third',
        'bar',
        expectedResult
      );
    });

    it('should do nothing when adding the existing item', () => {
      const yamlContent = { toplevel: ['foo'] };
      const expectedResult = { toplevel: ['foo'] };
      return addNewArrayItemAndVerifyResult(yamlContent, 'toplevel', 'foo', expectedResult);
    });

    it('should survive with invalid yaml', () => {
      const yamlContent = 'service:';
      const expectedResult = { service: null, toplevel: ['foo'] };
      return addNewArrayItemAndVerifyResult(yamlContent, 'toplevel', 'foo', expectedResult);
    });
  });

  describe('#removeExistingArrayItem()', () => {
    const removeExistingArrayItemAndVerifyResult = (
      yamlContent,
      pathInYaml,
      removeItem,
      expectedResult
    ) => {
      const yamlFilePath = path.join(tmpDirPath, 'test.yaml');
      writeFileSync(yamlFilePath, yamlContent);
      return expect(
        yamlAstParser.removeExistingArrayItem(yamlFilePath, pathInYaml, removeItem)
      ).to.be.fulfilled.then(() => {
        const yaml = readFileSync(yamlFilePath, 'utf8');
        expect(yaml).to.be.deep.equal(expectedResult);
      });
    };

    it('should remove the existing top level object and item from the yaml file', () => {
      const yamlContent = {
        service: 'test-service',
        toplevel: ['foo'],
      };
      const expectedResult = { service: 'test-service' };
      return removeExistingArrayItemAndVerifyResult(yamlContent, 'toplevel', 'foo', expectedResult);
    });

    it('should remove the existing item under the object which you specify', () => {
      const yamlContent = {
        service: 'test-service',
        toplevel: ['foo', 'bar'],
      };
      const expectedResult = {
        service: 'test-service',
        toplevel: ['foo'],
      };
      return removeExistingArrayItemAndVerifyResult(yamlContent, 'toplevel', 'bar', expectedResult);
    });

    it('should remove the multiple level object and item from the yaml file', () => {
      const yamlContent = {
        service: 'test-service',
        toplevel: {
          second: {
            third: ['foo'],
          },
        },
      };
      const expectedResult = { service: 'test-service' };
      return removeExistingArrayItemAndVerifyResult(
        yamlContent,
        'toplevel.second.third',
        'foo',
        expectedResult
      );
    });

    it('should remove the existing item under the multiple level object which you specify', () => {
      const yamlContent = {
        service: 'test-service',
        toplevel: {
          second: {
            third: ['foo', 'bar'],
          },
        },
      };
      const expectedResult = {
        service: 'test-service',
        toplevel: {
          second: {
            third: ['foo'],
          },
        },
      };
      return removeExistingArrayItemAndVerifyResult(
        yamlContent,
        'toplevel.second.third',
        'bar',
        expectedResult
      );
    });

    it('should remove multilevel object from the middle branch', () => {
      const yamlContent = {
        service: 'test-service',
        toplevel: {
          second: {
            third: ['foo'],
          },
        },
        end: 'end',
      };
      const expectedResult = {
        service: 'test-service',
        end: 'end',
      };
      return removeExistingArrayItemAndVerifyResult(
        yamlContent,
        'toplevel.second.third',
        'foo',
        expectedResult
      );
    });

    it('should remove item from multilevel object from the middle branch', () => {
      const yamlContent = {
        service: 'test-service',
        toplevel: {
          second: {
            third: ['foo', 'bar'],
          },
        },
        end: 'end',
      };
      const expectedResult = {
        service: 'test-service',
        toplevel: {
          second: {
            third: ['bar'],
          },
        },
        end: 'end',
      };
      return removeExistingArrayItemAndVerifyResult(
        yamlContent,
        'toplevel.second.third',
        'foo',
        expectedResult
      );
    });

    it('should do nothing when you can not find the object which you specify', () => {
      const yamlContent = {
        serveice: 'test-service',
        toplevel: ['foo', 'bar'],
      };

      return removeExistingArrayItemAndVerifyResult(yamlContent, 'toplevel', 'foo2', yamlContent);
    });

    it('should remove when with inline declaration of the array', () => {
      const yamlContent = 'toplevel:\n  second: ["foo2", "bar"]';
      const expectedResult = {
        toplevel: {
          second: ['foo2'],
        },
      };
      return removeExistingArrayItemAndVerifyResult(
        yamlContent,
        'toplevel.second',
        'bar',
        expectedResult
      );
    });
  });
});
