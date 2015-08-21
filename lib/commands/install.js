'use strict';

/**
 * JAWS Command: install
 * - Fetches an jaws-module from another github repo and installs it locally
 */

var JawsError = require('../jaws-error'),
    Promise = require('bluebird'),
    path = require('path'),
    fs = require('fs'),
    del = require('del'),
    wrench = require('wrench'),
    shortid = require('shortid'),
    Download = require('Download');

Promise.promisifyAll([
  fs,
]);

module.exports = function(JAWS) {

  JAWS.install = function(url) {
    return new Promise(function(resolve, reject) {
      if (!JAWS._meta.projectRootPath) {
        reject(new JawsError(
            'Could\'nt find your JAWS Project.  Are you sure you are in the right directory?',
            JawsError.errorCodes.UNKNOWN
        ));
      }

      // Inform
      console.log('Downloading and installing module...');

      // Prepare URL
      var repo = {};
      url = url.replace('https://', '').replace('http://', '').replace('www.', '').split('/');  //TODO: why not regex?
      repo.owner = url[1];
      repo.repo = url[2];
      repo.branch = 'master';

      if (~repo.repo.indexOf('#')) {
        url[2].split('#');
        repo.repo = url[2].split('#')[0];
        repo.branch = url[2].split('#')[1];
      }

      // Throw error if invalid url
      if (url[0] !== 'github.com' || !repo.owner || !repo.repo) {
        reject(new JawsError(
            'Must be a github url in this format: https://github.com/jaws-stack/JAWS',
            JawsError.errorCodes.UNKNOWN
        ));
      }

      // Prepare Download url
      var downloadUrl = 'https://github.com/' + repo.owner + '/' + repo.repo + '/archive/' + repo.branch + '.zip';

      // Make a temporary directory for the module
      var tempDir = 'temp-' + shortid.generate();
      var tempDirPath = path.join(JAWS._meta.projectRootPath, tempDir);

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

            var backPath = path.join(JAWS._meta.projectRootPath, 'back', jawsJson.name);

            // Handle according to module profile
            if (['lambda', 'lambdaGroup'].indexOf(jawsJson.profile) > -1) {

              // If folder exists, create unique module folder name
              if (fs.existsSync(backPath)) {
                for (var i = 2; i < 500; i++) {
                  if (!fs.existsSync(backPath + '-' + i)) {
                    jawsJson.name = jawsJson.name + '-' + i;
                    break;
                  }
                }
              }

              // Copy folders into new module folder
              wrench.copyDirSyncRecursive(tempDirPath, backPath, {
                forceDelete: false, // Whether to overwrite existing directory or not
                excludeHiddenUnix: false, // Whether to copy hidden Unix files or not (preceding .)
                // filter: regexpOrFunction // A filter to match files against; if matches, do nothing (exclude).
              });

            } else if (jawsJson.profile === 'front') {
              //TODO:implement
            } else if (jawsJson.profile === 'project') {
              //TODO: implement
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
              resolve();
            });
          });
    });
  };
};
