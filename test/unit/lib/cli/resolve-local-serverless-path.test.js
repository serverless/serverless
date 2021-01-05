'use strict';

const { expect } = require('chai');
const path = require('path');
const os = require('os');
const fse = require('fs-extra');
const resolveLocalServerless = require('../../../../lib/cli/resolve-local-serverless-path');

describe('test/unit/lib/cli/resolve-local-serverless.test.js', () => {
  it('should resolve with `null` when no local installation is found', async () => {
    expect(await resolveLocalServerless()).to.equal(null);
  });
  it('should resolve with `null` when no local installation is found', async () => {
    resolveLocalServerless.delete();
    const tmpServerlessPath = path.resolve(
      await fse.promises.realpath(os.homedir()),
      'node_modules/serverless.js'
    );
    await fse.ensureFile(tmpServerlessPath);
    expect(await fse.promises.realpath(await resolveLocalServerless())).to.equal(tmpServerlessPath);
  });
});
