'use strict';

const chai = require('chai');
const getHashForFilePath = require('../../../../../../../lib/plugins/aws/package/lib/get-hash-for-file-path');
const fsp = require('fs').promises;
const path = require('path');

chai.use(require('chai-as-promised'));

const expect = chai.expect;

describe('getHashForFilePath', () => {
  let filePath;
  before(async () => {
    filePath = path.join(process.cwd(), 'file.txt');
    await fsp.writeFile(filePath, 'content');
  });

  it('correctly generates hash for existing file', async () => {
    const result = await getHashForFilePath(filePath);
    expect(result).to.equal('7XACtDnprIRfIjV9giusFERzD722AW0+yUMil7nsn3M=');
  });

  it('throws an error when fails to read the file', () => {
    expect(getHashForFilePath(path.join(process.cwd(), 'nonexistent.txt'))).to.eventually.be
      .rejected;
  });
});
