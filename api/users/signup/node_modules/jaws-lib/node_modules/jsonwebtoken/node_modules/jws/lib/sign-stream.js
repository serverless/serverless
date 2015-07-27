/*global module*/
const base64url = require('base64url');
const DataStream = require('./data-stream');
const jwa = require('jwa');
const Stream = require('stream');
const toString = require('./tostring');
const util = require('util');

function jwsSecuredInput(header, payload, encoding) {
  encoding = encoding || 'utf8';
  const encodedHeader = base64url(toString(header), 'binary');
  const encodedPayload = base64url(toString(payload), encoding);
  return util.format('%s.%s', encodedHeader, encodedPayload);
}

function jwsSign(opts) {
  const header = opts.header;
  const payload = opts.payload;
  const secretOrKey = opts.secret || opts.privateKey;
  const encoding = opts.encoding;
  const algo = jwa(header.alg);
  const securedInput = jwsSecuredInput(header, payload, encoding);
  const signature = algo.sign(securedInput, secretOrKey);
  return util.format('%s.%s', securedInput, signature);
}

function SignStream(opts) {
  const secret = opts.secret||opts.privateKey||opts.key;
  const secretStream = new DataStream(secret);
  this.readable = true;
  this.header = opts.header;
  this.encoding = opts.encoding;
  this.secret = this.privateKey = this.key = secretStream;
  this.payload = new DataStream(opts.payload);
  this.secret.once('close', function () {
    if (!this.payload.writable && this.readable)
      this.sign();
  }.bind(this));

  this.payload.once('close', function () {
    if (!this.secret.writable && this.readable)
      this.sign();
  }.bind(this));
}
util.inherits(SignStream, Stream);

SignStream.prototype.sign = function sign() {
  const signature = jwsSign({
    header: this.header,
    payload: this.payload.buffer,
    secret: this.secret.buffer,
    encoding: this.encoding
  });
  this.emit('done', signature);
  this.emit('data', signature);
  this.emit('end');
  this.readable = false;
  return signature;
};

SignStream.sign = jwsSign;

module.exports = SignStream;
