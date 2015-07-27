# jsonwebtoken [![Build Status](https://secure.travis-ci.org/auth0/node-jsonwebtoken.png)](http://travis-ci.org/auth0/node-jsonwebtoken)


An implementation of [JSON Web Tokens](http://self-issued.info/docs/draft-ietf-oauth-json-web-token.html).

This was developed against `draft-ietf-oauth-json-web-token-08`. It makes use of [node-jws](https://github.com/brianloveswords/node-jws)

# Install

```bash
$ npm install jsonwebtoken
```

# Usage

### jwt.sign(payload, secretOrPrivateKey, options)

(Synchronous) Returns the JsonWebToken as string

`payload` could be an literal, buffer or string

`secretOrPrivateKey` is a string or buffer containing either the secret for HMAC algorithms, or the PEM
encoded private key for RSA and ECDSA.

`options`:

* `algorithm` (default: `HS256`)
* `expiresInMinutes` or `expiresInSeconds`
* `audience`
* `subject`
* `issuer`
* `noTimestamp`
* `headers`

If `payload` is not a buffer or a string, it will be coerced into a string
using `JSON.stringify`.

If any `expiresInMinutes`, `audience`, `subject`, `issuer` are not provided, there is no default. The jwt generated won't include those properties in the payload.

Additional headers can be provided via the `headers` object.

Generated jwts will include an `iat` claim by default unless `noTimestamp` is specified.

Example

```js
// sign with default (HMAC SHA256)
var jwt = require('jsonwebtoken');
var token = jwt.sign({ foo: 'bar' }, 'shhhhh');

// sign with RSA SHA256
var cert = fs.readFileSync('private.key');  // get private key
var token = jwt.sign({ foo: 'bar' }, cert, { algorithm: 'RS256'});
```

### jwt.verify(token, secretOrPublicKey, [options, callback])

`options`:

*  `ignoreExpiration`
*  `audience`
*  `issuer`


(Asynchronous) If a callback is supplied, function acts asynchronously. Callback passed the payload decoded if the signature (and optionally expiration, audience, issuer) are valid. If not, it will be passed the error.

(Synchronous) If a callback is not supplied, function acts synchronously. Returns the payload decoded if the signature (and optionally expiration, audience, issuer) are valid. If not, it will throw the error.

`token` is the JsonWebToken string

`secretOrPublicKey` is a string or buffer containing either the secret for HMAC algorithms, or the PEM
encoded public key for RSA and ECDSA.

`options`

* `algorithms`: List of strings with the names of the allowed algorithms. For instance, `["HS256", "HS384"]`.
* `audience`: if you want to check audience (`aud`), provide a value here
* `issuer`: if you want to check issuer (`iss`), provide a value here
* `ignoreExpiration`: if `true` do not validate the expiration of the token.

```js
// verify a token symmetric - synchronous
var decoded = jwt.verify(token, 'shhhhh');
console.log(decoded.foo) // bar

// verify a token symmetric
jwt.verify(token, 'shhhhh', function(err, decoded) {
  console.log(decoded.foo) // bar
});

// invalid token - synchronous
try {
  var decoded = jwt.verify(token, 'wrong-secret');
} catch(err) {
  // err
}

// invalid token
jwt.verify(token, 'wrong-secret', function(err, decoded) {
  // err
  // decoded undefined
});

// verify a token asymmetric
var cert = fs.readFileSync('public.pem');  // get public key
jwt.verify(token, cert, function(err, decoded) {
  console.log(decoded.foo) // bar
});

// verify audience
var cert = fs.readFileSync('public.pem');  // get public key
jwt.verify(token, cert, { audience: 'urn:foo' }, function(err, decoded) {
  // if audience mismatch, err == invalid audience
});

// verify issuer
var cert = fs.readFileSync('public.pem');  // get public key
jwt.verify(token, cert, { audience: 'urn:foo', issuer: 'urn:issuer' }, function(err, decoded) {
  // if issuer mismatch, err == invalid issuer
});

// alg mismatch
var cert = fs.readFileSync('public.pem'); // get public key
jwt.verify(token, cert, { algorithms: ['RS256'] }, function (err, payload) {
  // if token alg != RS256,  err == invalid signature
});

```

### jwt.decode(token [, options])

(Synchronous) Returns the decoded payload without verifying if the signature is valid.

`token` is the JsonWebToken string

`options`:

* `json`: force JSON.parse on the payload even if the header doesn't contain `"typ":"JWT"`.
* `complete`: return an object with the decoded payload and header.

Example

```js
// get the decoded payload ignoring signature, no secretOrPrivateKey needed
var decoded = jwt.decode(token);

// get the decoded payload and header
var decoded = jwt.decode(token, {complete: true});
console.log(decoded.header);
console.log(decoded.payload)
```

## Errors & Codes
Possible thrown errors during verification.
Error is the first argument of the verification callback.

### TokenExpiredError

Thrown error if the token is expired.

Error object:

* name: 'TokenExpiredError'
* message: 'jwt expired'
* expiredAt: [ExpDate]

```js
jwt.verify(token, 'shhhhh', function(err, decoded) {
  if (err) {
    /*
      err = {
        name: 'TokenExpiredError',
        message: 'jwt expired',
        expiredAt: 1408621000
      }
    */
  }
});
```

### JsonWebTokenError
Error object:

* name: 'JsonWebTokenError'
* message:
  * 'jwt malformed'
  * 'jwt signature is required'
  * 'invalid signature'
  * 'jwt audience invalid. expected: [OPTIONS AUDIENCE]'
  * 'jwt issuer invalid. expected: [OPTIONS ISSUER]'

```js
jwt.verify(token, 'shhhhh', function(err, decoded) {
  if (err) {
    /*
      err = {
        name: 'JsonWebTokenError',
        message: 'jwt malformed'
      }
    */
  }
});
```

## Algorithms supported

Array of supported algorithms. The following algorithms are currently supported.

alg Parameter Value | Digital Signature or MAC Algorithm
----------------|----------------------------
HS256 | HMAC using SHA-256 hash algorithm
HS384 | HMAC using SHA-384 hash algorithm
HS512 | HMAC using SHA-512 hash algorithm
RS256 | RSASSA using SHA-256 hash algorithm
RS384 | RSASSA using SHA-384 hash algorithm
RS512 | RSASSA using SHA-512 hash algorithm
ES256 | ECDSA using P-256 curve and SHA-256 hash algorithm
ES384 | ECDSA using P-384 curve and SHA-384 hash algorithm
ES512 | ECDSA using P-521 curve and SHA-512 hash algorithm
none | No digital signature or MAC value included

## Issue Reporting

If you have found a bug or if you have a feature request, please report them at this repository issues section. Please do not report security vulnerabilities on the public GitHub issue tracker. The [Responsible Disclosure Program](https://auth0.com/whitehat) details the procedure for disclosing security issues.

# TODO

* X.509 certificate chain is not checked

## Author

[Auth0](https://auth0.com)

## License

This project is licensed under the MIT license. See the [LICENSE](LICENSE) file for more info.
