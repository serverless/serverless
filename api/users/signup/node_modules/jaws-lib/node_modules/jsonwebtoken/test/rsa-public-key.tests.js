var jwt = require('../');

describe('public key start with BEGIN RSA PUBLIC KEY', function () {

  it('should work', function (done) {
    var fs = require('fs');
    var cert_pub = fs.readFileSync(__dirname + '/rsa-public-key.pem');
    var cert_priv = fs.readFileSync(__dirname + '/rsa-private.pem');

    var token = jwt.sign({ foo: 'bar' }, cert_priv, { algorithm: 'RS256'});

    jwt.verify(token, cert_pub, done);
  });

});
