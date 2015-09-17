'use strict';

/**
 * JAWS Command: install
 * - Fetches an jaws-module from another github repo and installs it locally
 */

var JawsError = require('../jaws-error'),
    Promise = require('bluebird'),
    JawsCLI = require('../utils/cli'),
    path = require('path'),
    fs = require('fs'),
    del = require('del'),
    wrench = require('wrench'),
    shortid = require('shortid'),
    URL = require('url'),
    Download = require('Download');

Promise.promisifyAll(fs);

/**
 * Run
 */

module.exports.run = function(JAWS, url, saveCf) {
  var command = new CMD(JAWS, url, saveCf);
  return command.run();
};

/**
 * CMD Classlam
 */

function CMD(JAWS, url, saveCf) {
  this._JAWS = JAWS;
  this._url = url;
  this._saveCf = saveCf;
}

CMD.prototype.constructor = CMD;

CMD.prototype.run = Promise.method(function() {

  var _this = this;

  return _this._JAWS.validateProject()
      .bind(_this)
      .then(_this._installFiles)
      .then(function(module) {
        if (_this._saveCf) {
          return _this._saveCfTemplate().then(function() {
            return module;
          });
        }
      })
      .then(function(module) {
        JawsCLI.log('Successfully installed ' + module.name);
      });
});

/**
 * Install Files
 */

CMD.prototype._installFiles = Promise.method(function() {
  var _this = this,
      spinner = JawsCLI.spinner('Downloading aws-module ...');

  spinner.start();
  spinner.stop(true);

  var url = URL.parse(_this._url),
      parts = url.pathname.split('/'),
      repo = {
        owner: parts[1],
        repo: parts[2],
        branch: 'master'
      };

  console.log(repo);
  process.exit();

  if (~repo.repo.indexOf('#')) {
    url[2].split('#');
    repo.repo = url[2].split('#')[0];
    repo.branch = url[2].split('#')[1];
  }

  // Throw error if invalid url
  if (url.hostname !== 'github.com' || !repo.owner || !repo.repo) {
    reject(new JawsError(
        'Must be a github url in this format: https://github.com/jaws-stack/JAWS',
        JawsError.errorCodes.UNKNOWN
    ));
  }

  // Prepare Download url
  var downloadUrl = 'https://github.com/' + repo.owner + '/' + repo.repo + '/archive/' + repo.branch + '.zip';

  // Make a temporary directory for the module
  var tempDir = 'temp-' + shortid.generate();
  var tempDirPath = path.join(rootPath, tempDir);

  // Download module
  new Download({
    timeout: 30000,
    extract: true,
    strip: 1,
    mode: '755',
  })
      .get(downloadUrl)
      .dest(tempDirPath)
      .run(function(error) {

        if (error) {
          console.error('Module Download and installation failed.');
          reject(error);
        }

        // Fetch module's jaws.json
        try {
          var jawsJson = require(tempDirPath + '/jaws.json');
        } catch (e) {

          // Remove module and report if malformed
          return del([tempDirPath], {
            force: true,
          }, function(error) {
            if (error) {
              console.error(error);
            }

            reject(e);
          });

        }

        var modulePath = path.join(rootPath, 'back', jawsJson.name);

        // Handle according to module profile
        if (['lambda', 'lambdaGroup'].indexOf(jawsJson.profile) > -1) {

          // If folder exists, create unique module folder name
          if (utils.dirExistsSync(modulePath)) {
            for (var i = 2; i < 500; i++) {
              if (!utils.dirExistsSync(modulePath + '-' + i)) {
                jawsJson.name = jawsJson.name + '-' + i;
                modulePath = path.join(rootPath, 'back', jawsJson.name);
                break;
              }
            }
          }

          // Copy folders into new module folder
          wrench.copyDirSyncRecursive(tempDirPath, modulePath, {
            forceDelete: false,
            excludeHiddenUnix: false,
          });

        } else if (jawsJson.profile === 'front') {
          //TODO: implement
        } else if (jawsJson.profile === 'project') {
          //TODO: implement after v1
        } else {
          reject(new JawsError('This module has an unknown profile', JawsError.errorCodes.UNKNOWN));
        }

        // Delete temp directory
        del([tempDirPath], {
          force: true,
        }, function(error) {

          if (error) {
            reject(error);
          }

          console.log('Module successfully installed');
          resolve(modulePath);
        });
      });
});

/**
 * Save CloudFormation Snippet
 */
CMD.prototype._saveCfTemplate = Promise.method(function() {
  //TODO: implement
});