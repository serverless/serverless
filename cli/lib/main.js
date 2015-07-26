'use strict';


/**
 * JAWS Command Line Interface
 */


var aws = require('aws-sdk');
var exec = require('child_process').exec;
var fs = require('fs');
var os = require('os');
var sys = require('sys');
var packageJson = require('./../package.json');
var path = require('path');
var async = require('async');
var zip = new require('node-zip')();
var wrench = require('wrench');
var jsonfile = require('jsonfile');
var del = require('del');



var JAWS = function() {
    this.version = packageJson.version;
    return this;
};


/**
 * JAWS: Run Lambda Function Locally
 */

JAWS.prototype.run = function(program) {


    // Check if in extension's root directory
    if (!fs.existsSync(process.cwd() + '/index.js')) return console.log('****** JAWS:  Error - You must be in the root directory of your Lambda function to run it locally.');

    var extension = require(process.cwd() + '/index.js');
    var event = require(process.cwd() + '/event.json');

    // Run Handler
    this._runHandler(extension.handler, event);
};


JAWS.prototype._runHandler = function(handler, event) {
    var context = {
        succeed: function(result) {
            console.log('****** JAWS: Lambda Finished Successfully: ');
            console.log(result);
            return process.exit(0);
        },
        fail: function(error) {
            console.log('****** JAWS: Lambda Returned An Error: ');
            console.log(error);
            return process.exit(0);
        },
        done: function(error, result) {

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



JAWS.prototype.deploy = function(program) {

    console.log('****** JAWS: Deploying your Lambda function to AWS Lambda.  This could take a few minutes...');

    // Defaults
    var _this = this;
    var regions = program.region.split(',');
    var codeDirectory = _this._codeDirectory(program);
    var fs = require('fs');
    var dir = './stmp';

    // Create Temp Folder
    if (fs.existsSync(dir)) del.sync(['./stmp']);
    fs.mkdirSync(dir);

    // Move all files to tmp folder (except .git, .log, event.json and node_modules)
    _this._rsync(program, codeDirectory, function(err, result) {
        _this._zip(program, codeDirectory, function(err, buffer) {

            console.log('****** JAWS: Zipping up your Lambda Function\'s files...');

            //var buffer = fs.readFileSync(zipfile);
            var params = _this._params(program, buffer);

            async.map(regions, function(region, cb) {

                console.log('****** JAWS: Uploading your Lambda Function to AWS Lambda with these parameters: ');
                console.log(params);

                aws.config.update({
                    accessKeyId: program.accessKey,
                    secretAccessKey: program.secretKey,
                    region: region
                });

                var lambda = new aws.Lambda({
                    apiVersion: '2014-11-11'
                });

                lambda.uploadFunction(params, function(err, data) {
                    cb(err, data);
                });

            }, function(err, results) {

                if (err) return console.log(err);

                // Remove Temp Directory
                del(['./stmp'], function(err, paths) {
                    if (err) return console.log(err);
                    return console.log('****** JAWS:  Success! - Your Lambda Function has been successfully deployed to AWS Lambda.  AWS Lambda ARN: ' + results[0].FunctionARN);
                });
            });
        });
    });
};

JAWS.prototype._params = function(program, buffer) {

    var params = {
        FunctionName: program.functionName,
        FunctionZip: buffer,
        Handler: program.handler,
        Mode: program.mode,
        Role: program.role,
        Runtime: program.runtime,
        Description: program.description,
        MemorySize: program.memorySize,
        Timeout: program.timeout
    };

    return params;
};


JAWS.prototype._zipfileTmpPath = function(program) {
    var ms_since_epoch = +new Date;
    var filename = program.functionName + '-' + ms_since_epoch + '.zip';
    var zipfile = path.join(os.tmpDir(), filename);

    return zipfile;
};


JAWS.prototype._rsync = function(program, codeDirectory, callback) {

    exec('rsync -r --exclude=.git --exclude=*.log . ' + codeDirectory, function(err, stdout, stderr) {
        if (err) {
            throw err;
        }

        return callback(null, true);
    });

};


JAWS.prototype._zip = function(program, codeDirectory, callback) {
    var zipfile = this._zipfileTmpPath(program);

    var options = {
        type: 'nodebuffer',
        compression: 'DEFLATE'
    }

    var files = wrench.readdirSyncRecursive(codeDirectory);
    files.forEach(function(file) {
        var filePath = [codeDirectory, file].join('/');
        var isFile = fs.lstatSync(filePath).isFile();
        if (isFile) {
            var content = fs.readFileSync(filePath);
            zip.file(file, content);
        }
    });

    var data = zip.generate(options);

    return callback(null, data);
};


JAWS.prototype._codeDirectory = function(program) {
    var epoch_time = +new Date;
    return os.tmpDir() + '/' + program.functionName + '-' + epoch_time;
};




/**
 * JAWS: Start Application Server
 */

JAWS.prototype.server = function(program) {

    // Check if in server root folder
    if (!fs.existsSync(process.cwd() + '/server.js')) return console.log('****** JAWS:  Error - You must be in the "server" directory of your JAWS application to start it.');

    var child = exec('nodemon server', function(err, stdout, stderr) {
        if (error !== null) console.log('exec error: ' + error);
    });

    child.stdout.pipe(process.stdout);
    child.stderr.pipe(process.stderr);
};




// Export
module.exports = new JAWS();