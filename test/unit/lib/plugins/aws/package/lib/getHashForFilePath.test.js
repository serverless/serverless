'use strict';

const chai = require('chai');
const getHashForFilePath = require('../../../../../../../lib/plugins/aws/utils/getHashForFilePath');
const fs = require('fs');
const path = require('path');

chai.use(require('chai-as-promised'));

const expect = chai.expect;

describe('getHashForFilePath', () => {
  let filePath;
  before(async () => {
    filePath = path.join(process.cwd(), 'file.txt');
    await fs.promises.writeFile(filePath, 'content');
  });

  it('correctly generates hash for existing file', async () => {
    const result = await getHashForFilePath(filePath);
    expect(result).to.equal('7XACtDnprIRfIjV9giusFERzD722AW0+yUMil7nsn3M=');
  });

  it('correctly generates hash for existing file', async () => {
    const result = await getHashForFilePath(filePath, 'hex');
    expect(result).to.equal('ed7002b439e9ac845f22357d822bac1444730fbdb6016d3ec9432297b9ec9f73');
  });

  it('throws an error when fails to read the file', () => {
    expect(getHashForFilePath(path.join(process.cwd(), 'nonexistent.txt'))).to.eventually.be
      .rejected;
  });
});
