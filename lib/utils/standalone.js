'use strict';

const os = require('os');
const fetch = require('node-fetch');

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
      return 'armv6';
    case 'arm64':
      if (process.platform === 'darwin') {
        // Handle case of M1 Macs that are using x64 binary via Rosetta
        return 'x64';
      }
      return 'armv6';
    default:
      return process.arch;
  }
})();

module.exports = {
  resolveLatestTag: async () => {
    const response = await fetch('https://api.github.com/repos/serverless/serverless/releases/latest');
    const data = await response.json();
    return data.tag_name;
  },
  resolveUrl: (tagName) => {
    return`https://github.com/serverless/serverless/releases/download/${tagName}/` +
          `serverless-${platform}-${arch}`;
  },
  path: `${os.homedir()}/.serverless/bin/serverless`,
};
