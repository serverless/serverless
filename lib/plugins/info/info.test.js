'use strict';

const expect = require('chai').expect;
const Info = require('./info');
const Serverless = require('../../Serverless');
const sinon = require('sinon');

describe('Info', () => {
  let info;
  let serverless;

  beforeEach(() => {
    serverless = new Serverless();
    info = new Info(serverless);
  });

  describe('#constructor()', () => {
    it('should have commands', () => expect(info.commands).to.be.not.empty);
  });

  describe('"after:info:info" hook', () => {
    let trackStub;

    beforeEach(() => {
      trackStub = sinon.stub(info, 'track').resolves();
    });

    afterEach(() => {
      info.track.restore();
    });

    it('should run the validation', () =>
      expect(info.hooks['after:info:info']())
      .to.be.fulfilled.then(() => expect(trackStub).to.be.called)
    );
  });
});
