'use strict';

const chai = require('chai');
const Invoke = require('./invoke');
const Serverless = require('../../Serverless');

chai.use(require('chai-as-promised'));

const expect = chai.expect;

describe('Invoke', () => {
  let invoke;
  let serverless;

  beforeEach(() => {
    serverless = new Serverless();
    invoke = new Invoke(serverless);
  });

  describe('#constructor()', () => {
    it('should have commands', () => expect(invoke.commands).to.be.not.empty);
    it('should have hooks', () => expect(invoke.hooks).to.be.not.empty);
  });

  describe('#loadEnvVarsForLocal()', () => {
    it('should set IS_LOCAL', () => {
      delete process.env.IS_LOCAL;
      return expect(invoke.loadEnvVarsForLocal()).to.be.fulfilled
      .then(() => expect(process.env.IS_LOCAL).to.equal('true'));
    });
  });

  describe('hooks', () => {
    describe('invoke:local:loadEnvVars', () => {
      it('should be an event', () => {
        expect(invoke.commands.invoke.commands.local.lifecycleEvents).to.contain('loadEnvVars');
      });

      it('should set IS_LOCAL', () => {
        delete process.env.IS_LOCAL;
        return expect(invoke.hooks['invoke:local:loadEnvVars']()).to.be.fulfilled
        .then(() => expect(process.env.IS_LOCAL).to.equal('true'));
      });
    });
  });
});
