/**
 * JAWS Command Line Interface
 */


var aws         = require('aws-sdk');
var exec        = require('child_process').exec;
var fs          = require('fs');
var os          = require('os');
var packageJson = require('./../package.json');
var path        = require('path');
var async       = require('async');
var zip         = new require('node-zip')();
var wrench      = require('wrench');
var moment      = require('moment');
var yaml        = require('js-yaml');
var Q           = require('q');

var JAWS = function () {
    this.version   = packageJson.version;
    this.configYml = yaml.safeLoad(fs.readFileSync(__dirname + '/../jaws.yml', 'utf8')).jaws;
    return this;
};


/**
 * JAWS: Run Lambda Function Locally
 */

JAWS.prototype.run = function () {

    console.log('****** JAWS: Running Lambda Function Locally...');

    // Check if in extension's root directory
    if (!fs.existsSync(process.cwd() + '/index.js')) return console.log('****** JAWS:  Error - You must be in the root directory of your Lambda function to run it locally.');

    var extension = require(process.cwd() + '/index.js');
    var event     = require(process.cwd() + '/event.json');

    // Run Handler
    this._runHandler(extension.handler, event);
};


JAWS.prototype._runHandler = function (handler, event) {
    var context = {
        succeed: function (result) {
            console.log('****** JAWS: Lambda Finished Successfully: ');
            console.log(result);
            return process.exit(0);
        },
        fail: function (error) {
            console.log('****** JAWS: Lambda Returned An Error: ');
            console.log(error);
            return process.exit(0);
        },
        done: function (error, result) {

            if (error) {
                console.log('****** JAWS: Lambda Returned An Error: ');
                console.log(error);
            }

            if (result) {
                console.log('****** JAWS: Lambda Finished Successfully: ');
                console.log(result);
            }

            return process.exit(0);
        }
    };

    handler(event, context);
};


/**
 * JAWS: Deploy Lambda Function
 */

JAWS.prototype.deploy = function (stage) {
    var deferred = Q.defer();

    console.log('****** JAWS: Deploying your Lambda function to AWS Lambda.  This could take a few minutes...');

    // Require ENV Variables
    require('dotenv').config({
        path: process.cwd() + '/node_modules/app-lib/.adminenv'
    });

    // Defaults
    var _this    = this;
    var previous = '/';
    var regions  = this.configYml.deploy.regions;

    // Get Lambda Config
    if (!fs.existsSync(process.cwd() + '/lambda.json')) return console.log('****** JAWS Error: lambda.json is missing in this folder');
    var lambda_config          = require(process.cwd() + '/lambda.json');
    lambda_config.FunctionName = stage + "_" + lambda_config.FunctionName;

    var codeDirectory = os.tmpDir() + lambda_config.FunctionName + '-' + moment().unix();

    // Get path to "lib" folder
    var lib_path = false;
    for (var i = 0; i < 20; i++) {
        previous = previous + '../';
        if (fs.existsSync(process.cwd() + previous + 'lib/index.js')) {
            lib_path = previous + 'lib';
            break;
        }
    }
    if (!lib_path) {
        return Q.fcall(function () {
            throw new Error('***** JAWS Error: Can\'t find your lib folder.  Did you rename it or create folders over 20 levels deep in your api folder?')
        });
    }

    // Copy Lambda Folder To System Temp Directory
    wrench.copyDirSyncRecursive(process.cwd(), codeDirectory, {
        forceDelete: true,
        include: function (name, more) {
            if (name === '.git') return false;
            else return true;
        }
    });

    // If node_modules folder doesn't exist, create it
    if (!fs.existsSync(codeDirectory + '/node_modules')) fs.mkdirSync(codeDirectory + '/node_modules');

    // Copy app-lib
    wrench.copyDirSyncRecursive(process.cwd() + lib_path, codeDirectory + '/node_modules/app-lib');

    // Zip function
    _this._zip(lambda_config.FunctionName, codeDirectory, function (err, buffer) {

        console.log('****** JAWS: Zipping up your Lambda Function\'s files...');

        async.map(regions, function (region, cb) {

            aws.config.update({ //SDK auto-loads creds from process.env.AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY
                region: region
            });

            var lambda = new aws.Lambda({
                apiVersion: '2015-03-31'
            });

            // Define Params for New Lambda Function
            var params = {
                Code: {
                    ZipFile: buffer
                },
                FunctionName: lambda_config.FunctionName,
                Handler: lambda_config.Handler ? lambda_config.Handler : 'index.handler',
                Role: lambda_config.Role ? lambda_config.Role : _this.configYml.iamRoles[stage],
                Runtime: lambda_config.Runtime,
                Description: lambda_config.Description ? lambda_config.Description : 'A Lambda function that was created with the JAWS framework',
                MemorySize: lambda_config.MemorySize,
                Timeout: lambda_config.Timeout
            };

            // Check If Lambda Function Exists Already
            lambda.getFunction({
                FunctionName: lambda_config.FunctionName
            }, function (err, data) {

                if (err && err.code !== 'ResourceNotFoundException') {
                    return deferred.reject(err);
                }

                if (!data || !data.Code) {


                    /**
                     * Create New Lambda Function
                     */

                    console.log('****** JAWS: Uploading your Lambda function to ' + stage + ' with these parameters: ');
                    console.log(params);

                    lambda.createFunction(params, function (err, data) {
                        lambda_arn = data;
                        return cb(err, data);
                    });

                } else {


                    /**
                     * Delete Existing & Create New Lambda Function
                     */

                    console.log('****** JAWS: Deleting existing Lambda function...');

                    lambda.deleteFunction({
                        FunctionName: lambda_config.FunctionName
                    }, function (err, data) {

                        if (err) {
                            return deferred.reject(err);
                        }

                        console.log('****** JAWS: Re-uploading your Lambda Function to AWS Lambda with these parameters: ');
                        console.log(params);

                        lambda.createFunction(params, function (err, data) {
                            return cb(err, data);
                        });
                    });
                }
            });

        }, function (err, results) {

            if (err) {
                return deferred.reject(err);
            }

            var functionArns = [];
            for (var i in results) {
                functionArns.push(results[i].FunctionArn);
            }

            deferred.resolve(functionArns);
        });
    });

    return deferred.promise;
};


JAWS.prototype._zipfileTmpPath = function (functionName) {
    var ms_since_epoch = +new Date;
    var filename       = functionName + '-' + ms_since_epoch + '.zip';
    var zipfile        = path.join(os.tmpDir(), filename);

    return zipfile;
};


JAWS.prototype._zip = function (functionName, codeDirectory, callback) {
    var zipfile = this._zipfileTmpPath(functionName);

    var options = {
        type: 'nodebuffer',
        compression: 'DEFLATE'
    };

    var files = wrench.readdirSyncRecursive(codeDirectory);
    files.forEach(function (file) {
        var filePath = [codeDirectory, file].join('/');
        var isFile   = fs.lstatSync(filePath).isFile();
        if (isFile) {
            var content = fs.readFileSync(filePath);
            zip.file(file, content);
        }
    });

    var data = zip.generate(options);

    return callback(null, data);
};


/**
 * JAWS: Start "site" Server
 */

JAWS.prototype.server = function () {

    // Check if in server root folder
    if (!fs.existsSync(process.cwd() + '/server.js')) return console.log('****** JAWS:  Error - You must be in the "site" directory of your JAWS application to run this command and start the server.');

    var child = exec('node server', function (error, stdout, stderr) {
        if (error !== null) console.log('exec error: ' + error);
    });

    child.stdout.pipe(process.stdout);
    child.stderr.pipe(process.stderr);
};


// Export
module.exports = new JAWS();