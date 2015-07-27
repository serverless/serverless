var jwt = require('../index');
var fs = require('fs');
var path = require('path');

var expect = require('chai').expect;
var assert = require('chai').assert;

describe('RS256', function() {
  var pub = fs.readFileSync(path.join(__dirname, 'pub.pem'));
  var priv = fs.readFileSync(path.join(__dirname, 'priv.pem'));
  var invalid_pub = fs.readFileSync(path.join(__dirname, 'invalid_pub.pem'));

  describe('when signing a token', function() {
    var token = jwt.sign({ foo: 'bar' }, priv, { algorithm: 'RS256' });

    it('should be syntactically valid', function() {
      expect(token).to.be.a('string');
      expect(token.split('.')).to.have.length(3);
    });

    context('asynchronous', function() {
      it('should validate with public key', function(done) {
        jwt.verify(token, pub, function(err, decoded) {
          assert.ok(decoded.foo);
          assert.equal('bar', decoded.foo);
          done();
        });
      });

      it('should throw with invalid public key', function(done) {
        jwt.verify(token, invalid_pub, function(err, decoded) {
          assert.isUndefined(decoded);
          assert.isNotNull(err);
          done();
        });
      });
    });

    context('synchronous', function() {
      it('should validate with public key', function() {
        var decoded = jwt.verify(token, pub);
        assert.ok(decoded.foo);
        assert.equal('bar', decoded.foo);
      });

      it('should throw with invalid public key', function() {
        var jwtVerify = jwt.verify.bind(null, token, invalid_pub)
        assert.throw(jwtVerify, 'invalid signature');
      });
    });

  });

  describe('when signing a token with expiration', function() {
    var token = jwt.sign({ foo: 'bar' }, priv, { algorithm: 'RS256', expiresInMinutes: 10 });

    it('should be valid expiration', function(done) {
      jwt.verify(token, pub, function(err, decoded) {
        assert.isNotNull(decoded);
        assert.isNull(err);
        done();
      });
    });

    it('should be invalid', function(done) {
      // expired token
      token = jwt.sign({ foo: 'bar' }, priv, { algorithm: 'RS256', expiresInMinutes: -10 });

      jwt.verify(token, pub, function(err, decoded) {
        assert.isUndefined(decoded);
        assert.isNotNull(err);
        assert.equal(err.name, 'TokenExpiredError');
        assert.instanceOf(err.expiredAt, Date);
        assert.instanceOf(err, jwt.TokenExpiredError);
        done();
      });
    });

    it('should NOT be invalid', function(done) {
      // expired token
      token = jwt.sign({ foo: 'bar' }, priv, { algorithm: 'RS256', expiresInMinutes: -10 });

      jwt.verify(token, pub, { ignoreExpiration: true }, function(err, decoded) {
        assert.ok(decoded.foo);
        assert.equal('bar', decoded.foo);
        done();
      });
    });
  });

  describe('when signing a token with audience', function() {
    var token = jwt.sign({ foo: 'bar' }, priv, { algorithm: 'RS256', audience: 'urn:foo' });

    it('should check audience', function(done) {
      jwt.verify(token, pub, { audience: 'urn:foo' }, function(err, decoded) {
        assert.isNotNull(decoded);
        assert.isNull(err);
        done();
      });
    });

    it('should check audience in array', function(done) {
      jwt.verify(token, pub, { audience: ['urn:foo', 'urn:other'] }, function (err, decoded) {
        assert.isNotNull(decoded);
        assert.isNull(err);
        done();
      });
    });

    it('should throw when invalid audience', function(done) {
      jwt.verify(token, pub, { audience: 'urn:wrong' }, function(err, decoded) {
        assert.isUndefined(decoded);
        assert.isNotNull(err);
        assert.equal(err.name, 'JsonWebTokenError');
        assert.instanceOf(err, jwt.JsonWebTokenError);
        done();
      });
    });

    it('should throw when invalid audience in array', function(done) {
      jwt.verify(token, pub, { audience: ['urn:wrong', 'urn:morewrong'] }, function(err, decoded) {
        assert.isUndefined(decoded);
        assert.isNotNull(err);
        assert.equal(err.name, 'JsonWebTokenError');
        assert.instanceOf(err, jwt.JsonWebTokenError);
        done();
      });
    });

  });

  describe('when signing a token with array audience', function() {
    var token = jwt.sign({ foo: 'bar' }, priv, { algorithm: 'RS256', audience: [ 'urn:foo', 'urn:bar' ] });

    it('should check audience', function(done) {
      jwt.verify(token, pub, { audience: 'urn:foo' }, function(err, decoded) {
        assert.isNotNull(decoded);
        assert.isNull(err);
        done();
      });
    });

    it('should check other audience', function(done) {
      jwt.verify(token, pub, { audience: 'urn:bar' }, function(err, decoded) {
        assert.isNotNull(decoded);
        assert.isNull(err);
        done();
      });
    });

    it('should check audience in array', function(done) {
      jwt.verify(token, pub, { audience: ['urn:foo', 'urn:other'] }, function (err, decoded) {
        assert.isNotNull(decoded);
        assert.isNull(err);
        done();
      });
    });

    it('should throw when invalid audience', function(done) {
      jwt.verify(token, pub, { audience: 'urn:wrong' }, function(err, decoded) {
        assert.isUndefined(decoded);
        assert.isNotNull(err);
        assert.equal(err.name, 'JsonWebTokenError');
        assert.instanceOf(err, jwt.JsonWebTokenError);
        done();
      });
    });

    it('should throw when invalid audience in array', function(done) {
      jwt.verify(token, pub, { audience: ['urn:wrong', 'urn:morewrong'] }, function(err, decoded) {
        assert.isUndefined(decoded);
        assert.isNotNull(err);
        assert.equal(err.name, 'JsonWebTokenError');
        assert.instanceOf(err, jwt.JsonWebTokenError);
        done();
      });
    });

  });

  describe('when signing a token without audience', function() {
    var token = jwt.sign({ foo: 'bar' }, priv, { algorithm: 'RS256' });

    it('should check audience', function(done) {
      jwt.verify(token, pub, { audience: 'urn:wrong' }, function(err, decoded) {
        assert.isUndefined(decoded);
        assert.isNotNull(err);
        assert.equal(err.name, 'JsonWebTokenError');
        assert.instanceOf(err, jwt.JsonWebTokenError);
        done();
      });
    });

    it('should check audience in array', function(done) {
      jwt.verify(token, pub, { audience: ['urn:wrong', 'urn:morewrong'] }, function(err, decoded) {
        assert.isUndefined(decoded);
        assert.isNotNull(err);
        assert.equal(err.name, 'JsonWebTokenError');
        assert.instanceOf(err, jwt.JsonWebTokenError);
        done();
      });
    });

  });

  describe('when signing a token with issuer', function() {
    var token = jwt.sign({ foo: 'bar' }, priv, { algorithm: 'RS256', issuer: 'urn:foo' });

    it('should check issuer', function() {
      jwt.verify(token, pub, { issuer: 'urn:foo' }, function(err, decoded) {
        assert.isNotNull(decoded);
        assert.isNull(err);
      });
    });

    it('should throw when invalid issuer', function() {
      jwt.verify(token, pub, { issuer: 'urn:wrong' }, function(err, decoded) {
        assert.isUndefined(decoded);
        assert.isNotNull(err);
        assert.equal(err.name, 'JsonWebTokenError');
        assert.instanceOf(err, jwt.JsonWebTokenError);
      });
    });
  });

  describe('when signing a token without issuer', function() {
    var token = jwt.sign({ foo: 'bar' }, priv, { algorithm: 'RS256' });

    it('should check issuer', function() {
      jwt.verify(token, pub, { issuer: 'urn:foo' }, function(err, decoded) {
        assert.isUndefined(decoded);
        assert.isNotNull(err);
        assert.equal(err.name, 'JsonWebTokenError');
        assert.instanceOf(err, jwt.JsonWebTokenError);
      });
    });
  });

  describe('when verifying a malformed token', function() {
    it('should throw', function(done) {
      jwt.verify('fruit.fruit.fruit', pub, function(err, decoded) {
        assert.isUndefined(decoded);
        assert.isNotNull(err);
        assert.equal(err.name, 'JsonWebTokenError');
        done();
      });
    });
  });

  describe('when decoding a jwt token with additional parts', function() {
    var token = jwt.sign({ foo: 'bar' }, priv, { algorithm: 'RS256' });

    it('should throw', function(done) {
      jwt.verify(token + '.foo', pub, function(err, decoded) {
        assert.isUndefined(decoded);
        assert.isNotNull(err);
        done();
      });
    });
  });

  describe('when decoding a invalid jwt token', function() {
    it('should return null', function(done) {
      var payload = jwt.decode('whatever.token');
      assert.isNull(payload);
      done();
    });
  });

  describe('when decoding a valid jwt token', function() {
    it('should return the payload', function(done) {
      var obj     = { foo: 'bar' };
      var token   = jwt.sign(obj, priv, { algorithm: 'RS256' });
      var payload = jwt.decode(token);
      assert.deepEqual(payload, obj);
      done();
    });
    it('should return the header and payload and signature if complete option is set', function(done) {
      var obj     = { foo: 'bar' };
      var token   = jwt.sign(obj, priv, { algorithm: 'RS256' });
      var decoded = jwt.decode(token, { complete: true });
      assert.deepEqual(decoded.payload, obj);
      assert.deepEqual(decoded.header, { typ: 'JWT', alg: 'RS256' });
      assert.ok(typeof decoded.signature == 'string');
      done();
    });
  });
});
