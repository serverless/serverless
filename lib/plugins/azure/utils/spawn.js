'use strict';

const BbPromise = require('bluebird');
const exec = require('child_process').exec;

function spawn(cmd, options) {
  return new BbPromise((resolve, reject) => {
    exec(cmd, options, (err, stdout) => {
      if (err) {
        reject(err);
      } else {
        resolve(stdout);
      }
    });
  });
}

module.exports = spawn;
