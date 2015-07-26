Node.js - jsonfile
================

Easily read/write JSON files.

[![build status](https://secure.travis-ci.org/jprichardson/node-jsonfile.svg)](http://travis-ci.org/jprichardson/node-jsonfile)


Why?
----

Writing `JSON.stringify()` and then `fs.writeFile()` and `JSON.parse()` with `fs.readFile()` enclosed in `try/catch` blocks became annoying.



Installation
------------

    npm install jsonfile --save



API
---

### readFile(filename, [options], callback)

`options`: Pass in any `fs.readFile` options or set `reviver` for a [JSON reviver](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse).


```js
var jsonfile = require('jsonfile')
var util = require('util')

var file = '/tmp/data.json'
jsonfile.readFile(file, function(err, obj) {
  console.dir(obj)
})
```


### readFileSync(filename, [options])

`options`: Pass in any `fs.readFileSync` options or set `reviver` for a [JSON reviver](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse). Also `throws` set to `false` if you don't ever want this method
to throw on invalid JSON. Will return `null` instead. Defaults to `true`.

```js
var jsonfile = require('jsonfile')
var util = require('util')

var file = '/tmp/data.json'

console.dir(jsonfile.readFileSync(file))
```


### writeFile(filename, [options], callback)

`options`: Pass in any `fs.writeFile` options or set `replacer` for a [JSON replacer](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify). Can also pass in `spaces`.


```js
var jsonfile = require('jsonfile')

var file = '/tmp/data.json'
var obj = {name: 'JP'}

jsonfile.writeFile(file, obj, function (err) {
  console.error(err)
})
```

**formatting with spaces:**

```js
var jsonfile = require('jsonfile')

var file = '/tmp/data.json'
var obj = {name: 'JP'}

jsonfile.writeFile(file, obj, {spaces: 2}, function(err) {
  console.error(err)
})
```


### writeFileSync(filename, [options])

`options`: Pass in any `fs.writeFileSync` options or set `replacer` for a [JSON replacer](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify). Can also pass in `spaces`.

```js
var jsonfile = require('jsonfile')

var file = '/tmp/data.json'
var obj = {name: 'JP'}

jsonfile.writeFileSync(file, obj)
```

**formatting with spaces:**

```js
var jsonfile = require('jsonfile')

var file = '/tmp/data.json'
var obj = {name: 'JP'}

jsonfile.writeFileSync(file, obj, {spaces: 2})
```



### spaces

Global configuration to set spaces to indent JSON files.

**default:** `null`

```js
var jsonfile = require('jsonfile')

jsonfile.spaces = 4;

var file = '/tmp/data.json'
var obj = {name: 'JP'}

// json file has four space indenting now
jsonfile.writeFile(file, obj, function (err) {
  console.error(err)
})
```

Note, it's bound to `this.spaces`. So, if you do this:

```js
var myObj = {}
myObj.writeJsonSync = jsonfile.writeFileSync
// => this.spaces = null
```

Could do the following:

```js
var jsonfile = require('jsonfile')
jsonfile.spaces = 4
jsonfile.writeFileSync(file, obj) // will have 4 spaces indentation

var myCrazyObj = {spaces: 32}
myCrazyObj.writeJsonSync = jsonfile.writeFileSync
myCrazyObj.writeJsonSync(file, obj) // will have 32 space indentation
myCrazyObj.writeJsonSync(file, obj, {spaces: 2}) // will have only 2
```


License
-------

(MIT License)

Copyright 2012-2015, JP Richardson  <jprichardson@gmail.com>





