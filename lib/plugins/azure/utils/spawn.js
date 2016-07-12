'use strict';

const BbPromise = require('bluebird');
const exec = require('child_process').exec;

function spawn(cmd, options) {
  return new BbPromise((resolve, reject) => {
    exec(cmd, options, (err, stdout, stderr) => {
      if (err || stderr) {
        reject(err || stderr);
      } else {
        resolve(stdout);
      }
    });
  });
}

module.exports = spawn;
