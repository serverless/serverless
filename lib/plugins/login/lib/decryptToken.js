'use strict';

const forge = require('node-forge');

module.exports = (encryptedToken, key, iv) => {
  const decipherToken = forge.cipher.createDecipher('AES-CBC', key);
  decipherToken.start({ iv });
  decipherToken.update(forge.util.createBuffer(forge.util.decode64(encryptedToken)));
  const result = decipherToken.finish(); // check 'result' for true/false
  if (!result) {
    throw new Error(`Couldn't decrypt token: ${encryptedToken}`);
  }
  return decipherToken.output.toString();
};
