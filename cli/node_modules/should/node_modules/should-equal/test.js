var assert = require('assert');
var equal = require('./index');

function eq(a, b) {
  var r = equal(a, b);
  var msg = !r.result && (r.reason + ' at ' + r.path + ' ' + r.a + ' =/= ' + r.b);
  if(!r.result) {
    assert.equal(a, b, msg);
  }

}

function ne(a, b) {
  var r = equal(a, b);
  assert.ok(!r.result);
}

/* 1. simple tests */

/* 1.1. positive */
it("NaN eqs NaN", function() {
  return eq(NaN, NaN);
});
it("finite integer n eqs n", function() {
  return eq(1234, 1234);
});
it("empty list eqs empty list", function() {
  return eq([], []);
});
it("empty obj eqs empty obj", function() {
  return eq({}, {});
});
it("number eqs number of same value", function() {
  return eq(123.45678, 123.45678);
});
it("regex lit's w same pattern, flags are eq", function() {
  return eq(/^abc[a-zA-Z]/, /^abc[a-zA-Z]/);
});
it("pods w same properties are eq", function() {
  return eq({
    a: 'b',
    c: 'd'
  }, {
    a: 'b',
    c: 'd'
  });
});
it("pods that only differ wrt prop ord are eq", function() {
  return eq({
    a: 'b',
    c: 'd'
  }, {
    c: 'd',
    a: 'b'
  });
});

/* 1.2. negative */
it("obj doesn't eq list", function() {
  return ne({}, []);
});
it("obj in a list doesn't eq list in list", function() {
  return ne([{}], [[]]);
});
it("integer n doesn't eq rpr n", function() {
  return ne(1234, '1234');
});
it("integer n doesn't eq n + 1", function() {
  return ne(1234, 1235);
});
it("empty list doesn't eq false", function() {
  return ne([], false);
});
it("list w an integer doesn't eq one w rpr n", function() {
  return ne([3], ['3']);
});
it("regex lit's w diff. patterns, same flags aren't eq", function() {
  return ne(/^abc[a-zA-Z]/, /^abc[a-zA-Z]x/);
});
it("regex lit's w same patterns, diff. flags aren't eq", function() {
  return ne(/^abc[a-zA-Z]/, /^abc[a-zA-Z]/i);
});
it("+0 should ne -0", function() {
  return ne(+0, -0);
});
it("number obj not eqs primitive number of same value", function() {
  return ne(5, new Number(5));
});
it("string obj not eqs primitive string of same value", function() {
  return ne('helo', new String('helo'));
});
it("(1) bool obj not eqs primitive bool of same value", function() {
  return ne(false, new Boolean(false));
});
it("(2) bool obj not eqs primitive bool of same value", function() {
  return ne(true, new Boolean(true));
});
it("number obj eqs the same valued number object", function() {
  return eq(new Number(5), new Number(5));
});

/* 2. complex tests */
it("obj w undef member not eqs other obj w/out same member", function() {
  var d, e;
  d = {
    x: void 0
  };
  e = {};
  return ne(d, e);
});
it("fn1: functions w same source are eq", function() {
  var d, e;
  d = function( a, b, c ){ return a * b * c; };
  e = function( a, b, c ){ return a * b * c; };
  return eq(d, e);
});
it("fn2: functions w diff source aren't eq", function() {
  var d, e;
  d = function( a, b, c ){ return a * b * c; };
  e = function( a, b, c ){ return a  *  b  *  c; };
  return ne(d, e);
});
it("fn3: equal functions w equal props are eq", function() {
  var d, e;
  d = function() {
    return null;
  };
  d.foo = {
    some: 'meaningless',
    properties: 'here'
  };
  e = function() {
    return null;
  };
  e.foo = {
    some: 'meaningless',
    properties: 'here'
  };
  return eq(d, e);
});
it("fn4: equal functions w unequal props aren't eq", function() {
  var d, e;
  d = function() {
    return null;
  };
  d.foo = {
    some: 'meaningless',
    properties: 'here'
  };
  e = function() {
    return null;
  };
  e.foo = {
    some: 'meaningless',
    properties: 'here!!!'
  };
  return ne(d, e);
});
it("list w named member eqs other list w same member", function() {
  var d, e;
  d = ['foo', null, 3];
  d['extra'] = 42;
  e = ['foo', null, 3];
  e['extra'] = 42;
  return eq(d, e);
});
it("list w named member doesn't eq list w same member, other value", function() {
  var d, e;
  d = ['foo', null, 3];
  d['extra'] = 42;
  e = ['foo', null, 3];
  e['extra'] = 108;
  return ne(d, e);
});
it("date eqs other date pointing to same time", function() {
  var d, e;
  d = new Date("1995-12-17T03:24:00");
  e = new Date("1995-12-17T03:24:00");
  return eq(d, e);
});
it("date does not eq other date pointing to other time", function() {
  var d, e;
  d = new Date("1995-12-17T03:24:00");
  e = new Date("1995-12-17T03:24:01");
  return ne(d, e);
});
it("str obj w props eq same str, same props", function() {
  var d, e;
  d = new String("helo test");
  d['abc'] = 42;
  e = new String("helo test");
  e['abc'] = 42;
  return eq(d, e);
});
it("str obj w props not eq same str, other props", function() {
  var d, e;
  d = new String("helo test");
  d['abc'] = 42;
  e = new String("helo test");
  e['def'] = 42;
  return ne(d, e);
});
it("str obj w props eq same str, same props (circ)", function() {
  var c, d, e;
  c = ['a list'];
  c.push(c);
  d = new String("helo test");
  d['abc'] = c;
  e = new String("helo test");
  e['abc'] = c;
  return eq(d, e);
});
it("str obj w props not eq same str, other props (circ)", function() {
  var c, d, e;
  c = ['a list'];
  c.push(c);
  d = new String("helo test");
  d['abc'] = c;
  e = new String("helo test");
  e['def'] = c;
  return ne(d, e);
});
/*it("(1) circ arrays w similar layout, same values aren't eq"] = function() {
  var d, e;
  d = [1, 2, 3];
  d.push(d);
  e = [1, 2, 3];
  e.push(d);
  return ne(d, e);
};*/
it("(2) circ arrays w same layout, same values are eq", function() {
  var d, e;
  d = [1, 2, 3];
  d.push(d);
  e = [1, 2, 3];
  e.push(e);
  return eq(d, e);
});
it("(fkling1) arrays w eq subarrays are eq", function() {
  var a, b, bar, foo;
  a = [1, 2, 3];
  b = [1, 2, 3];
  foo = [a, a];
  bar = [b, b];
  return eq(foo, bar);
});
/*it("(fkling2) arrays w eq subarrays but diff distribution aren't eq"] = function() {
  var a, b, bar, foo;
  a = [1, 2, 3];
  b = [1, 2, 3];
  foo = [a, a];
  bar = [a, b];
  return ne(foo, bar);
};*/

/* joshwilsdon's test (https://github.com/joyent/node/issues/7161) */
it("joshwilsdon", function() {
  var count, d1, d2, errors, idx1, idx2, v1, v2, _i, _j, _len, _ref;
  d1 = [
    NaN, void 0, null, true, false, Infinity, 0, 1, "a", "b", {
      a: 1
    }, {
      a: "a"
    }, [
      {
        a: 1
      }
    ], [
      {
        a: true
      }
    ], {
      a: 1,
      b: 2
    }, [1, 2], [1, 2, 3], {
      a: "1"
    }, {
      a: "1",
      b: "2"
    }
  ];
  d2 = [
    NaN, void 0, null, true, false, Infinity, 0, 1, "a", "b", {
      a: 1
    }, {
      a: "a"
    }, [
      {
        a: 1
      }
    ], [
      {
        a: true
      }
    ], {
      a: 1,
      b: 2
    }, [1, 2], [1, 2, 3], {
      a: "1"
    }, {
      a: "1",
      b: "2"
    }
  ];
  errors = [];
  count = 0;
  for (idx1 = _i = 0, _len = d1.length; _i < _len; idx1 = ++_i) {
    v1 = d1[idx1];
    for (idx2 = _j = idx1, _ref = d2.length; idx1 <= _ref ? _j < _ref : _j > _ref; idx2 = idx1 <= _ref ? ++_j : --_j) {
      count += 1;
      v2 = d2[idx2];
      if (idx1 === idx2) {
        if (!eq(v1, v2)) {
          //errors.push("eq " + (rpr(v1)) + ", " + (rpr(v2)));
        }
      } else {
        if (!ne(v1, v2)) {
          //errors.push("ne " + (rpr(v1)) + ", " + (rpr(v2)));
        }
      }
    }
  }
  return [count, errors];
});
it('node buffer', function() {
  eq(new Buffer('abc'), new Buffer('abc'));
  ne(new Buffer('abc'), new Buffer('abc1'));
  ne(new Buffer('abd'), new Buffer('abc'));
});
it('RegExp with props', function() {
  var re1 = /a/;
  re1.lastIndex = 3;
  ne(re1, /a/);
});
it('Date with props', function() {
  var now = Date.now();

  var d1 = new Date(now);
  var d2 = new Date(now);

  d1.a = 10;

  ne(d1, d2);
});
it('Check object prototypes', function() {
  var nbRoot = {
    toString: function() { return this.first + ' ' + this.last; }
  };

  function nameBuilder(first, last) {
    this.first = first;
    this.last = last;
    return this;
  }
  nameBuilder.prototype = nbRoot;

  function nameBuilder2(first, last) {
    this.first = first;
    this.last = last;
    return this;
  }
  nameBuilder2.prototype = nbRoot;

  var nb1 = new nameBuilder('Ryan', 'Dahl');
  var nb2 = new nameBuilder2('Ryan', 'Dahl');

  eq(nb1, nb2);

  nameBuilder2.prototype = Object;
  nb2 = new nameBuilder2('Ryan', 'Dahl');

  ne(nb1, nb2);
});

it('typed arrays and array buffer', function() {
  if(typeof Uint8Array !== 'undefined') {
    var arr1 = new Uint8Array([21, 31]);
    var arr2 = new Uint8Array([21, 31]);

    eq(arr1, arr2);

    eq(arr1.buffer, arr2.buffer);
  }
});

it('es6 sets', function() {
  if(typeof Set !== 'undefined') {
    var s1 = new Set([1, 2, 3]);
    var s2 = new Set([1, 2, 3]);
    var s3 = new Set(['a', 'b', 'c']);
    var s4 = new Set([]);

    var s5 = new Set([{ a: 1}, { a: 1}, { a: 1}]);
    var s6 = new Set([{ a: 1}, { a: 1}, { a: 1}]);

    eq(s1, s2);
    ne(s1, s3);
    ne(s1, s4);
    ne(s1, s5);
    eq(s5, s6);
  }
});

it('es6 maps', function() {
  if(typeof Map !== 'undefined') {
    var m1 = new Map([[1, 1], [2, 2], [3, 3]]);
    var m2 = new Map([[1, 1], [2, 2], [3, 3]]);

    var m3 = new Map([[1, 2], [2, 3], [3, 4]]);
    var m4 = new Map([[{ a: 10}, 2], [{ a: 11}, 2], [{ a: 12}, 2]]);
    var m5 = new Map([[{ a: 11}, 2], [{ a: 12}, 2], [{ a: 13}, 2]]);
    var m6 = new Map([[{ a: 11}, 2], [{ a: 12}, 2], [{ a: 13}, 2]]);

    eq(m1, m1);
    eq(m1, m2);
    ne(m3, m2);
    ne(m4, m5);
    eq(m5, m6);
  }
});
