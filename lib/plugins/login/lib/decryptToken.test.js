'use strict';

const expect = require('chai').expect;
const forge = require('node-forge');
const decryptToken = require('./decryptToken');

const encryptAuthToken = (token, key, iv) => {
  const cipher = forge.cipher.createCipher('AES-CBC', key);
  cipher.start({ iv });
  cipher.update(forge.util.createBuffer(token));
  cipher.finish();
  return forge.util.encode64(cipher.output.data);
};

describe('#decryptToken()', () => {
  it('should encrypt a token with AWS CBC', () => {
    const token = 'f3120811-8306-4d67-98e5-13fde2e490e4';
    const key = forge.random.getBytesSync(16);
    const iv = forge.random.getBytesSync(16);
    const encryptedToken = encryptAuthToken(token, key, iv);
    expect(decryptToken(encryptedToken, key, iv)).to.equal(token);
  });
});
