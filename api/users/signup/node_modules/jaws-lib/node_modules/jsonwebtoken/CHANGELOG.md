# Change Log

All notable changes to this project will be documented in this file starting from version **v4.0.0**.
This project adheres to [Semantic Versioning](http://semver.org/).

## [5.0.0] - 2015-04-11

### Changed

 - [sign] Only set defautl `iat` if the user does not specify that argument.

  https://github.com/auth0/node-jsonwebtoken/commit/e900282a8d2dff1d4dec815f7e6aa7782e867d91
  https://github.com/auth0/node-jsonwebtoken/commit/35036b188b4ee6b42df553bbb93bc8a6b19eae9d
  https://github.com/auth0/node-jsonwebtoken/commit/954bd7a312934f03036b6bb6f00edd41f29e54d9
  https://github.com/auth0/node-jsonwebtoken/commit/24a370080e0b75f11d4717cd2b11b2949d95fc2e
  https://github.com/auth0/node-jsonwebtoken/commit/a77df6d49d4ec688dfd0a1cc723586bffe753516

### Security

 - [verify] Update to jws@^3.0.0 and renaming `header.alg` mismatch exception to `invalid algorithm` and adding more mismatch tests. 
 
  As `jws@3.0.0` changed the verify method signature to be `jws.verify(signature, algorithm, secretOrKey)`, the token header must be decoded first in order to make sure that the `alg` field matches one of the allowed `options.algorithms`. After that, the now validated `header.alg` is passed to `jws.verify`
 
 As the order of steps has changed, the error that was thrown when the JWT was invalid is no longer the `jws` one:
 ```
 { [Error: Invalid token: no header in signature 'a.b.c'] code: 'MISSING_HEADER', signature: 'a.b.c' }
 ```

 That old error (removed from jws) has been replaced by a `JsonWebTokenError` with message `invalid token`.
 
 > Important: versions >= 4.2.2 this library are safe to use but we decided to deprecate everything `< 5.0.0` to prevent security warnings from library `node-jws` when doing `npm install`.

  https://github.com/auth0/node-jsonwebtoken/commit/634b8ed0ff5267dc25da5c808634208af109824e
  https://github.com/auth0/node-jsonwebtoken/commit/9f24ffd5791febb449d4d03ff58d7807da9b9b7e
  https://github.com/auth0/node-jsonwebtoken/commit/19e6cc6a1f2fd90356f89b074223b9665f2aa8a2
  https://github.com/auth0/node-jsonwebtoken/commit/1e4623420159c6410616f02a44ed240f176287a9
  https://github.com/auth0/node-jsonwebtoken/commit/954bd7a312934f03036b6bb6f00edd41f29e54d9
  https://github.com/auth0/node-jsonwebtoken/commit/24a370080e0b75f11d4717cd2b11b2949d95fc2e
  https://github.com/auth0/node-jsonwebtoken/commit/a77df6d49d4ec688dfd0a1cc723586bffe753516

## [4.2.2] - 2015-03-26
### Fixed

 - [asymmetric-keys] Fix verify for RSAPublicKey formated keys (`jfromaniello - awlayton`)
  https://github.com/auth0/node-jsonwebtoken/commit/402794663b9521bf602fcc6f2e811e7d3912f9dc
  https://github.com/auth0/node-jsonwebtoken/commit/8df6aabbc7e1114c8fb3917931078254eb52c222

## [4.2.1] - 2015-03-17
### Fixed

 - [asymmetric-keys] Fixed issue when public key starts with BEING PUBLIC KEY (https://github.com/auth0/node-jsonwebtoken/issues/70) (`jfromaniello`)
  https://github.com/auth0/node-jsonwebtoken/commit/7017e74db9b194448ff488b3e16468ada60c4ee5

## [4.2.0] - 2015-03-16
### Security

 - [asymmetric-keys] Making sure a token signed with an asymmetric key will be verified using a asymmetric key.
   When the verification part was expecting a token digitally signed with an asymmetric key (RS/ES family) of algorithms an attacker could send a token signed with a symmetric algorithm (HS* family).
  
  The issue was caused because the same signature was used to verify both type of tokens (`verify` method parameter: `secretOrPublicKey`).
  
  This change adds a new parameter to the verify called `algorithms`. This can be used to specify a list of supported algorithms, but the default value depends on the secret used: if the secretOrPublicKey contains the string `BEGIN CERTIFICATE` the default is `[ 'RS256','RS384','RS512','ES256','ES384','ES512' ]` otherwise is `[ 'HS256','HS384','HS512' ]`. (`jfromaniello`)
  https://github.com/auth0/node-jsonwebtoken/commit/c2bf7b2cd7e8daf66298c2d168a008690bc4bdd3
  https://github.com/auth0/node-jsonwebtoken/commit/1bb584bc382295eeb7ee8c4452a673a77a68b687

## [4.1.0] - 2015-03-10
### Changed
- Assume the payload is JSON even when there is no `typ` property. [5290db1](https://github.com/auth0/node-jsonwebtoken/commit/5290db1bd74f74cd38c90b19e2355ef223a4d931)

## [4.0.0] - 2015-03-06
### Changed
- The default encoding is now utf8 instead of binary. [92d33bd](https://github.com/auth0/node-jsonwebtoken/commit/92d33bd99a3416e9e5a8897d9ad8ff7d70a00bfd)
- Add `encoding` as a new option to `sign`. [1fc385e](https://github.com/auth0/node-jsonwebtoken/commit/1fc385ee10bd0018cd1441552dce6c2e5a16375f)
- Add `ignoreExpiration` to `verify`. [8d4da27](https://github.com/auth0/node-jsonwebtoken/commit/8d4da279e1b351ac71ace276285c9255186d549f)
- Add `expiresInSeconds` to `sign`. [dd156cc](https://github.com/auth0/node-jsonwebtoken/commit/dd156cc30f17028744e60aec0502897e34609329)

### Fixed
- Fix wrong error message when the audience doesn't match. [44e3c8d](https://github.com/auth0/node-jsonwebtoken/commit/44e3c8d757e6b4e2a57a69a035f26b4abec3e327)
- Fix wrong error message when the issuer doesn't match. [44e3c8d](https://github.com/auth0/node-jsonwebtoken/commit/44e3c8d757e6b4e2a57a69a035f26b4abec3e327)
- Fix wrong `iat` and `exp` values when signing with `noTimestamp`. [331b7bc](https://github.com/auth0/node-jsonwebtoken/commit/331b7bc9cc335561f8806f2c4558e105cb53e0a6)
