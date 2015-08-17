'use strict';

/**
 * JAWS Command: install
 * - Fetches an jaws-module from another github repo and installs it locally
 */

// Defaults
var Promise     = require('bluebird'),
fs              = Promise.promisifyAll(require('fs')),
del             = require('del'),
wrench          = require('wrench'),
shortid         = require('shortid'),
ghDownload      = require('download-github-repo');

module.exports  = function(JAWS) {

  JAWS.install  = function(dir)  {

    // Inform
    console.log('****** JAWS: Downloading and installing module...');

    // Make a temporary directory for the module
    var tempPath = JAWS._meta.projectRootPath + '/temp-' + shortid.generate();

    // Download and build module from github
    ghDownload(dir, tempPath, function(error) {
      if (error) console.log(error);

      // Fetch module's jaws.json
      try {
        var jawsJson = require(tempPath + '/jaws.json');
      } catch(e) {
        // Remove module if malformed, report
        del([tempPath], function (error) {
          if (error) return console.log(error);
          return console.log(e);
        });
      }

      // Handle according to module profile
      if (['lambda', 'lambda-group'].indexOf(jawsJson.profile) >  -1) {


        // If folder exists, create unique module folder name
        if (fs.existsSync( JAWS._meta.projectRootPath + '/back/' + jawsJson.name)) {
          for (var i = 2;i < 500;i++) {
            if (!fs.existsSync( JAWS._meta.projectRootPath + '/back/' + jawsJson.name + '-' + i)) {
              jawsJson.name = jawsJson.name + '-' + i;
              break;
            }
          }
        }

        // Copy folders into new module folder
        wrench.copyDirSyncRecursive(tempPath, JAWS._meta.projectRootPath + '/back/' + jawsJson.name, {
          forceDelete: false, // Whether to overwrite existing directory or not
          excludeHiddenUnix: false // Whether to copy hidden Unix files or not (preceding .)
          // filter: regexpOrFunction // A filter to match files against; if matches, do nothing (exclude).
        });

      } else if (jawsJson.profile === 'front') {

      } else if (jawsJson.profile === 'project') {

      } else {
        return console.log('****** JAWS Error: This module has an unknown profile');
      }

      // Delete temp directory
      del([tempPath], function (error) {
        if (error) return console.log(error);
        console.log('****** JAWS: Module successfully installed');
      });
    });
  };
};
