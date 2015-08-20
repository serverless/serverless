'use strict';

/**
 * JAWS Command: install
 * - Fetches an jaws-module from another github repo and installs it locally
 */

// Defaults
var Promise = require('bluebird'),
    fs = Promise.promisifyAll(require('fs')),
    del = require('del'),
    wrench = require('wrench'),
    shortid = require('shortid'),
    Download = require('Download');

module.exports = function(JAWS) {

  JAWS.install = function(url) {

    // Check if not in current directory
    if (!JAWS._meta.projectRootPath) return console.log('JAWS Error: Couldn\'t find your JAWS project.  Are you sure ' +
        'you\'re in the right folder?');

    // Inform
    console.log('JAWS: Downloading and installing module...');

    // Prepare URL
    var repo = {};
    url = url.replace('https://', '').replace('http://', '').replace('www.', '').split('/');
    repo.owner = url[1];
    repo.repo = url[2];
    repo.branch = 'master';

    if (~repo.repo.indexOf('#')) {
      url[2].split('#');
      repo.repo = url[2].split('#')[0];
      repo.branch = url[2].split('#')[1];
    }

    // Throw error if invalid url
    if (url[0] !== 'github.com' || !repo.owner || !repo.repo) return console.log('JAWS Error: Must be a github url ' +
        'in this format: https://github.com/jaws-stack/JAWS');

    // Prepare Download url
    var downloadUrl = 'https://github.com/' + repo.owner + '/' + repo.repo + '/archive/' + repo.branch + '.zip';

    // Make a temporary directory for the module
    var tempDir = 'temp-' + shortid.generate();
    var tempDirPath = JAWS._meta.projectRootPath + '/' + tempDir;

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
            console.log('JAWS Error: Module Download and installation failed.');
            return console.log(error);
          }

          // Fetch module's jaws.json
          try {
            var jawsJson = require(tempDirPath + '/jaws.json');
          } catch (e) {

            // Remove module and report if malformed
            return del([tempDirPath], {
              force: true,
            }, function(error) {
              if (error) console.log(error);
              return console.log(e);
            });

          }

          // Handle according to module profile
          if (['lambda', 'lambdaGroup'].indexOf(jawsJson.profile) > -1) {

            // If folder exists, create unique module folder name
            if (fs.existsSync(JAWS._meta.projectRootPath + '/back/' + jawsJson.name)) {
              for (var i = 2; i < 500; i++) {
                if (!fs.existsSync(JAWS._meta.projectRootPath + '/back/' + jawsJson.name + '-' + i)) {
                  jawsJson.name = jawsJson.name + '-' + i;
                  break;
                }
              }
            }

            // Copy folders into new module folder
            wrench.copyDirSyncRecursive(tempDirPath, JAWS._meta.projectRootPath + '/back/' + jawsJson.name, {
              forceDelete: false, // Whether to overwrite existing directory or not
              excludeHiddenUnix: false // Whether to copy hidden Unix files or not (preceding .)
              // filter: regexpOrFunction // A filter to match files against; if matches, do nothing (exclude).
            });

          } else if (jawsJson.profile === 'front') {
            //TODO:implement
          } else if (jawsJson.profile === 'project') {
            //TODO: implement
          } else {
            return console.log('JAWS Error: This module has an unknown profile');
          }

          // Delete temp directory
          del([tempDirPath], {
            force: true,
          }, function(error) {

            if (error) return console.log(error);

            // Conclude
            return console.log('JAWS: Module successfully installed');

          });
        });
  };
};
