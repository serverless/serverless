'use strict';

const chai = require('chai');
const path = require('path');
const sinon = require('sinon');
const overrideEnv = require('process-utils/override-env');
const overrideCwd = require('process-utils/override-cwd');
const loadEnv = require('./loadEnv');
const writeFileSync = require('./utils/fs/writeFileSync');
const { createTmpDir } = require('../test/utils/fs');
const dotenv = require('dotenv');
const ServerlessError = require('./classes/Error').ServerlessError;

chai.use(require('chai-as-promised'));
const expect = require('chai').expect;

describe('loadEnv', () => {
  let restoreEnv;
  let restoreCwd;

  beforeEach(() => {
    const tmpDir = createTmpDir();
    restoreCwd = overrideCwd(tmpDir).restoreCwd;

    const stage = 'testing';
    const stageFileContent = 'FROM_STAGE=valuefromstage';
    writeFileSync(path.join(tmpDir, `.env.${stage}`), stageFileContent);

    const defaultFileContent = 'FROM_DEFAULT=valuefromdefault';
    writeFileSync(path.join(tmpDir, '.env'), defaultFileContent);

    restoreEnv = overrideEnv().restoreEnv;
  });

  afterEach(() => {
    restoreEnv && restoreEnv();
    restoreCwd && restoreCwd();
  });

  it('should load matching stage env file if present', async () => {
    await loadEnv('testing');
    expect(process.env.FROM_DEFAULT).to.be.undefined;
    expect(process.env.FROM_STAGE).to.equal('valuefromstage');
  });

  it('should load from default env file if present and no matching stage file found', async () => {
    await loadEnv('nonmatchingstage');
    expect(process.env.FROM_DEFAULT).to.equal('valuefromdefault');
    expect(process.env.FROM_STAGE).to.be.undefined;
  });

  it('should throw ServerlessError if dotenv returns error other than missing file', () => {
    const errorMessage = 'Unexpected error while loading env';
    const dotenvResult = sinon.stub(dotenv, 'config').returns({ error: new Error(errorMessage) });

    expect(loadEnv('testing')).to.be.rejectedWith(ServerlessError, errorMessage);
    dotenvResult.restore();
  });
});
