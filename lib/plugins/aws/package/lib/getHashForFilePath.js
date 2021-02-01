'use strict';

const memoize = require('memoizee');
const crypto = require('crypto');
const fs = require('fs');

const getHashForFilePath = memoize(
  async (filePath) => {
    const fileHash = crypto.createHash('sha256');
    fileHash.setEncoding('base64');
    return new Promise((resolve, reject) => {
      const readStream = fs.createReadStream(filePath);
      readStream
        .on('data', (chunk) => {
          fileHash.write(chunk);
        })
        .on('close', () => {
          fileHash.end();
          resolve(fileHash.read());
        })
        .on('error', (error) => {
          reject(
            new Error(
              `Error: ${error} encountered during hash calculation for provided filePath: ${filePath}`
            )
          );
        });
    });
  },
  { promise: true }
);

module.exports = getHashForFilePath;
