'use strict';

const path = require('path');
const YAML = require('js-yaml');
const expect = require('chai').expect;
const Variables = require('../../lib/classes/Variables');
const Utils = require('../../lib/classes/Utils');
const Serverless = require('../../lib/Serverless');
const sinon = require('sinon');
const testUtils = require('../utils');

describe('Service', () => {
  describe('#constructor()', () => {
    const serverless = new Serverless();

    it('should attach serverless instance', () => {
      const variablesInstance = new Variables(serverless);
      expect(typeof variablesInstance.serverless.version).to.be.equal('string');
    });
  });

  describe('#populateService()', () => {
    it('should call populateProperty method', () => {
      const serverless = new Serverless();

      const populatePropertyStub = sinon
        .stub(serverless.variables, 'populateProperty');

      serverless.variables.populateService();
      expect(populatePropertyStub.called).to.equal(true);

      serverless.variables.populateProperty.restore();
    });
  });

  describe('#populateProperty()', () => {
    it('should call overwrite if overwrite syntax provided', () => {
      const serverless = new Serverless();
      const property = 'my stage is ${opt:stage, self:provider.stage}';

      const overwriteStub = sinon
        .stub(serverless.variables, 'overwrite').returns('dev');
      const populateVariableStub = sinon
        .stub(serverless.variables, 'populateVariable').returns('my stage is dev');

      const newProperty = serverless.variables
        .populateProperty(property);
      expect(overwriteStub.called).to.equal(true);
      expect(populateVariableStub.called).to.equal(true);
      expect(newProperty).to.equal('my stage is dev');

      serverless.variables.overwrite.restore();
      serverless.variables.populateVariable.restore();
    });

    it('should call getValueFromSource if no overwrite syntax provided', () => {
      const serverless = new Serverless();
      const property = 'my stage is ${opt:stage}';

      const getValueFromSourceStub = sinon
        .stub(serverless.variables, 'getValueFromSource').returns('prod');
      const populateVariableStub = sinon
        .stub(serverless.variables, 'populateVariable').returns('my stage is prod');

      const newProperty = serverless.variables
        .populateProperty(property);
      expect(getValueFromSourceStub.called).to.equal(true);
      expect(populateVariableStub.called).to.equal(true);
      expect(newProperty).to.equal('my stage is prod');

      serverless.variables.getValueFromSource.restore();
      serverless.variables.populateVariable.restore();
    });

    it('should run recursively if nested variables provided', () => {
      const serverless = new Serverless();
      const property = 'my stage is ${env:${opt.name}}';

      const getValueFromSourceStub = sinon
        .stub(serverless.variables, 'getValueFromSource');
      const populateVariableStub = sinon
        .stub(serverless.variables, 'populateVariable');

      getValueFromSourceStub.onCall(0).returns('stage');
      getValueFromSourceStub.onCall(1).returns('dev');
      populateVariableStub.onCall(0).returns('my stage is ${env:stage}');
      populateVariableStub.onCall(1).returns('my stage is dev');

      const newProperty = serverless.variables
        .populateProperty(property);
      expect(getValueFromSourceStub.callCount).to.equal(2);
      expect(populateVariableStub.callCount).to.equal(2);
      expect(newProperty).to.equal('my stage is dev');

      serverless.variables.getValueFromSource.restore();
      serverless.variables.populateVariable.restore();
    });
  });

  describe('#populateVariable()', () => {
    it('should populate string variables as sub string', () => {
      const serverless = new Serverless();
      const valueToPopulate = 'dev';
      const matchedString = '${opt:stage}';
      const property = 'my stage is ${opt:stage}';

      const newProperty = serverless.variables
        .populateVariable(property, matchedString, valueToPopulate);
      expect(newProperty).to.equal('my stage is dev');
    });

    it('should populate non string variables', () => {
      const serverless = new Serverless();
      const valueToPopulate = 5;
      const matchedString = '${opt:number}';
      const property = '${opt:number}';

      const newProperty = serverless.variables
        .populateVariable(property, matchedString, valueToPopulate);
      expect(newProperty).to.equal(5);
    });

    it('should throw error if populating non string variable as sub string', () => {
      const serverless = new Serverless();
      const valueToPopulate = 5;
      const matchedString = '${opt:number}';
      const property = 'hello ${opt:number}';
      expect(() => serverless.variables
        .populateVariable(property, matchedString, valueToPopulate))
        .to.throw(Error);
    });
  });

  describe('#overwrite()', () => {
    it('should overwrite undefined and null values', () => {
      const serverless = new Serverless();
      const getValueFromSourceStub = sinon
        .stub(serverless.variables, 'getValueFromSource');

      getValueFromSourceStub.onCall(0).returns(undefined);
      getValueFromSourceStub.onCall(1).returns(null);
      getValueFromSourceStub.onCall(2).returns('variableValue');

      const valueToPopulate = serverless.variables
        .overwrite('opt:stage,env:stage,self:provider.stage');
      expect(valueToPopulate).to.equal('variableValue');
      expect(getValueFromSourceStub.callCount).to.equal(3);
      serverless.variables.getValueFromSource.restore();
    });

    it('should not overwrite 0 values', () => {
      const serverless = new Serverless();
      const getValueFromSourceStub = sinon
        .stub(serverless.variables, 'getValueFromSource');

      getValueFromSourceStub.onCall(0).returns(0);
      getValueFromSourceStub.onCall(1).returns('variableValue');
      getValueFromSourceStub.onCall(2).returns('variableValue2');

      const valueToPopulate = serverless.variables
        .overwrite('opt:stage,env:stage,self:provider.stage');
      expect(valueToPopulate).to.equal(0);
      expect(getValueFromSourceStub.callCount).to.equal(1);
      serverless.variables.getValueFromSource.restore();
    });

    it('should not overwrite false values', () => {
      const serverless = new Serverless();
      const getValueFromSourceStub = sinon
        .stub(serverless.variables, 'getValueFromSource');

      getValueFromSourceStub.onCall(0).returns(false);
      getValueFromSourceStub.onCall(1).returns('variableValue');
      getValueFromSourceStub.onCall(2).returns('variableValue2');

      const valueToPopulate = serverless.variables
        .overwrite('opt:stage,env:stage,self:provider.stage');
      expect(valueToPopulate).to.equal(false);
      expect(getValueFromSourceStub.callCount).to.equal(1);
      serverless.variables.getValueFromSource.restore();
    });

    it('should skip getting values once a value has been found', () => {
      const serverless = new Serverless();
      const getValueFromSourceStub = sinon
        .stub(serverless.variables, 'getValueFromSource');

      getValueFromSourceStub.onCall(0).returns(undefined);
      getValueFromSourceStub.onCall(1).returns('variableValue');
      getValueFromSourceStub.onCall(2).returns('variableValue2');

      const valueToPopulate = serverless.variables
        .overwrite('opt:stage,env:stage,self:provider.stage');
      expect(valueToPopulate).to.equal('variableValue');
      expect(getValueFromSourceStub.callCount).to.equal(2);
      serverless.variables.getValueFromSource.restore();
    });
  });

  describe('#getValueFromSource()', () => {
    it('should call getValueFromEnv if referencing env var', () => {
      const serverless = new Serverless();
      const getValueFromEnvStub = sinon
        .stub(serverless.variables, 'getValueFromEnv').returns('variableValue');

      const valueToPopulate = serverless.variables.getValueFromSource('env:TEST_VAR');
      expect(valueToPopulate).to.equal('variableValue');
      expect(getValueFromEnvStub.called).to.equal(true);
      expect(getValueFromEnvStub.calledWith('env:TEST_VAR')).to.equal(true);
      serverless.variables.getValueFromEnv.restore();
    });

    it('should call getValueFromOptions if referencing an option', () => {
      const serverless = new Serverless();
      const getValueFromOptionsStub = sinon
        .stub(serverless.variables, 'getValueFromOptions').returns('variableValue');

      const valueToPopulate = serverless.variables.getValueFromSource('opt:stage');
      expect(valueToPopulate).to.equal('variableValue');
      expect(getValueFromOptionsStub.called).to.equal(true);
      expect(getValueFromOptionsStub.calledWith('opt:stage')).to.equal(true);
      serverless.variables.getValueFromOptions.restore();
    });

    it('should call getValueFromSelf if referencing from self', () => {
      const serverless = new Serverless();
      const getValueFromSelfStub = sinon
        .stub(serverless.variables, 'getValueFromSelf').returns('variableValue');

      const valueToPopulate = serverless.variables.getValueFromSource('self:provider');
      expect(valueToPopulate).to.equal('variableValue');
      expect(getValueFromSelfStub.called).to.equal(true);
      expect(getValueFromSelfStub.calledWith('self:provider')).to.equal(true);
      serverless.variables.getValueFromSelf.restore();
    });

    it('should call getValueFromFile if referencing from another file', () => {
      const serverless = new Serverless();
      const getValueFromFileStub = sinon
        .stub(serverless.variables, 'getValueFromFile').returns('variableValue');

      const valueToPopulate = serverless.variables.getValueFromSource('file(./config.yml)');
      expect(valueToPopulate).to.equal('variableValue');
      expect(getValueFromFileStub.called).to.equal(true);
      expect(getValueFromFileStub.calledWith('file(./config.yml)')).to.equal(true);
      serverless.variables.getValueFromFile.restore();
    });

    it('should throw error if referencing an invalid source', () => {
      const serverless = new Serverless();
      expect(() => serverless.variables.getValueFromSource('weird:source'))
        .to.throw(Error);
    });
  });

  describe('#getValueFromEnv()', () => {
    it('should get variable from environment variables', () => {
      const serverless = new Serverless();
      process.env.TEST_VAR = 'someValue';
      const valueToPopulate = serverless.variables.getValueFromEnv('env:TEST_VAR');
      expect(valueToPopulate).to.be.equal('someValue');
      delete process.env.TEST_VAR;
    });
  });

  describe('#getValueFromOptions()', () => {
    it('should get variable from options', () => {
      const serverless = new Serverless();
      serverless.variables.options = {
        stage: 'prod',
      };
      const valueToPopulate = serverless.variables.getValueFromOptions('opt:stage');
      expect(valueToPopulate).to.be.equal('prod');
    });
  });

  describe('#getValueFromSelf()', () => {
    it('should get variable from self serverless.yml file', () => {
      const serverless = new Serverless();
      serverless.variables.service = {
        service: 'testService',
        provider: 'testProvider',
      };
      const valueToPopulate = serverless.variables.getValueFromSelf('self:provider');
      expect(valueToPopulate).to.be.equal('testProvider');
    });

    it('should not throw error if referencing invalid properties', () => {
      const serverless = new Serverless();
      serverless.variables.service = {
        service: 'testService',
        custom: {
          prob: 'prob',
        },
      };
      const valueToPopulate = serverless.variables.getValueFromSelf('self:custom.whatever.deeper');
      expect(valueToPopulate).to.be.equal(undefined);
    });
  });

  describe('#getValueFromFile()', () => {
    it('should populate an entire variable file', () => {
      const serverless = new Serverless();
      const SUtils = new Utils();
      const tmpDirPath = testUtils.getTmpDirPath();
      const configYml = {
        test: 1,
        test2: 'test2',
        testObj: {
          sub: 2,
          prob: 'prob',
        },
      };

      SUtils.writeFileSync(path.join(tmpDirPath, 'config.yml'),
        YAML.dump(configYml));

      serverless.config.update({ servicePath: tmpDirPath });

      const valueToPopulate = serverless.variables.getValueFromFile('file(./config.yml)');
      expect(valueToPopulate).to.deep.equal(configYml);
    });

    it('should populate non json/yml files', () => {
      const serverless = new Serverless();
      const SUtils = new Utils();
      const tmpDirPath = testUtils.getTmpDirPath();

      SUtils.writeFileSync(path.join(tmpDirPath, 'someFile'),
        'hello world');

      serverless.config.update({ servicePath: tmpDirPath });

      const valueToPopulate = serverless.variables.getValueFromFile('file(./someFile)');
      expect(valueToPopulate).to.equal('hello world');
    });

    it('should populate from another file when variable is of any type', () => {
      const serverless = new Serverless();
      const SUtils = new Utils();
      const tmpDirPath = testUtils.getTmpDirPath();
      const configYml = {
        test: 1,
        test2: 'test2',
        testObj: {
          sub: 2,
          prob: 'prob',
        },
      };

      SUtils.writeFileSync(path.join(tmpDirPath, 'config.yml'),
        YAML.dump(configYml));

      serverless.config.update({ servicePath: tmpDirPath });

      const valueToPopulate = serverless.variables
        .getValueFromFile('file(./config.yml):testObj.sub');
      expect(valueToPopulate).to.equal(2);
    });

    it('should not throw error if referencing invalid properties', () => {
      const serverless = new Serverless();
      const SUtils = new Utils();
      const tmpDirPath = testUtils.getTmpDirPath();
      const configYml = {
        test: 1,
        test2: 'test2',
        testObj: {
          sub: 2,
          prob: 'prob',
        },
      };

      SUtils.writeFileSync(path.join(tmpDirPath, 'config.yml'),
        YAML.dump(configYml));

      serverless.config.update({ servicePath: tmpDirPath });

      const valueToPopulate = serverless.variables
        .getValueFromFile('file(./config.yml):testObj.whatever.deeper');
      expect(valueToPopulate).to.equal(undefined);
    });

    it('should throw error if not using ":" syntax', () => {
      const serverless = new Serverless();
      const SUtils = new Utils();
      const tmpDirPath = testUtils.getTmpDirPath();
      const configYml = {
        test: 1,
        test2: 'test2',
        testObj: {
          sub: 2,
          prob: 'prob',
        },
      };

      SUtils.writeFileSync(path.join(tmpDirPath, 'config.yml'),
        YAML.dump(configYml));

      serverless.config.update({ servicePath: tmpDirPath });

      expect(() => serverless.variables
        .getValueFromFile('file(./config.yml).testObj.sub')).to.throw(Error);
    });
  });
});
