'use strict';

const chai = require('chai');
const Remove = require('./remove');
const Serverless = require('../../Serverless');
const sinon = require('sinon');

chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));

const expect = chai.expect;

describe('Remove', () => {
  let remove;
  let serverless;

  beforeEach(() => {
    serverless = new Serverless();
    remove = new Remove(serverless);
  });

  describe('#constructor()', () => {
    it('should have access to the serverless instance', () => {
      expect(remove.serverless).to.deep.equal(serverless);
    });

    it('should have commands', () => expect(remove.commands).to.be.not.empty);
  });

  describe('"after:remove:remove" hook', () => {
    let trackStub;

    beforeEach(() => {
      trackStub = sinon.stub(remove, 'track').resolves();
    });

    afterEach(() => {
      remove.track.restore();
    });

    it('should track the execution', () =>
      expect(remove.hooks['after:remove:remove']()).to.be.fulfilled.then(
        () => expect(trackStub).to.be.called
      ));
  });
});
