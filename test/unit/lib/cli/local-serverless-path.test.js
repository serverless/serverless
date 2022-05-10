'use strict';

const { expect } = require('chai');
const path = require('path');
const os = require('os');
const fsp = require('fs').promises;
const fse = require('fs-extra');

describe('test/unit/lib/cli/local-serverless.test.js', () => {
  beforeEach(() => {
    delete require.cache[require.resolve('../../../../lib/cli/local-serverless-path')];
  });

  it('should resolve with `null` when no local installation is found', () => {
    expect(require('../../../../lib/cli/local-serverless-path')).to.equal(null);
  });

  it('should resolve with `null` when no local installation is found', async () => {
    const tmpServerlessPath = path.resolve(
      await fsp.realpath(os.homedir()),
      'node_modules/serverless'
    );
    await fse.ensureDir(path.resolve(tmpServerlessPath, 'lib'));
    await Promise.all([
      fse.ensureFile(path.resolve(tmpServerlessPath, 'lib/serverless.js')),
      fsp.writeFile(
        path.resolve(tmpServerlessPath, 'package.json'),
        JSON.stringify({ main: 'lib/serverless.js' })
      ),
    ]);
    expect(await fsp.realpath(require('../../../../lib/cli/local-serverless-path'))).to.equal(
      tmpServerlessPath
    );
  });
});
