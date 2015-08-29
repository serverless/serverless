'use strict';

var fs = require('fs'),
    os = require('os'),
    del = require('del'),
    wrench = require('wrench'),
    path = require('path');

/**
 * Create Test Project
 */
module.exports.createTestProject = function(projectName) {
  // Create Test Project
  var projectPath = path.join(os.tmpdir(), './', projectName);
  if (fs.existsSync(projectPath)) {
    del.sync([projectPath], { force: true });
  }

  fs.mkdirSync(projectPath);
  wrench.copyDirSyncRecursive(path.join(__dirname, './test-prj'), projectPath, {
    forceDelete: true,
  });
  console.log(projectPath);
  return projectPath;
};

/**
 * Delete Test Project
 */
module.exports.deleteTestProject = function(path) {
  del.sync([path], {force: true});
};