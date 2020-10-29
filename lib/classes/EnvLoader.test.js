'use strict';

const chai = require('chai');
const runServerless = require('../../test/utils/run-serverless');

chai.use(require('chai-as-promised'));
const expect = require('chai').expect;

describe('EnvLoader', () => {
  describe('with useDotenv', () => {
    it('should load matching stage env file if present', async () => {
      const result = await runServerless({
        fixture: 'envLoader',
        configExt: {
          useDotenv: true,
        },
        cliArgs: ['-s', 'testing', 'print'],
      });
      expect(result.serverless.service.custom.fromDefaultEnv).to.be.undefined;
      expect(result.serverless.service.custom.fromStageEnv).to.equal('valuefromstage');
    });

    it('should load from default env file if present and no matching stage file found', async () => {
      const result = await runServerless({
        fixture: 'envLoader',
        configExt: {
          useDotenv: true,
        },
        cliArgs: ['-s', 'nottesting', 'print'],
      });

      expect(result.serverless.service.custom.fromDefaultEnv).to.equal('valuefromdefault');
      expect(result.serverless.service.custom.fromStageEnv).to.be.undefined;
    });
  });

  describe('without useDotenv', () => {
    it('should not load from env files', async () => {
      const result = await runServerless({
        fixture: 'envLoader',
        cliArgs: ['print'],
      });

      expect(result.serverless.service.custom.fromDefaultEnv).to.be.undefined;
      expect(result.serverless.service.custom.fromStageEnv).to.be.undefined;
    });
  });
});
