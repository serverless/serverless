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

  describe('"before:remove:remove" hook', () => {
    let validateStub;

    beforeEach(() => {
      validateStub = sinon.stub(remove, 'validate').resolves();
    });

    afterEach(() => {
      remove.validate.restore();
    });

    it('should run the validation', () => expect(remove.hooks['before:remove:remove']())
      .to.be.fulfilled.then(() => expect(validateStub).to.be.called)
    );
  });
});
