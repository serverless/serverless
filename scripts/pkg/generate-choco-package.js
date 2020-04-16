#!/usr/bin/env node

// Node.js v10+ only

'use strict';

require('essentials');

const argv = require('yargs-parser')(process.argv.slice(2), {
  boolean: ['help'],
  alias: { help: 'h' },
});

const [versionTag] = argv._;

const usage = `Usage: ./scripts/pkg/generate-choco-package [-h | --help] <versionTag>

Generates choco package

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

const path = require('path');
const fs = require('fs');
const os = require('os');
const { promisify } = require('util');
const pipeline = promisify(require('stream').pipeline);
const fse = require('fs-extra');
const fetch = require('node-fetch');
const xml2js = require('xml2js');
const packageMeta = require('../../package');

const xmlToJson = promisify(xml2js.parseString);
const ensureDir = promisify(fse.ensureDir);
const copy = promisify(fse.copy);
const { readFile, writeFile } = fs.promises;
const serverlessPath = path.join(__dirname, '../../');
const chocoPackageTemplatePath = path.join(__dirname, 'choco-package-template');

(async () => {
  const deferredLicenseContent = Promise.all([
    readFile(path.join(chocoPackageTemplatePath, 'tools/LICENSE.txt'), 'utf8'),
    readFile(path.join(serverlessPath, 'LICENSE.txt'), 'utf8'),
  ]);
  const chocoPackagePath = path.join(os.tmpdir(), 'serverless-choco-package');
  const chocoPackageToolsPath = path.join(chocoPackagePath, 'tools');
  const binaryUrl =
    'https://github.com/serverless/serverless/releases/download/' +
    `${versionTag}/serverless-win-x64.exe`;

  await Promise.all([
    // Copy package template to temporary package directory
    copy(chocoPackageTemplatePath, chocoPackagePath).then(() =>
      Promise.all([
        // Copy LICENSE
        (async () => {
          const [packagedLicenseTemplateContent, licenseContent] = await deferredLicenseContent;
          return writeFile(
            path.join(chocoPackageToolsPath, 'LICENSE.txt'),
            packagedLicenseTemplateContent.replace('TO_BE_GENERATED', licenseContent)
          );
        })(),
        (async () => {
          // Autogenerate meta data
          const nuspecPath = path.join(chocoPackagePath, 'serverless.nuspec');
          const data = await xmlToJson(await readFile(nuspecPath));
          const {
            metadata: [metadata],
          } = data.package;
          metadata.version[0] = versionTag.slice(1);
          metadata.releaseNotes[0] = `https://github.com/serverless/serverless/releases/tag/${versionTag}`;
          metadata.copyright[0] = `${new Date().getFullYear()}, Serverless Inc.`;
          metadata.tags[0] = packageMeta.keywords
            .filter(keyword => !keyword.includes(' '))
            .join(' ');
          metadata.summary[0] = packageMeta.description;
          metadata.description[0] = packageMeta.description;
          const xmlBuilder = new xml2js.Builder();
          const result = xmlBuilder.buildObject(data);
          return writeFile(nuspecPath, result);
        })(),
      ])
    ),
    // Download binary into package tools folder
    ensureDir(chocoPackageToolsPath)
      .then(() => fetch(binaryUrl))
      .then(response => {
        if (response.status >= 400) {
          throw new Error(`${response.status}: Request to ${binaryUrl} was rejected`);
        }
        return pipeline(
          response.body,
          fs.createWriteStream(path.join(chocoPackageToolsPath, 'serverless.exe'))
        );
      }),
  ]);

  process.stdout.write(`${chocoPackagePath}\n`);
})();
