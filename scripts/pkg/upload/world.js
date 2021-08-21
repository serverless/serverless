'use strict';

const path = require('path');
const fs = require('fs');
const fsp = require('fs').promises;
const fetch = require('node-fetch');
const chalk = require('chalk');

const distPath = path.join(__dirname, '../../../dist');
const API_URL = 'https://api.github.com/repos/serverless/serverless/releases/';
const API_UPLOADS_URL = 'https://uploads.github.com/repos/serverless/serverless/releases/';
const requestOptions = { headers: { Authorization: `token ${process.env.GITHUB_TOKEN}` } };
const binaryBasenameMatcher = /^serverless-([a-z0-9]+)(?:-([a-z0-9]+))?(\.exe)?$/;

module.exports = async (versionTag, { isLegacyVersion }) => {
  if (!process.env.GITHUB_TOKEN) {
    process.stdout.write(chalk.red('Missing GITHUB_TOKEN env var\n'));
    process.exitCode = 1;
    return;
  }

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
    (result) => result.id
  );
  const releaseAssetsDeferred = releaseIdDeferred.then((releaseId) =>
    request(`${API_URL}${releaseId}/assets`, requestOptions)
  );

  const distFileBasenames = await fsp.readdir(distPath);
  await Promise.all(
    distFileBasenames
      .map(async (distFileBasename) => {
        const distFileBasenameTokens = distFileBasename.match(binaryBasenameMatcher);
        if (!distFileBasenameTokens) throw new Error(`Unexpected dist file ${distFileBasename}`);
        const targetBinaryName = `serverless-${distFileBasenameTokens[1]}-${
          distFileBasenameTokens[2] || 'x64'
        }${distFileBasenameTokens[3] || ''}`;
        const existingAssetData = (await releaseAssetsDeferred).find(
          (assetData) => assetData.name === targetBinaryName
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
              'content-length': (await fsp.stat(filePath)).size,
              'content-type': 'application/octet-stream',
            },
          }
        );
        process.stdout.write(chalk.green(`${targetBinaryName} uploaded to GitHub\n`));
      })
      .concat(
        isLegacyVersion
          ? releaseIdDeferred.then((releaseId) =>
              request(`${API_URL}${releaseId}`, {
                method: 'PATCH',
                headers: requestOptions.headers,
                body: JSON.stringify({ prerelease: true }),
              })
            )
          : []
      )
  );
};
