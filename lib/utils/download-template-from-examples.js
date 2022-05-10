'use strict';

const path = require('path');
const os = require('os');
const download = require('@serverless/utils/download');
const fse = require('fs-extra');
const fsp = require('fs').promises;
const untildify = require('untildify');
const renameService = require('./rename-service').renameService;
const ServerlessError = require('../serverless-error');
const dirExists = require('./fs/dir-exists');
const safeMoveFile = require('./fs/safe-move-file');

const resolveServiceName = (serviceDir) => {
  let serviceName = path
    .basename(serviceDir)
    .toLowerCase()
    .replace(/[^0-9a-z.]+/g, '-');
  if (!serviceName.match(/^[a-z]/)) serviceName = `service-${serviceName}`;
  return serviceName;
};

async function downloadTemplateFromExamples({ template, name, path: projectPath, isLegacy }) {
  const downloadUrl = 'https://github.com/serverless/examples/archive/v3.zip';
  let pathToDirectory;
  if (isLegacy) {
    pathToDirectory = `legacy/${template}`;
  } else {
    pathToDirectory = template;
  }

  const downloadServicePath = path.join(os.tmpdir(), 'examples');

  const serviceDir = projectPath ? path.resolve(untildify(projectPath)) : process.cwd();
  const serviceName = name || resolveServiceName(serviceDir);

  // We do not want to run this check if project should be setup in current directory
  if (serviceDir !== process.cwd() && (await dirExists(serviceDir))) {
    const errorMessage = [
      `The directory "${serviceDir}" already exists, and serverless will not overwrite it. `,
      'Rename or move the directory and try again if you want serverless to create it"',
    ].join('');
    throw new ServerlessError(errorMessage, 'TARGET_FOLDER_ALREADY_EXISTS');
  }

  const downloadOptions = {
    timeout: 30000,
    extract: true,
    strip: 1,
    mode: '755',
  };

  try {
    await download(downloadUrl, downloadServicePath, downloadOptions);
  } catch (err) {
    throw new ServerlessError(
      `Could not download template. Ensure that you are using the latest version of Serverless Framework: ${err.message}`,
      'TEMPLATE_DOWNLOAD_FAILED'
    );
  }

  // Examples repo has all examples nested in directories
  const directory = path.join(downloadServicePath, pathToDirectory);

  try {
    if (serviceDir === process.cwd()) {
      // ensure no template file already exists in current directory that we may overwrite
      const topLevelContentList = await fsp.readdir(directory);
      await Promise.all(
        topLevelContentList.map(async (f) => {
          let exists;
          try {
            await fsp.access(path.join(process.cwd(), f));
            exists = true;
          } catch (err) {
            // Ignore, file does not exist
          }
          if (exists) {
            const errorMessage = [
              `The file or directory "${f}" already exists, and serverless will not overwrite it. `,
              `Move it and try again if you want serverless to write a new "${f}"`,
            ].join('');
            throw new ServerlessError(errorMessage, 'TEMPLATE_FILE_ALREADY_EXISTS');
          }
        })
      );

      await Promise.all(
        topLevelContentList.map(async (f) => {
          await safeMoveFile(path.join(directory, f), path.join(serviceDir, f));
        })
      );
    } else {
      await safeMoveFile(directory, serviceDir);
    }
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new ServerlessError(
        'Could not find provided template. Ensure that the template provided with "--template" exists.',
        'INVALID_TEMPLATE'
      );
    }

    if (err.code === 'EACCESS') {
      const errorMessage = [
        'Error unable to create a service in this directory. ',
        'Please check that you have the required permissions to write to the directory',
      ].join('');

      throw new ServerlessError(errorMessage, 'UNABLE_TO_CREATE_SERVICE');
    }

    throw err;
  }

  // Cleanup whole downloaded dir
  await fse.remove(downloadServicePath);

  if (template !== 'plugin') {
    renameService(serviceName, serviceDir);
  }
  return serviceName;
}

module.exports = downloadTemplateFromExamples;
