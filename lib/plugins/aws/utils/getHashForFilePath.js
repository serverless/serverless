'use strict';

const memoize = require('memoizee');
const crypto = require('crypto');
const fs = require('fs');

const getHashForFilePathWithBase64 = memoize(
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

/* This approach will keep the benefit of hashing memoization
   per each file just once, no matter what encoding is needed. */
const getHashForFilePath = async (filePath, encoding = 'base64') => {
  const fileHash = await getHashForFilePathWithBase64(filePath);
  if (encoding === 'base64') return fileHash;
  return Buffer.from(fileHash, 'base64').toString(encoding);
};

getHashForFilePath.clear = getHashForFilePathWithBase64.clear;

module.exports = getHashForFilePath;
