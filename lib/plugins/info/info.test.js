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

  describe('"before:info:info" hook', () => {
    let validateStub;

    beforeEach(() => {
      validateStub = sinon.stub(info, 'validate').resolves();
    });

    afterEach(() => {
      info.validate.restore();
    });

    it('should run the validation', () =>
      expect(info.hooks['before:info:info']())
      .to.be.fulfilled.then(() => expect(validateStub).to.be.called)
    );
  });
});
