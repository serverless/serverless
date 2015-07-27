# <img src="./logo.png" alt="bn.js" width="160" height="160" />

> BigNum in pure javascript

[![Build Status](https://secure.travis-ci.org/indutny/bn.js.png)](http://travis-ci.org/indutny/bn.js)

## Install
`npm install --save bn.js`

## API

```js
const BN = require('bn.js');

// Numbers
new BN(12345);     // <BN: 3039>
new BN(0x4123456); // <BN: 4123456>

// Strings
new BN('FF', 16); // <BN: 255>
new BN('1A6B765D8CDF', 16); // <BN: 29048849665247>

// Big endian
new BN([1,2,3,4]); // <BN: 1020304>
new BN([1,2,3,4]).toArray().join(','); // <BN: 1,2,3,4>

// Little endian
new BN([1,2,3], 10, 'le'); // <BN: 30201>
new BN([1,2,3,4], 10, 'le'); // <BN: 4030201>

// bitLength
new BN(0x123456).bitLength(); // <BN: 21>
new BN('123456789', 16).bitLength(); // <BN: 33>

// zeroBits
new BN('11000', 2).zeroBits(); // 3

// iaddn
new BN(-100).sign;  // true
new BN(100).sign;   // false

// isubn
new BN(-100).isubn(200) // <BN: -300>

// add
new BN(14).add(new BN(26)); // <BN: 28>

// mul
new BN(0x1001).mul(new BN(0x1234)); // <BN: 1235234>

// div
new BN('-69527932928').div(new BN('16974594')); // <BN: -fff>

// mod
new BN('10').mod(new BN(256)); // <BN: a>

// divRound
new BN(9).divRound(new BN(20)).toString(10); // <BN: 0>

// abs
new BN(0x1001).abs(); // <BN: 4097>

// modn
new BN('10', 16).modn(256); // <BN: 10>

// idivn
new BN('10', 16).idivn(3); // <BN: 5>

// shl
new BN('69527932928').shln(13); // <BN: 2060602000000>

// shrn
new BN('69527932928').shrn(13); // <BN: 818180>

// bincn
new BN(0xffffff).bincn(1);  // <BN: 1000001>

// imaskn
new BN('123456789', 16).imaskn(4); // <BN: 9>

// gcd
new BN(-18).gcd(new BN(12)); // <BN: 6>

// iand
(new BN('1', 2)
.iand(new BN('1000000000000000000000000000000000000001', 2))
.toString(2); // '1'

// ior
new BN('1', 2)
.ior(new BN('1000000000000000000000000000000000000000', 2));
// <BN: 1000000000000000000000000000000000000001>

// ixor
new BN('1', 2)
.ixor(new BN('11001100110011001100110011001100', 2));
// <BN: '11001100110011001100110011001101'>

// setn
new BN(0).setn(2, true); // <BN: 100>

```

## LICENSE

This software is licensed under the MIT License.

Copyright Fedor Indutny, 2015.

Permission is hereby granted, free of charge, to any person obtaining a
copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to permit
persons to whom the Software is furnished to do so, subject to the
following conditions:

The above copyright notice and this permission notice shall be included
in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
USE OR OTHER DEALINGS IN THE SOFTWARE.
