const bufferEqual = require('buffer-equal-constant-time');
const base64url = require('base64url');
const crypto = require('crypto');
const formatEcdsa = require('ecdsa-sig-formatter');
const util = require('util');

const MSG_INVALID_ALGORITHM = '"%s" is not a valid algorithm.\n  Supported algorithms are:\n  "HS256", "HS384", "HS512", "RS256", "RS384", "RS512" and "none".'
const MSG_INVALID_SECRET = 'secret must be a string or buffer';
const MSG_INVALID_VERIFIER_KEY = 'key must be a string or a buffer';
const MSG_INVALID_SIGNER_KEY = 'key must be a string, a buffer or an object';

function typeError(template) {
  const args = [].slice.call(arguments, 1);
  const errMsg = util.format.bind(util, template).apply(null, args);
  return new TypeError(errMsg);
}

function bufferOrString(obj) {
  return Buffer.isBuffer(obj) || typeof obj === 'string';
}

function normalizeInput(thing) {
  if (!bufferOrString(thing))
    thing = JSON.stringify(thing);
  return thing;
}

function createHmacSigner(bits) {
  return function sign(thing, secret) {
    if (!bufferOrString(secret))
      throw typeError(MSG_INVALID_SECRET);
    thing = normalizeInput(thing);
    const hmac = crypto.createHmac('sha' + bits, secret);
    const sig = (hmac.update(thing), hmac.digest('base64'))
    return base64url.fromBase64(sig);
  }
}

function createHmacVerifier(bits) {
  return function verify(thing, signature, secret) {
    const computedSig = createHmacSigner(bits)(thing, secret);
    return bufferEqual(Buffer(signature), Buffer(computedSig));
  }
}

function createKeySigner(bits) {
 return function sign(thing, privateKey) {
    if (!bufferOrString(privateKey) && !(typeof privateKey === 'object'))
      throw typeError(MSG_INVALID_SIGNER_KEY);
    thing = normalizeInput(thing);
    // Even though we are specifying "RSA" here, this works with ECDSA
    // keys as well.
    const signer = crypto.createSign('RSA-SHA' + bits);
    const sig = (signer.update(thing), signer.sign(privateKey, 'base64'));
    return base64url.fromBase64(sig);
  }
}

function createKeyVerifier(bits) {
  return function verify(thing, signature, publicKey) {
    if (!bufferOrString(publicKey))
      throw typeError(MSG_INVALID_VERIFIER_KEY);
    thing = normalizeInput(thing);
    signature = base64url.toBase64(signature);
    const verifier = crypto.createVerify('RSA-SHA' + bits);
    verifier.update(thing);
    return verifier.verify(publicKey, signature, 'base64');
  }
}

function createECDSASigner(bits) {
  const inner = createKeySigner(bits);
  return function sign() {
    var signature = inner.apply(null, arguments);
    signature = formatEcdsa.derToJose(signature, 'ES' + bits);
    return signature;
  };
}

function createECDSAVerifer(bits) {
  const inner = createKeyVerifier(bits);
  return function verify(thing, signature, publicKey) {
    signature = formatEcdsa.joseToDer(signature, 'ES' + bits).toString('base64');
    const result = inner(thing, signature, publicKey);
    return result;
  };
}

function createNoneSigner() {
  return function sign() {
    return '';
  }
}

function createNoneVerifier() {
  return function verify(thing, signature) {
    return signature === '';
  }
}

module.exports = function jwa(algorithm) {
  const signerFactories = {
    hs: createHmacSigner,
    rs: createKeySigner,
    es: createECDSASigner,
    none: createNoneSigner,
  }
  const verifierFactories = {
    hs: createHmacVerifier,
    rs: createKeyVerifier,
    es: createECDSAVerifer,
    none: createNoneVerifier,
  }
  const match = algorithm.match(/(RS|ES|HS|none)(256|384|512)?/i);
  if (!match)
    throw typeError(MSG_INVALID_ALGORITHM, algorithm);
  const algo = match[1].toLowerCase();
  const bits = match[2];

  return {
    sign: signerFactories[algo](bits),
    verify: verifierFactories[algo](bits),
  }
};
