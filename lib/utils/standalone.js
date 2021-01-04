'use strict';

const os = require('os');
const got = require('got');
const isInChina = require('@serverless/utils/is-in-china');

const platform = (() => {
  switch (process.platform) {
    case 'darwin':
      return 'macos';
    default:
      return process.platform;
  }
})();
const arch = (() => {
  switch (process.arch) {
    case 'x32':
      return 'x86';
    case 'arm':
    case 'arm64':
      return 'armv6';
    default:
      return process.arch;
  }
})();

module.exports = {
  resolveLatestTag: async () => {
    const { body } = await got(
      isInChina
        ? 'https://sls-standalone-sv-1300963013.cos.na-siliconvalley.myqcloud.com/latest-tag'
        : 'https://api.github.com/repos/serverless/serverless/releases/latest'
    );
    return isInChina ? body : JSON.parse(body).tag_name;
  },
  resolveUrl: (tagName) => {
    return isInChina
      ? `https://sls-standalone-sv-1300963013.cos.na-siliconvalley.myqcloud.com/${tagName}/` +
          `serverless-${platform}-${arch}`
      : `https://github.com/serverless/serverless/releases/download/${tagName}/` +
          `serverless-${platform}-${arch}`;
  },
  path: `${os.homedir()}/.serverless/bin/serverless`,
};
