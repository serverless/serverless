'use strict';

const chai = require('chai');
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const path = require('path');
const os = require('os');
const Serverless = require('../../Serverless');
const testUtils = require('../../../tests/utils');
const CLI = require('../../classes/CLI');

chai.use(require('chai-as-promised'));

const expect = chai.expect;

describe('Emit', () => {
  describe('#constructor()', () => {
    let emit;
    let serverless;
    let emitEventStub;

    beforeEach(() => {
      serverless = new Serverless();
      serverless.cli = new CLI(serverless);
      emitEventStub = sinon.stub().resolves();
      const Emit = proxyquire('./index', {
        '@serverless/fdk': {
          eventGateway: () => ({
            emit: emitEventStub,
          }),
        },
      });
      emit = new Emit(serverless);
    });

    it('should have commands', () => expect(emit.commands).to.be.not.empty);
    it('should have hooks', () => expect(emit.hooks).to.be.not.empty);

    it('should run promise chain in order', () => {
      const retrieveDataStub = sinon.stub(emit, 'retrieveData').resolves();
      emitEventStub = sinon.stub(emit, 'emitEvent').resolves();

      return emit.hooks['emit:emit']().then(() => {
        expect(retrieveDataStub.calledOnce).to.be.equal(true);
        expect(emitEventStub.calledAfter(retrieveDataStub)).to.be.equal(true);

        emit.retrieveData.restore();
        emit.emitEvent.restore();
      });
    });
  });

  describe('#retrieveData()', () => {
    let emit;
    let serverless;
    let emitEventStub;

    beforeEach(() => {
      serverless = new Serverless();
      serverless.cli = new CLI(serverless);
      emitEventStub = sinon.stub().resolves();
      const Emit = proxyquire('./index', {
        '@serverless/fdk': {
          eventGateway: () => ({
            emit: emitEventStub,
          }),
        },
      });
      emit = new Emit(serverless);
    });

    it('should use the data args if provided over path', () => {
      emit.options.path = '/some/path';
      emit.options.data = '{"key": "value"}';
      return emit.retrieveData().then(() => {
        expect(emit.data).to.deep.equal({ key: 'value' });
      });
    });

    it('should use and prase the data args if provided', () => {
      emit.options.data = '{"key": "value"}';
      return emit.retrieveData().then(() => {
        expect(emit.data).to.deep.equal({ key: 'value' });
      });
    });

    it('should use and not parse the data args if a datatype is provided', () => {
      emit.options.data = 'Hello World';
      emit.options.datatype = 'text/plain';
      return emit.retrieveData().then(() => {
        expect(emit.data).to.deep.equal('Hello World');
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

  describe('#emitEvent() - logged in', () => {
    let emit;
    let serverless;
    let emitEventStub;
    let logStub;

    beforeEach(() => {
      serverless = new Serverless();
      serverless.cli = new CLI(serverless);
      emitEventStub = sinon.stub().resolves();
      const Emit = proxyquire('./index', {
        '@serverless/fdk': {
          eventGateway: () => ({
            emit: emitEventStub,
          }),
        },
        '../../utils/getAuthToken': () => 'abc123',
      });
      emit = new Emit(serverless);
      logStub = sinon.stub(emit.serverless.cli, 'consoleLog');
    });
    it('should emit an event using the name args', () => {
      emit.options.name = 'userCreated';
      emit.data = { key: 'value' };
      return emit.emitEvent().then(() => {
        expect(emitEventStub.calledOnce).to.equal(true);
        expect(
          emitEventStub.calledWithMatch({
            event: emit.options.name,
            data: emit.data,
          })
        ).to.equal(true);
        expect(logStub.getCall(0).args[0]).to.equal([
          ' Serverless       Emitted the event userCreated as datatype application/json:',
          '                    {\n                      "key": "value"\n                    }',
        ].join(os.EOL));
      });
    });

    it('should emit an event with a custom datatype', () => {
      emit.options.name = 'userCreated';
      emit.options.datatype = 'text/plain';
      emit.data = 'This is a message';
      return emit.emitEvent().then(() => {
        expect(emitEventStub.calledOnce).to.equal(true);
        expect(
          emitEventStub.calledWithMatch({
            event: emit.options.name,
            data: emit.data,
            dataType: 'text/plain',
          })
        ).to.equal(true);
        expect(logStub.getCall(0).args[0]).to.equal([
          ' Serverless       Emitted the event userCreated as datatype text/plain:',
          '                    "This is a message"',
        ].join(os.EOL));
      });
    });
  });

  describe('#emitEvent() - logged out', () => {
    let emit;
    let serverless;
    let emitEventStub;

    beforeEach(() => {
      serverless = new Serverless();
      serverless.cli = new CLI(serverless);
      emitEventStub = sinon.stub().resolves();
      const Emit = proxyquire('./index', {
        '@serverless/fdk': {
          eventGateway: () => ({
            emit: emitEventStub,
          }),
        },
        '../../utils/getAuthToken': () => null,
      });
      emit = new Emit(serverless);
    });

    it('should throw an Error of not logged in', () => {
      emit.options.name = 'userCreated';
      emit.data = { key: 'value' };
      return emit.emitEvent().catch(err => {
        expect(err).to.be.an.instanceOf(Error);
        expect(err.message).to.equal(
          'Must be logged in to use this command. Please run "serverless login".'
        );
      });
    });
  });
});
