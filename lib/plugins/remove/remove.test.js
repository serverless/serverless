'use strict';

const expect = require('chai').expect;
const Remove = require('./remove');
const Serverless = require('../../Serverless');
const sinon = require('sinon');

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

    it('should track the execution', () => expect(remove.hooks['after:remove:remove']())
      .to.be.fulfilled.then(() => expect(trackStub).to.be.called)
    );
  });
});
