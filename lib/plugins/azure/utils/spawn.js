'use strict';

const exec = require('child_process').exec;

function spawn(cmd, options) {
  return new Promise((resolve, reject) => {
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
