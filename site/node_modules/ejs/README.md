# EJS

Embedded JavaScript templates

[![Build Status](https://img.shields.io/travis/mde/ejs/master.svg?style=flat)](https://travis-ci.org/mde/ejs)
[![Developing Dependencies](https://img.shields.io/david/dev/mde/ejs.svg?style=flat)](https://david-dm.org/mde/ejs#info=devDependencies)

## Installation

```bash
$ npm install ejs
```

## Features

  * Control flow with `<% %>`
  * Escaped output with `<%= %>`
  * Unescaped raw output with `<%- %>`
  * Trim-mode ('newline slurping') with `-%>` ending tag
  * Custom delimiters (e.g., use '<? ?>' instead of '<% %>')
  * Includes
  * Client-side support
  * Static caching of intermediate JavaScript
  * Static caching of templates
  * Complies with the [Express](http://expressjs.com) view system

## Example

```html
<% if (user) { %>
  <h2><%= user.name %></h2>
<% } %>
```

## Usage

```javascript
var template = ejs.compile(str, options);
template(data);
// => Rendered HTML string

ejs.render(str, data, options);
// => Rendered HTML string
```

You can also use the shortcut `ejs.render(dataAndOptions);` where you pass
everything in a single object. In that case, you'll end up with local variables
for all the passed options.

## Options

  - `cache`           Compiled functions are cached, requires `filename`
  - `filename`        Used by `cache` to key caches, and for includes
  - `context`         Function execution context
  - `compileDebug`    When `false` no debug instrumentation is compiled
  - `client`          Returns standalone compiled function
  - `delimiter`       Character to use with angle brackets for open/close
  - `debug`           Output generated function body
  - `_with`           Whether or not to use `with() {}` constructs. If `false` then the locals will be stored in the `locals` object.
  - `rmWhitespace`    Remove all safe-to-remove whitespace, including leading
    and trailing whitespace. It also enables a safer version of `-%>` line
    slurping for all scriptlet tags (it does not strip new lines of tags in
    the middle of a line).

## Tags

  - `<%`              'Scriptlet' tag, for control-flow, no output
  - `<%=`             Outputs the value into the template (HTML escaped)
  - `<%-`             Outputs the unescaped value into the template
  - `<%#`             Comment tag, no execution, no output
  - `<%%`             Outputs a literal '<%'
  - `%>`              Plain ending tag
  - `-%>`             Trim-mode ('newline slurp') tag, trims following newline

## Includes

Includes either have to be an absolute path, or, if not, are assumed as
relative to the template with the `include` call. (This requires the
`filename` option.) For example if you are including `./views/user/show.ejs`
from `./views/users.ejs` you would use `<%- include('user/show') %>`.

You'll likely want to use the raw output tag (`<%-`) with your include to avoid
double-escaping the HTML output.

```html
<ul>
  <% users.forEach(function(user){ %>
    <%- include('user/show', {user: user}) %>
  <% }); %>
</ul>
```

Includes are inserted at runtime, so you can use variables for the path in the
`include` call (for example `<%- include(somePath) %>`). Variables in your
top-level data object are available to all your includes, but local variables
need to be passed down.

NOTE: Include preprocessor directives (`<% include user/show %>`) are
still supported.

## Custom delimiters

Custom delimiters can be applied on a per-template basis, or globally:

```javascript
var ejs = require('ejs'),
    users = ['geddy', 'neil', 'alex'];

// Just one template
ejs.render('<?= users.join(" | "); ?>', {users: users}, {delimiter: '?'});
// => 'geddy | neil | alex'

// Or globally
ejs.delimiter = '$';
ejs.render('<$= users.join(" | "); $>', {users: users});
// => 'geddy | neil | alex'
```

## Caching

EJS ships with a basic in-process cache for caching the intermediate JavaScript
functions used to render templates. It's easy to plug in LRU caching using
Node's `lru-cache` library:

```javascript
var ejs = require('ejs')
  , LRU = require('lru-cache');
ejs.cache = LRU(100); // LRU cache with 100-item limit
```

If you want to clear the EJS cache, call `ejs.clearCache`. If you're using the
LRU cache and need a different limit, simple reset `ejs.cache` to a new instance
of the LRU.

## Layouts

EJS does not specifically support blocks, but layouts can be implemented by
including headers and footers, like so:


```html
<%- include('header') -%>
<h1>
  Title
</h1>
<p>
  My page
</p>
<%- include('footer') -%>
```

## Client-side support

Go to the [Latest Release](https://github.com/mde/ejs/releases/latest), download
`./ejs.js` or `./ejs.min.js`.

Include one of these on your page, and `ejs.render(str)`.

## Related projects

There are a number of implementations of EJS:

 * TJ's implementation, the v1 of this library: https://github.com/tj/ejs
 * Jupiter Consulting's EJS: http://www.embeddedjs.com/
 * EJS Embedded JavaScript Framework on Google Code: https://code.google.com/p/embeddedjavascript/
 * Sam Stephenson's Ruby implementation: https://rubygems.org/gems/ejs
 * Erubis, an ERB implementation which also runs JavaScript: http://www.kuwata-lab.com/erubis/users-guide.04.html#lang-javascript

## License

Licensed under the Apache License, Version 2.0
(<http://www.apache.org/licenses/LICENSE-2.0>)

- - -
EJS Embedded JavaScript templates copyright 2112
mde@fleegix.org.


