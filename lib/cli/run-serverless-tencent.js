'use strict';

const { createRequire } = require('module');
const os = require('os');
const path = require('path');
const fsp = require('fs').promises;
const childProcess = require('child_process');
const spawn = require('child-process-ext/spawn');

const relativeBinPath = 'serverless-tencent/bin/serverless-tencent';
const standaloneFilename = path.resolve(
  os.homedir(),
  `.serverless-tencent/bin/serverless-tencent${process.platform === 'win32' ? '.exe' : ''}`
);
const standaloneServerUrl = 'https://slt-binary-sv-1300963013.file.myqcloud.com';

const resolveAbsoluteModulePath = (contextDirname, modulePath) => {
  try {
    return createRequire(path.resolve(contextDirname, 'require-resolver')).resolve(modulePath);
  } catch {
    return null;
  }
};

const resolveGlobalNpmPath = async () => {
  const npmNodeModulesPath = await (async () => {
    try {
      return String((await spawn('npm', ['root', '-g'])).stdoutBuffer).trim();
    } catch (error) {
      return null;
    }
  })();

  if (!npmNodeModulesPath) return null;
  try {
    return require.resolve(`${npmNodeModulesPath}/${relativeBinPath}`);
  } catch (globalDepError) {
    return null;
  }
};

const isStandaloneInstalled = async () => {
  try {
    await fsp.access(standaloneFilename);
    return true;
  } catch {
    return false;
  }
};

const resolvePlatform = () => {
  switch (process.platform) {
    case 'darwin':
      return 'macos';
    case 'win32':
      return 'win';
    default:
      return process.platform;
  }
};
const resolveArch = () => {
  switch (process.arch) {
    case 'x32':
      return 'x86';
    case 'arm':
    case 'arm64':
      return 'armv6';
    default:
      return process.arch;
  }
};

const resolveExtname = () => {
  return process.platform === 'win32' ? '.exe' : '';
};

module.exports = async () => {
  // 1. If installed locally in service node_modules, run it
  const localNpmPath = resolveAbsoluteModulePath(process.cwd(), relativeBinPath);
  if (localNpmPath) {
    require(localNpmPath);
    return;
  }

  // 2. If installed as npm global installation, run it
  const globalNpmPath = await resolveGlobalNpmPath();
  if (globalNpmPath) {
    require(globalNpmPath);
    return;
  }

  // 3. Fallback to standalone executable
  if (!(await isStandaloneInstalled())) {
    // 3.1 Auto install if not installed
    const getCliProgressFooter = require('cli-progress-footer');
    const cliProgressFooter = getCliProgressFooter();
    cliProgressFooter.shouldAddProgressAnimationPrefix = true;
    cliProgressFooter.progressAnimationPrefixFrames =
      cliProgressFooter.progressAnimationPrefixFrames.map((frame) => `\x1b[93m${frame}\x1b[39m`);

    // EN: Installing Tencent Serverless CLI...
    cliProgressFooter.updateProgress('正在安装 Tencent Serverless CLI');

    try {
      const stream = require('stream');
      const { promisify } = require('util');
      const fs = require('fs');
      const fse = require('fs-extra');
      const got = require('got');
      const safeMoveFile = require('../utils/fs/safe-move-file');

      const pipeline = promisify(stream.pipeline);

      const latestTag = (await got(`${standaloneServerUrl}/latest-tag`)).body;
      const standaloneTmpPath = path.resolve(os.tmpdir(), 'serverless-tencent-binary-tmp');

      try {
        await pipeline(
          got.stream(
            `${standaloneServerUrl}/${latestTag}/serverless-tencent-${resolvePlatform()}-${resolveArch()}${resolveExtname()}`
          ),
          fs.createWriteStream(standaloneTmpPath)
        );
      } catch (error) {
        if (error.response && error.response.statusCode === 404) {
          process.stdout.write(
            `${[
              '',
              // EN: Unable to install Tencent Serverless CLI automatically.
              '无法自动安装 Tencent Serverless CLI.',
              // EN: Please use "npm install -g serverless-tencent" to complete the manual
              //     installation and re-execute this command
              '请使用 "npm install -g serverless-tencent" 完成手动安装，并重新执行此命令',
            ].join('\n')}\n`
          );
          return;
        }
        throw error;
      }
      await fse.ensureDir(path.dirname(standaloneFilename));
      await safeMoveFile(standaloneTmpPath, standaloneFilename);
      await fsp.chmod(standaloneFilename, 0o755);
    } finally {
      cliProgressFooter.updateProgress();
    }
  }

  childProcess
    .spawn(standaloneFilename, process.argv.slice(2), { stdio: 'inherit' })
    .on('close', (code) => {
      process.exitCode = code;
    });
};
