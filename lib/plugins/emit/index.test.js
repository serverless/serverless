'use strict';

const chai = require('chai');
const sinon = require('sinon');
const Emit = require('./index');
const path = require('path');
const Serverless = require('../../Serverless');
const testUtils = require('../../../tests/utils');

chai.use(require('chai-as-promised'));

const expect = chai.expect;

describe.only('Emit', () => {
  let emit;
  let serverless;

  beforeEach(() => {
    serverless = new Serverless();
    emit = new Emit(serverless);
  });

  describe('#constructor()', () => {
    it('should have commands', () => expect(emit.commands).to.be.not.empty);
    it('should have hooks', () => expect(emit.hooks).to.be.not.empty);

    it('should run promise chain in order', () => {
      const retrieveDataStub = sinon.stub(emit, 'retrieveData').resolves();
      const emitEventStub = sinon.stub(emit, 'emitEvent').resolves();

      return emit.hooks['emit:emit']().then(() => {
        expect(retrieveDataStub.calledOnce).to.be.equal(true);
        expect(emitEventStub.calledAfter(retrieveDataStub)).to.be.equal(true);

        emit.retrieveData.restore();
        emit.emitEvent.restore();
      });
    });
  });

  describe('#retrieveData()', () => {
    it('should use the data args if provided over path', () => {
      emit.options.path = '/some/path';
      emit.options.data = '{"key": "value"}';
      emit.retrieveData().then(() => {
        expect(emit.data).to.deep.equal({ key: 'value' });
      });
    });

    it('should use and prase the data args if provided', () => {
      emit.options.path = '/some/path';
      emit.options.data = '{"key": "value"}';
      return emit.retrieveData().then(() => {
        expect(emit.data).to.deep.equal({ key: 'value' });
      });
    });

    it('it should parse the file if a relative file path is provided', () => {
      serverless.config.servicePath = testUtils.getTmpDirPath();
      const data = { testProp: 'testValue' };
      serverless.utils.writeFileSync(
        path.join(serverless.config.servicePath, 'data.json'),
        JSON.stringify(data)
      );
      emit.options.path = 'data.json';

      return emit.retrieveData().then(() => {
        expect(emit.data).to.deep.equal(data);
      });
    });

    it('it should parse the file if an absolute file path is provided', () => {
      serverless.config.servicePath = testUtils.getTmpDirPath();
      const data = { testProp: 'testValue' };
      const dataFile = path.join(serverless.config.servicePath, 'data.json');
      serverless.utils.writeFileSync(dataFile, JSON.stringify(data));
      emit.options.path = dataFile;

      return emit.retrieveData().then(() => {
        expect(emit.data).to.deep.equal(data);
      });
    });

    it('it should parse a yaml file if a file path is provided', () => {
      serverless.config.servicePath = testUtils.getTmpDirPath();
      const yamlContent = 'testProp: testValue';

      serverless.utils.writeFileSync(
        path.join(serverless.config.servicePath, 'data.yml'),
        yamlContent
      );
      emit.options.path = 'data.yml';

      return emit.retrieveData().then(() => {
        expect(emit.data).to.deep.equal({
          testProp: 'testValue',
        });
      });
    });

    it('it should throw error if the file path does not exist', () => {
      serverless.config.servicePath = testUtils.getTmpDirPath();
      emit.options.path = 'some/path';

      return emit.retrieveData().catch(err => {
        expect(err).to.be.an.instanceOf(Error);
        expect(err.message).to.equal('The file you provided does not exist.');
      });
    });
  });
});
