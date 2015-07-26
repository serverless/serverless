equal
=====

[![Build Status](https://travis-ci.org/shouldjs/equal.svg?branch=master)](https://travis-ci.org/shouldjs/equal)

Deep equality comparison implementation for should.js

Function return an object that have result of comparison and description of fail:

```js
> var a = {a:1,b:2,c:3,d:4,e:5,f:6,g:7,h:8,i:9,j:10},
... b = {a:1,b:2,c:3,d:4,e:5,f:6,g:7,h:7,i:9,j:10};
undefined
> eql(a, b);
{ result: false,
  path: [ 'h' ],
  reason: 'A and B are not equal',
  a: 8,
  b: 7 }
```
