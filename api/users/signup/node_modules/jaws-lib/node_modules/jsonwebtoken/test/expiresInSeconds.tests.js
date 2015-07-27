var jwt = require('../index');
var expect = require('chai').expect;

describe('noTimestamp', function() {

  it('should work with string', function () {
    var token = jwt.sign({foo: 123}, '123', { expiresInSeconds: 5 });
    var result = jwt.verify(token, '123');
    expect(result.exp).to.be.closeTo(Math.floor(Date.now() / 1000) + 5, 0.5);
  });

});