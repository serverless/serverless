'use strict';

const { expect } = require('chai');
const path = require('path');
const os = require('os');
const fsp = require('fs').promises;
const fse = require('fs-extra');
const resolveLocalServerless = require('../../../../lib/cli/resolve-local-serverless-path');

describe('test/unit/lib/cli/resolve-local-serverless.test.js', () => {
  it('should resolve with `null` when no local installation is found', () => {
    expect(resolveLocalServerless()).to.equal(null);
  });

  it('should resolve with `null` when no local installation is found', async () => {
    resolveLocalServerless.delete();
    const tmpServerlessPath = path.resolve(
      await fsp.realpath(os.homedir()),
      'node_modules/serverless'
    );
    await fse.ensureDir(path.resolve(tmpServerlessPath, 'lib'));
    await Promise.all([
      fse.ensureFile(path.resolve(tmpServerlessPath, 'lib/Serverless.js')),
      fsp.writeFile(
        path.resolve(tmpServerlessPath, 'package.json'),
        JSON.stringify({ main: 'lib/Serverless.js' })
      ),
    ]);
    expect(await fsp.realpath(resolveLocalServerless())).to.equal(tmpServerlessPath);
  });
});
