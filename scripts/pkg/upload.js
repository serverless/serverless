#!/usr/bin/env node

// Node.js v10+ only

'use strict';

require('essentials');

const argv = require('minimist')(process.argv.slice(2), {
  boolean: ['help'],
  alias: { help: 'h' },
});

const [versionTag] = argv._;

const usage = `Usage: ./scripts/pkg/upload-executables [-h | --help] <versionTag>

Uploads binary files found in ./dist folder into GitHub release.
Github OAuth token is expected to be exposed at GITHUB_TOKEN env var

Options:

    --help,   -h  Show this message
`;

if (argv.help) {
  process.stdout.write(usage);
  return;
}

if (!versionTag) {
  process.stdout.write(usage);
  return;
}

const chalk = require('chalk');

if (!/^v\d+\.\d+\.\d+$/.test(versionTag)) {
  process.stdout.write(chalk.red(`Invalid version tag: ${versionTag}\n`));
  process.exitCode = 1;
  return;
}
if (!process.env.GITHUB_TOKEN) {
  process.stdout.write(chalk.red('Missing GITHUB_TOKEN env var\n'));
  process.exitCode = 1;
  return;
}

const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');

const distPath = path.join(__dirname, '../../dist');
const API_URL = 'https://api.github.com/repos/serverless/serverless/releases/';
const API_UPLOADS_URL = 'https://uploads.github.com/repos/serverless/serverless/releases/';
const requestOptions = { headers: { Authorization: `token ${process.env.GITHUB_TOKEN}` } };
const binaryBasenameMatcher = /^serverless-([a-z0-9]+)(?:-([a-z0-9]+))?(\.exe)?$/;

const request = async (url, options) => {
  const response = await fetch(url, options);
  if (response.status === 204) return null;
  const result = await response.json();
  if (response.status >= 400) {
    throw new Error(
      `${response.status}: Request to ${url} was rejected:\n ${JSON.stringify(result, null, 2)}`
    );
  }
  return result;
};

const releaseIdDeferred = request(`${API_URL}tags/${versionTag}`, requestOptions).then(
  result => result.id
);
const releaseAssetsDeferred = releaseIdDeferred.then(releaseId =>
  request(`${API_URL}${releaseId}/assets`, requestOptions)
);

(async () => {
  const distFileBasenames = await fs.promises.readdir(distPath);
  return Promise.all(
    distFileBasenames.map(async distFileBasename => {
      const distFileBasenameTokens = distFileBasename.match(binaryBasenameMatcher);
      if (!distFileBasenameTokens) throw new Error(`Unexpected dist file ${distFileBasename}`);
      const targetBinaryName = `serverless-${
        distFileBasenameTokens[1]
      }-${distFileBasenameTokens[2] || 'x64'}${distFileBasenameTokens[3] || ''}`;
      const existingAssetData = (await releaseAssetsDeferred).find(
        assetData => assetData.name === targetBinaryName
      );
      if (existingAssetData) {
        await request(`${API_URL}assets/${existingAssetData.id}`, {
          method: 'DELETE',
          headers: requestOptions.headers,
        });
      }
      const filePath = path.join(distPath, distFileBasename);
      await request(
        `${API_UPLOADS_URL}${await releaseIdDeferred}/assets?name=${targetBinaryName}`,
        {
          method: 'POST',
          body: fs.createReadStream(filePath),
          headers: {
            ...requestOptions.headers,
            'content-length': (await fs.promises.stat(filePath)).size,
            'content-type': 'application/octet-stream',
          },
        }
      );
      process.stdout.write(chalk.green(`${targetBinaryName} uploaded\n`));
    })
  );
})();
