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
    // Require Admin ENV Variables
    require('dotenv').config({
        path: __dirname + '/../.adminenv'
    });

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
            console.error(error);
            callback(new Error(error.message));
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

    // Defaults
    var _this   = this;
    var regions = this.configYml.deploy.regions;

    // Get Lambda Config
    if (!fs.existsSync(process.cwd() + '/lambda.json')) {
        return Q.fcall(function () {
            throw new Error('****** JAWS Error: lambda.json is missing in this folder');
        });
    }
    var lambda_config          = require(process.cwd() + '/lambda.json');
    lambda_config.FunctionName = stage + "_" + lambda_config.FunctionName;

    console.log('****** JAWS: Deploying ' + lambda_config.FunctionName);

    var tmpCodeDir               = os.tmpdir() + lambda_config.FunctionName + '-' + moment().unix(),
        libPath                  = __dirname + '/../../lib',
        packageApiExcludesGlobal = _this.configYml.deploy.packageApiExcludes || [],
        packageApiExcludesLambda = lambda_config.packageApiExcludes || [],
        packageLibExcludesGlobal = _this.configYml.deploy.packageLibExcludes || [],
        packageLibExcludesLambda = lambda_config.packageLibExcludes || [],
        packageApiExcludes       = packageApiExcludesGlobal.concat(packageApiExcludesLambda),
        packageLibExclues        = packageLibExcludesGlobal.concat(packageLibExcludesLambda),
        functionDir              = process.cwd();

    console.log("\tCopying files to tmp dir " + tmpCodeDir);

    // Copy code from api/model/action dir to temp location
    wrench.copyDirSyncRecursive(functionDir, tmpCodeDir, {
        forceDelete: true,
        exclude: function (name, prefix) {
            var relPath = prefix.replace(functionDir, '');
            return _this._copyExclude(name, relPath, packageApiExcludes);
        }
    });

    // Copy lib dir
    wrench.copyDirSyncRecursive(libPath, tmpCodeDir + '/lib', {
        forceDelete: true,
        exclude: function (name, prefix) {
            var relPath = prefix.replace(libPath, '');
            return _this._copyExclude(name, relPath, packageLibExclues);
        }
    });

    // Copy down ENV file
    var s3            = new aws.S3({
            apiVersion: '2006-03-01',
            accessKeyId: global.process.env.ADMIN_AWS_ACCESS_KEY_ID,
            secretAccessKey: global.process.env.ADMIN_AWS_SECRET_ACCESS_KEY
        }),
        targetEnvFile = fs.createWriteStream(tmpCodeDir + '/lib/.env'),
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
            console.log("\tZipping files...");

            _this._zip(lambda_config.FunctionName, tmpCodeDir, function (err, buffer) {
                if (err) {
                    return deferred.reject(err);
                }

                return process.exit(-1);

                async.map(regions, function (region, cb) {
                    var lambda = new aws.Lambda({
                        apiVersion: '2015-03-31',
                        region: region,
                        accessKeyId: global.process.env.ADMIN_AWS_ACCESS_KEY_ID,
                        secretAccessKey: global.process.env.ADMIN_AWS_SECRET_ACCESS_KEY
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

JAWS.prototype._zip = function (functionName, codeDirectory, callback) {
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

    if (data.length > 52428800) {
        return callback(new Error("Zip file is > the 50MB Lambda deploy limit (" + data.length + " bytes)"), null);
    }

    return callback(null, data);
};

JAWS.prototype._copyExclude = function (fileName, relPath, tests) {
    if (!tests.length) {
        return false;
    }

    return tests.some(function (sRegex) {
        var re       = new RegExp(sRegex),
            testFile = relPath + "/" + fileName,
            testFile = ('/' == testFile.charAt(0)) ? testFile.substr(1) : testFile,
            matches  = re.exec(testFile);

        return (matches && matches.length > 0);
    });
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