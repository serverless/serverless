'use strict';

//Testing how the top npm modules work with browserify
//https://www.npmjs.com/browse/depended

var AWS = require('aws-sdk'),
    ld = require('lodash'),
    async = require('async'),
    request = require('request'),
    us = require('underscore'),
    moment = require('moment'),
    uuid = require('node-uuid'),
    Promise = require('bluebird');

module.exports.run = function (event, context) {
    console.log('about to run');

    var s3 = Promise.promisifyAll(new AWS.S3());
    s3.listBucketsAsync()
        .then(function (data) {
            //console.log('s3 buckets', data);
            return ld.dropRight([1, 2, 3]);
        })
        .then(function (a) {
            console.log('ld drop', a);

            var urls = [
                {url: 'https://www.google.com'},
                {url: 'https://twitter.com/'},
            ];

            return new Promise(function (resolve, reject) {
                var q = async.queue(function (task, callback) {
                    request(task.url, function (error, response, body) {
                        callback(error);
                    });
                }, 2);

                q.drain = function () {
                    resolve(urls);
                };

                q.push(urls, function (e) {
                    if (e) {
                        throw new Error(e.message);
                    }
                });
            });
        }).then(function (urls) {
            return us.each(urls, function (url) {
                console.log('each', url);
            });
        })
        .then(function () {
            console.log('moment', moment().format());
            console.log('v1', uuid.v1());
            console.log('v4', uuid.v4());
            return 'done';
        })
        .then(function (d) {
            context.succeed(d);
        })
        .catch(function (e) {
            console.log(e);
            context.fail(e);
        });
};
