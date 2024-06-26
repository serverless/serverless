# striptags [![Build Status](https://travis-ci.org/ericnorris/striptags.svg)](https://travis-ci.org/ericnorris/striptags)
An implementation of PHP's [strip_tags](http://www.php.net/manual/en/function.strip-tags.php) in Node.js.

**Note:** `v3+` targets ES6, and is therefore incompatible with the master branch of `uglifyjs`. You can either:
- use `babili`, which supports ES6
- use the `harmony` branch of `uglifyjs`
- stick with the [2.x.x](https://github.com/ericnorris/striptags/tree/v2.x.x) branch

## Features
- Fast
- Zero dependencies
- 100% test code coverage
- No unsafe regular expressions

## Installing
```
npm install striptags
```

## Basic Usage
```javascript
striptags(html, allowed_tags, tag_replacement);
```

### Example
```javascript
var striptags = require('striptags');

var html =
    '<a href="https://example.com">' +
        'lorem ipsum <strong>dolor</strong> <em>sit</em> amet' +
    '</a>';

striptags(html);
striptags(html, '<strong>');
striptags(html, ['a']);
striptags(html, [], '\n');
```

Outputs:
```
'lorem ipsum dolor sit amet'
```

```
lorem ipsum <strong>dolor</strong> sit amet'
```

```
'<a href="https://example.com">lorem ipsum dolor sit amet</a>'
```

```
lorem ipsum 
dolor
 
sit
 amet
```

## Streaming Mode
`striptags` can also operate in streaming mode. Simply call `init_streaming_mode` to get back a function that accepts HTML and outputs stripped HTML. State is saved between calls so that partial HTML can be safely passed in.

```javascript
let stream_function = striptags.init_streaming_mode(
    allowed_tags,
    tag_replacement
);

let partial_text = stream_function(partial_html);
let more_text    = stream_function(more_html);
```

Check out [test/striptags-test.js](test/striptags-test.js) for a concrete example.

## Tests
You can run tests (powered by [mocha](http://mochajs.org/)) locally via:
```
npm test
```

Generate test coverage (powered by [istanbul](https://github.com/gotwarlost/istanbul)) via :
```
npm run coverage
```


## Doesn't use regular expressions
`striptags` does not use any regular expressions for stripping HTML tags.

Regular expressions are not capable of preventing all possible scripting attacks (see [this](http://stackoverflow.com/a/535022)). Here is a [great StackOverflow answer](http://stackoverflow.com/a/5793453) regarding how strip_tags (**when used without specifying allowableTags**) is not vulnerable to scripting attacks.
