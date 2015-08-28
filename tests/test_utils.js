'use strict';

var fs = require('fs'),
    os = require('os'),
    del = require('del'),
    wrench = require('wrench'),
    path = require('path');

/**
 * Create Test Project
 */
module.exports.createTestProject = function() {

  // Create Test Project
  var projectPath = path.join(os.tmpdir(), 'jaws-test-project');
  if (fs.existsSync(projectPath)) {
    del.sync([projectPath], { force: true });
  }

  fs.mkdirSync(projectPath);
  wrench.copyDirSyncRecursive('./jaws-test-project', projectPath, {
    forceDelete: true,
  });

  // Reset CWD to test project - Must be done before requiring in tests
  process.chdir(projectPath);
  return projectPath;
};

/**
 * Delete Test Project
 */
module.exports.deleteTestProject = function(path) {
  del.sync([path], {force: true});
};