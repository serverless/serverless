var jwt = require('../index');
var jws = require('jws');
var fs = require('fs');
var path = require('path');

var assert = require('chai').assert;

describe('verify', function() {
  var pub = fs.readFileSync(path.join(__dirname, 'pub.pem'));
  var priv = fs.readFileSync(path.join(__dirname, 'priv.pem'));

  it('should first assume JSON claim set', function () {
    var header = { alg: 'RS256' };
    var payload = { iat: Math.floor(Date.now() / 1000 ) };

    var signed = jws.sign({
        header: header,
        payload: payload,
        secret: priv,
        encoding: 'utf8'
    });

    jwt.verify(signed, pub, {typ: 'JWT'}, function(err, p) {
        assert.isNull(err);
        assert.deepEqual(p, payload);
    });
  });
});
