'use strict';
// copied from https://raw.githubusercontent.com/sindresorhus/open/master/index.js
// and adapted for node 6 support. Because open>6 requries node >= 8 but open<6 fails npm audit
// changes:
//  * use bluebird.promisify instead of util.promisfy
//  * Object.assign instead of spread
//  * use Array.prototype.push.apply(a,b) instead of a.push(...b)
//  * async/await -> then :|
//  * prettified with our config

const { promisify } = require('bluebird');
const chalk = require('chalk');
const path = require('path');
const childProcess = require('child_process');
const fs = require('fs');
const isWsl = require('is-wsl');

const pAccess = promisify(fs.access);
const pExecFile = promisify(childProcess.execFile);

// Path to included `xdg-open`
const localXdgOpenPath = path.join(__dirname, 'xdg-open');

// Convert a path from WSL format to Windows format:
// `/mnt/c/Program Files/Example/MyApp.exe` → `C:\Program Files\Example\MyApp.exe`
const wslToWindowsPath = (filePath) =>
  pExecFile('wslpath', ['-w', filePath]).then(({ stdout }) => stdout.trim());

module.exports = async (target, options) => {
  if (typeof target !== 'string') {
    throw new TypeError('Expected a `target`');
  }

  options = Object.assign(
    {
      wait: false,
      background: false,
    },
    options
  );

  let command;
  let appArguments = [];
  const cliArguments = [];
  const childProcessOptions = {};

  if (Array.isArray(options.app)) {
    appArguments = options.app.slice(1);
    options.app = options.app[0];
  }

  return Promise.resolve()
    .then(() => {
      if (process.platform === 'darwin') {
        command = 'open';

        if (options.wait) {
          cliArguments.push('--wait-apps');
        }

        if (options.background) {
          cliArguments.push('--background');
        }

        if (options.app) {
          cliArguments.push('-a', options.app);
        }
        return null;
      } else if (process.platform === 'win32' || isWsl) {
        command = `cmd${isWsl ? '.exe' : ''}`;
        cliArguments.push('/c', 'start', '""', '/b');
        target = target.replace(/&/g, '^&');

        if (options.wait) {
          cliArguments.push('/wait');
        }

        return Promise.resolve()
          .then(() => {
            if (options.app) {
              if (isWsl && options.app.startsWith('/mnt/')) {
                return wslToWindowsPath(options.app).then((windowsPath) => {
                  options.app = windowsPath;
                  cliArguments.push(options.app);
                });
              }

              cliArguments.push(options.app);
            }
            return null;
          })
          .then(() => {
            if (appArguments.length > 0) {
              Array.prototype.push.apply(cliArguments, appArguments);
            }
            return null;
          });
      }
      return Promise.resolve()
        .then(() => {
          if (options.app) {
            command = options.app;
          } else {
            // When bundled by Webpack, there's no actual package file path and no local `xdg-open`.
            const isBundled = !__dirname || __dirname === '/';

            // Check if local `xdg-open` exists and is executable.
            return pAccess(localXdgOpenPath, fs.constants.X_OK)
              .then(() => true)
              .catch(() => false)
              .then((exeLocalXdgOpen) => {
                const useSystemXdgOpen =
                  process.versions.electron ||
                  process.platform === 'android' ||
                  isBundled ||
                  !exeLocalXdgOpen;
                command = useSystemXdgOpen ? 'xdg-open' : localXdgOpenPath;
              });
          }
          return null;
        })
        .then(() => {
          if (appArguments.length > 0) {
            Array.prototype.push.apply(cliArguments, appArguments);
          }

          if (!options.wait) {
            // `xdg-open` will block the process unless stdio is ignored
            // and it's detached from the parent even if it's unref'd.
            childProcessOptions.stdio = 'ignore';
            childProcessOptions.detached = true;
          }
        });
    })
    .then(() => {
      cliArguments.push(target);

      if (process.platform === 'darwin' && appArguments.length > 0) {
        cliArguments.push('--args');
        Array.prototype.push.apply(cliArguments, appArguments);
      }

      const subprocess = childProcess.spawn(command, cliArguments, childProcessOptions);

      if (options.wait) {
        return new Promise((resolve, reject) => {
          subprocess.once('error', reject);

          subprocess.once('close', (exitCode) => {
            if (exitCode > 0) {
              reject(new Error(`Exited with code ${exitCode}`));
              return;
            }

            resolve(subprocess);
          });
        });
      }
      subprocess.once('error', (error) => {
        if (process.env.SLS_DEBUG) {
          process.stdout.write(
            `Serverless: ${chalk.red(`Opening of browser window errored with ${error.stack}`)}\n`
          );
        }
      });

      subprocess.unref();

      return subprocess;
    });
};
