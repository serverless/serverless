// Dependencies
var gulp = require('gulp'),
    async = require('async'),
    _ = require('lodash'),
    fs = require('fs'),
    AWS = require('aws-sdk'),
    clean = require('gulp-clean'),
    gconcat = require('gulp-concat'),
    uglify = require('gulp-uglify'),
    rename = require('gulp-rename'),
    shell = require('gulp-shell'),
    git = require('gulp-git'),
    bump = require('gulp-bump'),
    zip = require('gulp-zip'),
    filter = require('gulp-filter'),
    tag_version = require('gulp-tag-version'),
    server = require('gulp-develop-server'),
    dotenv = require('dotenv');

/**
 * Config AWS
 */

dotenv.load();
AWS.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION
});


/**
 * Gulp Callback Function
 */

function publish_callback(obj) {
    var stream = new require('stream').Transform({
        objectMode: true
    });
    stream._transform = function(file, unused, callback) {
        obj();
        callback(null, file);
    };
    return stream;
};

var serverJSlocations = ['./server.js'];
// Client-Side Javascript – Don't forget to add dependencies in here for minification.  Order of loading is also important.
var clientJSlocations = [
    './public/libs/jquery/dist/jquery.min.js',
    './public/libs/servant-sdk-javascript/src/servant_sdk_javascript.js',
    './public/js/*.js'
];


/**
 * Server ----------------------------------------
 */

gulp.task('server:start', function() {
    server.listen({
        path: './server.js'
    });
    // Watch server-side code.  If changes happen, restart node server
    gulp.watch(serverJSlocations, ['server:restart']);
});

gulp.task('server:restart', [], server.restart);


/**
 * Build ----------------------------------------
 */

gulp.task('build', function() {
    return gulp.src(clientJSlocations)
        .pipe(gconcat('application.js'))
        .pipe(gulp.dest('./public/dist'))
        .pipe(uglify())
        .pipe(rename('application.min.js'))
        .pipe(gulp.dest('./public/dist'));
});


/**
 * Lambda: Publish Lambda Functions To AWS Lambda
 * 
 * - Zips up all Lambda Functions in lambdas directory
 * - Clears existing Lambda functions on AWS
 * - Uploads new Lambda functions
 */

gulp.task('lambda', function() {

    var Lambda = new AWS.Lambda({
        apiVersion: '2015-03-31'
    });

    async.eachSeries(fs.readdirSync('./lambdas'), function(directory, directoryCallback) {

        // Skip system files
        if (directory.substring(0, 1) === '.') return directoryCallback();

        // Create Lambda Settings
        var settings = {
            Role: process.env.AWS_ROLE_ARN
        };
        _.assign(settings, require('./lambdas/' + directory + '/lambda.json'));

        // Delete Existing Lambda Function, if any
        Lambda.deleteFunction({
            FunctionName: settings.FunctionName
        }, function(err, data) {
            if (err && err.code !== 'ResourceNotFoundException') return console.log(err, err.stack);

            // Zip new Lambda Function
            var zip = new require('node-zip')();
            zip.file('./lambdas/' + directory + '/lambda.js', './lambdas/' + directory + '/node_modules');
            var zipped_lambda = zip.generate({
                type: 'nodebuffer',
                compression: 'DEFLATE'
            });
            settings.Code = {
                ZipFile: zipped_lambda
            };

            // Upload New Lambda Function
            Lambda.createFunction(settings, function(error, data) {
                if (error) return console.log('****** ERROR: Could not upload Lambda function: ' + settings.FunctionName, error);
                console.log('****** Successfully Upload Lambda Function: ' + settings.FunctionName);
                console.log('****** Lambda Upload Results: ', data);
                return directoryCallback();
            });

        });
    }, function(error) {
        console.log("Done!");
    });
});




/**
 * Publish --------------------------------------
 */

function publish(importance) {
    // get all the files to bump version in
    gulp.src(['./package.json'])
        // bump the version number in those files
        .pipe(bump({
            type: importance
        }))
        // save it back to filesystem
        .pipe(gulp.dest('./'))
        // commit the changed version number
        .pipe(git.commit('bumps package version'))
        // read only one file to get the version number
        .pipe(filter('package.json'))
        // **tag it in the repository**
        .pipe(tag_version());
}

gulp.task('patch', ['build'], function() {
    return publish('patch');
})
gulp.task('feature', ['build'], function() {
    return publish('minor');
})
gulp.task('release', ['build'], function() {
    return publish('major');
})

/**
 * Default ----------------------------------------
 */

gulp.task('default', ['server:start']);




// End