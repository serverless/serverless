'use strict';

const chai = require('chai');
const sinon = require('sinon');
const Emit = require('./index');
const Serverless = require('../../Serverless');

chai.use(require('chai-as-promised'));

const expect = chai.expect;

describe('Emit', () => {
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
      const parseDataStub = sinon.stub(emit, 'parseData').resolves();
      const emitEventStub = sinon.stub(emit, 'emitEvent').resolves();

      return emit.hooks['emit:emit']().then(() => {
        expect(retrieveDataStub.calledOnce).to.be.equal(true);
        expect(parseDataStub.calledAfter(retrieveDataStub)).to.be.equal(true);
        expect(emitEventStub.calledAfter(parseDataStub)).to.be.equal(true);

        emit.retrieveData.restore();
        emit.parseData.restore();
        emit.emitEvent.restore();
      });
    });
  });
});
