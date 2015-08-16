'use strict';

/**
 * JAWS Command: new
 * - Asks the user for information about their new JAWS project
 * - Creates a new project in the current working directory
 */


// Defaults
var Promise     = require('bluebird'),
fs              = Promise.promisifyAll(require('fs')),
os              = require('os'),
inquirer        = require('inquirer'),
chalk           = require('chalk'),
jsonfile        = Promise.promisifyAll(require('jsonfile')),
shortid         = require('shortid');


module.exports = function(JAWS) {

  JAWS.new = function()  {

    var project     = {};

    // Define User Prompts
    var userPrompts = new Promise(function(resolve, reject){

      // Define Prompts
      var prompts = [
        // Request Project Name
        {
          type: 'input',
          name: 'name',
          message: '****** WELCOME TO JAWS: Type a name for your new project (max 20 chars):',
          default: 'jaws-new-' + shortid.generate()
        },
        // Request AWS Admin API Key
        {
          type: 'input',
          name: 'awsAdminKeyId',
          message: '****** JAWS: Please enter the ACCESS KEY ID for your AWS IAM User:'
        },
        // Request AWS Admin API Secret Key
        {
          type: 'input',
          name: 'awsAdminSecretKey',
          message: '****** JAWS: Please enter the SECRET ACCESS KEY for your AWS IAM User:'
        }
      ];

      inquirer.prompt(prompts, function( answers ) {

          // Set and sanitize project info
          project.name = answers.name.toLowerCase().trim().replace(/[^a-zA-Z-\d\s:]/g, '').replace(/\s/g, '-').substring(0,19);
          project.awsAdminKeyId = answers.awsAdminKeyId.trim();
          project.awsAdminSecretKey = answers.awsAdminSecretKey.trim();

          return resolve();
      });
    });

    // Process
    userPrompts.then(function(){

      // Set project root path.  Append unique id if directory already exists.
      if (fs.existsSync(JAWS._meta.cwd + '/' + project.name)) {
        project.name = project.name + '-' + shortid.generate();
        JAWS._meta.projectRootPath = './' + project.name;
      } else {
        JAWS._meta.projectRootPath = project.name.replace(/\s/g, '-');
      }

      // Create project root directory
      return fs.mkdirAsync(JAWS._meta.projectRootPath);

    }).then(function(){

      // Create project/back
      return fs.mkdirAsync(JAWS._meta.projectRootPath + '/back');

    }).then(function(){

      // Create project/front
      return fs.mkdirAsync(JAWS._meta.projectRootPath + '/front');

    }).then(function(){

      // Create project/front
      return fs.mkdirAsync(JAWS._meta.projectRootPath + '/tests');

    }).then(function(){

      // Create awsm.json
      var awsmJson = {
        name:             project.name,
        version:          JAWS._meta.version,
        type:             'aws_v1',
        profile:          'project',
        location:         '<enter your github repository here>',
        cfTemplate:       {}
      };

      jsonfile.spaces = 2;
      return jsonfile.writeFile(JAWS._meta.projectRootPath + '/awsm.json', awsmJson);

    }).then(function(){

      // Create admin.env
      var adminEnv = 'ADMIN_AWS_ACCESS_KEY_ID=' + project.awsAdminKeyId + os.EOL + 'ADMIN_AWS_SECRET_ACCESS_KEY=' + project.awsAdminSecretKey;
      return fs.writeFile(JAWS._meta.projectRootPath + '/admin.env', adminEnv);

    }).catch(function(e) {

      console.error(e);

    }).finally(function() {

      // End
      console.log('******** JAWS: Your project ' + project.name + ' has been successfully created in the current directory.');

    });
  };
};
