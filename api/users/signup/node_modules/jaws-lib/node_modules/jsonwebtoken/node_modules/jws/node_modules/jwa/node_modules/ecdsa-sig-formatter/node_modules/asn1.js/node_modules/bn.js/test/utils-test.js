var assert = require('assert');
var BN = require('../').BN;
var fixtures = require('./fixtures');

describe('BN.js/Utils', function() {
  describe('.toString()', function() {
    describe('hex padding', function() {
      it('should have length of 8 from leading 15', function() {
        var a = new BN('ffb9602', 16);
        var b = new Buffer(a.toString('hex', 2), 'hex');
        assert.equal(a.toString('hex', 2).length, 8);
      });

      it('should have length of 8 from leading zero', function() {
        var a = new BN('fb9604', 16);
        var b = new Buffer(a.toString('hex', 8), 'hex');
        assert.equal(a.toString('hex', 8).length, 8);
      });

      it('should have length of 8 from leading zeros', function() {
        var a = new BN(0);
        var b = new Buffer(a.toString('hex', 8), 'hex');
        assert.equal(a.toString('hex', 8).length, 8);
      });

      it('should have length of 64 from leading 15', function() {
        var a = new BN(
            'ffb96ff654e61130ba8422f0debca77a0ea74ae5ea8bca9b54ab64aabf01003',
            16);
        var b = new Buffer(a.toString('hex', 2), 'hex');
        assert.equal(a.toString('hex', 2).length, 64);
      });

      it('should have length of 64 from leading zero', function() {
        var a = new BN(
            'fb96ff654e61130ba8422f0debca77a0ea74ae5ea8bca9b54ab64aabf01003',
            16);
        var b = new Buffer(a.toString('hex', 64), 'hex');
        assert.equal(a.toString('hex', 64).length, 64);
      });
    });
  });

  describe('.bitLength()', function() {
    it('should return proper bitLength', function() {
      assert.equal(new BN(0).bitLength(), 0);
      assert.equal(new BN(0x1).bitLength(), 1);
      assert.equal(new BN(0x2).bitLength(), 2);
      assert.equal(new BN(0x3).bitLength(), 2);
      assert.equal(new BN(0x4).bitLength(), 3);
      assert.equal(new BN(0x8).bitLength(), 4);
      assert.equal(new BN(0x10).bitLength(), 5);
      assert.equal(new BN(0x100).bitLength(), 9);
      assert.equal(new BN(0x123456).bitLength(), 21);
      assert.equal(new BN('123456789', 16).bitLength(), 33);
      assert.equal(new BN('8023456789', 16).bitLength(), 40);
    });
  });

  describe('.zeroBits()', function() {
    it('should return proper zeroBits', function() {
      assert.equal(new BN(0).zeroBits(), 0);
      assert.equal(new BN(0x1).zeroBits(), 0);
      assert.equal(new BN(0x2).zeroBits(), 1);
      assert.equal(new BN(0x3).zeroBits(), 0);
      assert.equal(new BN(0x4).zeroBits(), 2);
      assert.equal(new BN(0x8).zeroBits(), 3);
      assert.equal(new BN(0x10).zeroBits(), 4);
      assert.equal(new BN(0x100).zeroBits(), 8);
      assert.equal(new BN(0x1000000).zeroBits(), 24);
      assert.equal(new BN(0x123456).zeroBits(), 1);
    });
  });

  describe('.toJSON', function() {
    it('should return hex string', function() {
      assert.equal(new BN(0x123).toJSON(), '123');
    });
  });
});
