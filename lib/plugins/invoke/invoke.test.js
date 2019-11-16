'use strict';

const chai = require('chai');
const overrideEnv = require('process-utils/override-env');
const Invoke = require('./invoke');
const Serverless = require('../../Serverless');

chai.use(require('chai-as-promised'));

const expect = chai.expect;

describe('Invoke', () => {
  let invoke;
  let serverless;
  let restoreEnv;

  beforeEach(() => {
    ({ restoreEnv } = overrideEnv());
    serverless = new Serverless();
    invoke = new Invoke(serverless);
  });

  afterEach(() => restoreEnv());

  describe('#constructor()', () => {
    it('should have commands', () => expect(invoke.commands).to.be.not.empty);
    it('should have hooks', () => expect(invoke.hooks).to.be.not.empty);
  });

  describe('#loadEnvVarsForLocal()', () => {
    it('should set IS_LOCAL', () =>
      expect(invoke.loadEnvVarsForLocal()).to.be.fulfilled.then(() =>
        expect(process.env.IS_LOCAL).to.equal('true')
      ));
  });

  describe('hooks', () => {
    describe('invoke:local:loadEnvVars', () => {
      it('should be an event', () => {
        expect(invoke.commands.invoke.commands.local.lifecycleEvents).to.contain('loadEnvVars');
      });

      it('should set IS_LOCAL', () =>
        expect(invoke.hooks['invoke:local:loadEnvVars']()).to.be.fulfilled.then(() =>
          expect(process.env.IS_LOCAL).to.equal('true')
        ));

      it('should accept a single env option', () => {
        invoke.options = { env: 'NAME=value' };
        return expect(invoke.hooks['invoke:local:loadEnvVars']()).to.be.fulfilled.then(() =>
          expect(process.env.NAME).to.equal('value')
        );
      });

      it('should accept multiple env options', () => {
        invoke.options = { env: ['NAME1=val1', 'NAME2=val2'] };

        return expect(invoke.hooks['invoke:local:loadEnvVars']())
          .to.be.fulfilled.then(() => expect(process.env.NAME1).to.equal('val1'))
          .then(() => expect(process.env.NAME2).to.equal('val2'));
      });
    });
  });
});
