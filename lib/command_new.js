'use strict';

/**
 * JAWS Command: new
 * - Asks the user for information about their new JAWS project
 * - Creates a new project in the current working directory
 */


// Defaults
var Promise     = require('bluebird'),
fs              = Promise.promisifyAll(require('fs')),
inquirer        = require('inquirer'),
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
          project.name = answers.name.toLowerCase().trim().replace(/\s/g, '-').substring(0,19);
          project.awsAdminKeyId = answers.awsAdminKeyId.trim();
          project.awsAdminSecretKey = answers.awsAdminSecretKey.trim();

          return resolve();
      });

    });

    userPrompts.then(function(){

      // Set project root path.  Append unique id if directory already exists.
      if (fs.existsSync(JAWS._meta.cwd + '/' + project.name.replace(/\s/g, '-'))) {
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

    }).catch(function(e) {

      console.error(e);

    }).finally(function() {

      // End
      console.log('****** JAWS: Your project ' + project.name + ' has been successfully created in the current directory.');

    });
  };
};
