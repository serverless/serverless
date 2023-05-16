'use strict';

const expect = require('chai').expect;
const getTmpDirPath = require('../../../../../lib/utils/fs/get-tmp-dir-path');

describe('#getTmpDirPath()', () => {
  it('should return a scoped tmp dir path', () => {
    const tmpDirPath = getTmpDirPath();
    expect(tmpDirPath).to.match(/tmpdirs-serverless/);
  });
});
