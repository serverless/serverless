'use strict';

/**
 * Test: Utils Function Class
 */

const path = require('path');
const os = require('os');
const assert = require('chai').assert;
const expect = require('chai').expect;
const Utils = require('../../../lib/classes/Utils')({});

const SUtils = new Utils();

describe('Utils class', () => {

  after((done) => {
    done();
  });

  it('should export an object', () => {
    const data = {
      _class: 'SampleClass',
      publicProp: 'somethingPublic',
      functionProp: () => {
      }
    };

    const Obj = SUtils.exportObject(data);
    assert.equal(Obj.publicProp, 'somethingPublic');
    assert.equal(typeof Obj._class, 'undefined');
    assert.equal(typeof Obj.functionProp, 'undefined');
  });

  it('should generate a shortId', () => {
    const id = SUtils.generateShortId(6);
    assert.equal(typeof id, 'string');
    assert.equal(id.length, 6);
  });

  it('should check if a directory exists synchronously', () => {
    const dir = SUtils.dirExistsSync(__dirname);
    const noDir = SUtils.dirExistsSync(path.join(__dirname, '..', 'XYZ'));

    assert.equal(dir, true);
    assert.equal(noDir, false);
  });

  it('should check if a file exists synchronously', () => {
    const file = SUtils.fileExistsSync(__filename);
    const noFile = SUtils.fileExistsSync(path.join(__dirname, 'XYZ.json'));

    assert.equal(file, true);
    assert.equal(noFile, false);
  });

  it('should write a file synchronously', () => {
    let tmpFilePath = path.join(os.tmpdir(), (new Date).getTime().toString(), 'anything.json');

    SUtils.writeFileSync(tmpFilePath, { foo: 'bar' });
    let obj = SUtils.readFileSync(tmpFilePath);

    assert.equal(obj.foo, 'bar');
  });

  it('should write a file asynchronously', () => {
    let tmpFilePath = path.join(os.tmpdir(), (new Date).getTime().toString(), 'anything.json');

    // note: use return when testing promises otherwise you'll have unhandled rejection errors
    return SUtils.writeFile(tmpFilePath, { foo: 'bar' }).then(() => {
      let obj = SUtils.readFileSync(tmpFilePath);

      expect(obj.foo).to.equal('bar');
    });
  });

  it('should read a file synchronously', () => {
    let tmpFilePath = path.join(os.tmpdir(), (new Date).getTime().toString(), 'anything.json');

    SUtils.writeFileSync(tmpFilePath, { foo: 'bar' });
    let obj = SUtils.readFileSync(tmpFilePath);

    assert.equal(obj.foo, 'bar');
  });

  it('should read a file asynchronously', () => {
    let tmpFilePath = path.join(os.tmpdir(), (new Date).getTime().toString(), 'anything.json');

    SUtils.writeFileSync(tmpFilePath, { foo: 'bar' });

    // note: use return when testing promises otherwise you'll have unhandled rejection errors
    return SUtils.readFile(tmpFilePath).then((obj) => {
      expect(obj.foo).to.equal('bar');
    });
  });

  describe('Populate method', () => {

    const projectMock = {
      validateStageExists: (stage) => { return true; },
      validateRegionExists: (stage, region) => { return true; },
      getVariablesObject: () => {
        return {
          variableMock: 'valueMock',
        };
      },
    };

    const dataMock = {
      foo: '${variableMock}',
    };

    it('should populate data', () => {
      const populatedData = SUtils.populate(projectMock, {}, dataMock);

      expect(populatedData.foo).to.equal('valueMock');
    });

    it('should populate data with stage and region variables', () => {
      const populatedData = SUtils.populate(projectMock, {}, dataMock, 'dev', 'us-east1');

      expect(populatedData.foo).to.equal('valueMock');
    });

    it('should populate data with a custom variable syntax', () => {
      const customSyntaxProject = {
        getVariablesObject: () => {
          return {
            variableMock: 'valueMock',
          };
        },
        variableSyntax: '\\${{([\\s\\S]+?)}}',
      };

      const customSyntaxDataMock = {
        foo: '${{variableMock}}',
      };

      const populatedData = SUtils.populate(customSyntaxProject, {}, customSyntaxDataMock);

      expect(populatedData.foo).to.equal('valueMock');
    });

    it('should populate data with a template syntax', () => {
      const customSyntaxProject = {
        getVariablesObject: () => {
          return {
            variableMock: 'valueMock',
          };
        },
        templateSyntax: '\\${{([\\s\\S]+?)}}',
      };

      const templateMock = {
        templateMock: 'valueMock',
      };

      const customSyntaxDataMock = {
        foo: '${{templateMock}}',
      };

      const populatedData = SUtils.populate(customSyntaxProject, templateMock, customSyntaxDataMock);

      expect(populatedData.foo).to.equal('valueMock');
    });

    it('should populate data with data type other than string', () => {
      const dataTypeProjectMock = {
        getVariablesObject: () => {
          return {
            variableMock: 42,
          };
        }
      };

      const dataTypeMock = {
        foo: '${variableMock}'
      };

      const populatedData = SUtils.populate(dataTypeProjectMock, {}, dataTypeMock);

      expect(populatedData.foo).to.equal(42);
    });

    it('should populate variables within a string', () => {
      const nameProjectMock = {
        getVariablesObject: () => {
          return {
            variableMock: 'John',
          };
        }
      };

      const nameDataMock = {
        foo: 'Hello ${variableMock}',
      };

      const populatedData = SUtils.populate(nameProjectMock, {}, nameDataMock);

      expect(populatedData.foo).to.equal('Hello John');
    });

  });

  /*
  it('should run npm install successfully inside a directory', () => {
    const packageJson = {
      name: 'foo',
      version: '0.0.1',
      description: 'Serverless component dependencies',
      author: 'me',
      license: 'MIT',
      private: true,
      repository: {
        type: 'git',
        url: 'git://github.com/',
      },
      dependencies: {
        'serverless-helpers-js': '~0.1.0',
      },
    };

    const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());

    SUtils.writeFileSync(path.join(tmpDirPath, 'package.json'), JSON.stringify(packageJson));
    SUtils.npmInstall(tmpDirPath);

    expect(SUtils.dirExistsSync(path.join(tmpDirPath, 'node_modules'))).to.equal(true);
  });
  */

  it('should find the service path', () => {
    const tmpDirPath = path.join(os.tmpdir(), (new Date).getTime().toString());

    SUtils.writeFileSync(path.join(tmpDirPath, 'serverless.yml'));
    SUtils.writeFileSync(path.join(tmpDirPath, 'test', 'fakeFile.json'));

    const servicePath = SUtils.findServicePath(path.join(tmpDirPath, 'test'));

    expect(SUtils.fileExistsSync(path.join(servicePath, 'serverless.yml'))).to.equal(true);
  });

});
