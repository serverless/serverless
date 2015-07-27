var assert = require('assert');
var BN = require('../').BN;
var fixtures = require('./fixtures');

describe('BN.js/Reduction context', function() {
  function testMethod(name, fn) {
    describe(name + ' method', function() {
      it('should support add, iadd, sub, isub operations', function() {
        var p = new BN(257);
        var m = fn(p);
        var a = new BN(123).toRed(m);
        var b = new BN(231).toRed(m);

        assert.equal(a.redAdd(b).fromRed().toString(10), '97');
        assert.equal(a.redSub(b).fromRed().toString(10), '149');
        assert.equal(b.redSub(a).fromRed().toString(10), '108');

        assert.equal(a.clone().redIAdd(b).fromRed().toString(10), '97');
        assert.equal(a.clone().redISub(b).fromRed().toString(10), '149');
        assert.equal(b.clone().redISub(a).fromRed().toString(10), '108');
      });

      it('should support pow and mul operations', function() {
        var p192 = new BN(
            'fffffffffffffffffffffffffffffffeffffffffffffffff',
            16);
        var m = fn(p192);
        var a = new BN(123);
        var b = new BN(231);
        var c = a.toRed(m).redMul(b.toRed(m)).fromRed();
        assert(c.cmp(a.mul(b).mod(p192)) === 0);

        assert.equal(a.toRed(m).redPow(new BN(3)).fromRed()
                                .cmp(a.sqr().mul(a)), 0);
        assert.equal(a.toRed(m).redPow(new BN(4)).fromRed()
                                .cmp(a.sqr().sqr()), 0);
        assert.equal(a.toRed(m).redPow(new BN(8)).fromRed()
                                .cmp(a.sqr().sqr().sqr()), 0);
        assert.equal(a.toRed(m).redPow(new BN(9)).fromRed()
                                .cmp(a.sqr().sqr().sqr().mul(a)), 0);
        assert.equal(a.toRed(m).redPow(new BN(17)).fromRed()
                                .cmp(a.sqr().sqr().sqr().sqr().mul(a)), 0);
      });

      it('should sqrtm numbers', function() {
        var p = new BN(263);
        var m = fn(p);
        var q = new BN(11).toRed(m);
        var qr = q.redSqrt(true, p);
        assert.equal(qr.redSqr().cmp(q), 0);
        var qr = q.redSqrt(false, p);
        assert.equal(qr.redSqr().cmp(q), 0);

        var p = new BN(
            'fffffffffffffffffffffffffffffffeffffffffffffffff',
            16);
        var m = fn(p);
        var q = new BN(13).toRed(m);
        var qr = q.redSqrt(true, p);
        assert.equal(qr.redSqr().cmp(q), 0);
        var qr = q.redSqrt(false, p);
        assert.equal(qr.redSqr().cmp(q), 0);

        // Tonelli-shanks
        var p = new BN(13);
        var m = fn(p);
        var q = new BN(10).toRed(m);
        assert.equal(q.redSqrt().fromRed().toString(10), '7');
      });

      it('should invm numbers', function() {
        var p = new BN(257);
        var m = fn(p);
        var a = new BN(3).toRed(m);
        var b = a.redInvm(p);
        assert.equal(a.redMul(b).fromRed().toString(16), '1');
      });

      it('should imul numbers', function() {
        var p = new BN(
            'fffffffffffffffffffffffffffffffeffffffffffffffff',
            16);
        var m = fn(p);

        var a = new BN('deadbeefabbadead', 16);
        var b = new BN('abbadeadbeefdead', 16);
        var c = a.mul(b).mod(p);

        assert.equal(a.toRed(m).redIMul(b.toRed(m)).fromRed().toString(16),
                     c.toString(16));
      });

      it('should pow(base, 0) == 1', function() {
        var base = new BN(256).toRed( BN.red('k256'));
        var exponent = new BN(0);
        var result = base.redPow(exponent);
        assert.equal(result.toString(), '1');
      });

      it('should reduce when converting to red', function() {
        var p = new BN(257);
        var m = fn(p);
        var a = new BN(5).toRed(m);

        assert.doesNotThrow(function() {
          var b = a.redISub(new BN(512).toRed(m));
          b.redISub(new BN(512).toRed(m));
        });
      });
    });
  }

  testMethod('Plain', BN.red);
  testMethod('Montgomery', BN.mont);

  describe('Pseudo-Mersenne Primes', function() {
    it('should reduce numbers mod k256', function() {
      var p = BN._prime('k256');

      assert.equal(p.ireduce(new BN(0xdead)).toString(16), 'dead');
      assert.equal(p.ireduce(new BN('deadbeef', 16)).toString(16), 'deadbeef');

      var num = new BN('fedcba9876543210fedcba9876543210dead' +
                           'fedcba9876543210fedcba9876543210dead',
                       16);
      var exp = num.mod(p.p).toString(16);
      assert.equal(p.ireduce(num).toString(16), exp);

      var regr = new BN('f7e46df64c1815962bf7bc9c56128798' +
                            '3f4fcef9cb1979573163b477eab93959' +
                            '335dfb29ef07a4d835d22aa3b6797760' +
                            '70a8b8f59ba73d56d01a79af9',
                        16);
      var exp = regr.mod(p.p).toString(16);
      assert.equal(p.ireduce(regr).toString(16), exp);
    });

    it('should not fail to invm number mod k256', function() {
      var regr2 = new BN(
        '6c150c4aa9a8cf1934485d40674d4a7cd494675537bda36d49405c5d2c6f496f', 16);
      regr2 = regr2.toRed(BN.red('k256'));
      assert.equal(regr2.redInvm().redMul(regr2).fromRed().cmpn(1), 0);
    });

    it('should correctly square the number', function() {
      var p = BN._prime('k256').p;
      var red = BN.red('k256');

      var n = new BN('9cd8cb48c3281596139f147c1364a3ed' +
                         'e88d3f310fdb0eb98c924e599ca1b3c9',
                     16);
      var expected = n.sqr().mod(p);
      var actual = n.toRed(red).redSqr().fromRed();

      assert.equal(actual.toString(16), expected.toString(16));
    });
  });
});
