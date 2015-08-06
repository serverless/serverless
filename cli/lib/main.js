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

JAWS.prototype.run = function (functionRootDirPath, callback) {
    // Check if in extension's root directory
    if (!fs.existsSync(functionRootDirPath + '/index.js')) {
        callback(new Error('****** JAWS:  Error - You must be in the root directory of your Lambda function to run it locally.'));
    }

    var extension = require(functionRootDirPath + '/index.js');
    var event     = require(functionRootDirPath + '/event.json');
    var metadata  = require(functionRootDirPath + '/lambda.json');

    console.log('****** JAWS: Running ' + metadata.FunctionName + ' Locally...');

    // Run Handler
    this._runHandler(extension.handler, event, callback);
};


JAWS.prototype._runHandler = function (handler, event, callback) {
    var context = {
        succeed: function (result) {
            callback(null, result);
        },
        fail: function (error) {
            callback(error);
        },
        done: function (error, result) {
            callback(error, result);
        }
    };

    handler(event, context);
};


/**
 * JAWS: Deploy Lambda Function
 */

JAWS.prototype.deploy = function (stage) {
    var deferred = Q.defer();

    // Require ENV Variables
    require('dotenv').config({
        path: __dirname + '/../.adminenv'
    });

    // Defaults
    var _this    = this;
    var previous = '/';
    var regions  = this.configYml.deploy.regions;

    // Get Lambda Config
    if (!fs.existsSync(process.cwd() + '/lambda.json')) {
        return Q.fcall(function () {
            throw new Error('****** JAWS Error: lambda.json is missing in this folder');
        });
    }
    var lambda_config          = require(process.cwd() + '/lambda.json');
    lambda_config.FunctionName = stage + "_" + lambda_config.FunctionName;

    console.log('****** JAWS: Deploying ' + lambda_config.FunctionName);

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

    // Copy jaws-lib
    wrench.copyDirSyncRecursive(process.cwd() + lib_path, codeDirectory + '/node_modules/jaws-lib');

    // Copy down ENV file
    var s3            = new aws.S3({apiVersion: '2006-03-01'}),
        targetEnvFile = fs.createWriteStream(codeDirectory + '/node_modules/jaws-lib/.env'),
        s3EnvPath     = _this.configYml.deploy.envS3Location,
        firstSlash    = s3EnvPath.indexOf('/'),
        bucket        = s3EnvPath.substring(0, firstSlash),
        key           = s3EnvPath.substring(firstSlash + 1) + stage;

    console.log("\tDownolading ENV file s3://" + bucket + key);
    s3.getObject({Bucket: bucket, Key: key})
        .on("error", function (err) {
            console.error("\tError getting ENV file s3://" + bucket + key);
            deferred.reject(err);
        })
        .createReadStream().pipe(targetEnvFile);

    targetEnvFile
        .on('finish', function () {
            _this._zip(lambda_config.FunctionName, codeDirectory, function (err, buffer) {

                console.log("\tZipping files (" + codeDirectory + ")...");

                async.map(regions, function (region, cb) {

                    aws.config.update({ //SDK auto-loads creds from process.env.AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY
                        region: region
                    });

                    var lambda = new aws.Lambda({
                        apiVersion: '2015-03-31'
                    });

                    // Define Params for New Lambda Function
                    var params = {
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

                            console.log("\tUploading to " + stage + " with params:");
                            console.log(params);

                            params.Code = {ZipFile: buffer};
                            lambda.createFunction(params, function (err, data) {
                                lambda_arn = data;
                                return cb(err, data);
                            });

                        } else {


                            /**
                             * Delete Existing & Create New Lambda Function
                             */

                            console.log("\tDeleting existing Lambda function...");

                            lambda.deleteFunction({
                                FunctionName: lambda_config.FunctionName
                            }, function (err, data) {

                                if (err) {
                                    return deferred.reject(err);
                                }

                                console.log("\tRe-uploading your Lambda Function with params:");
                                console.log(params);

                                params.Code = {ZipFile: buffer};
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