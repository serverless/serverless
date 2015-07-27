# dotenv

<img src="https://raw.githubusercontent.com/motdotla/dotenv/master/dotenv.png" alt="dotenv" align="right" />

Dotenv loads environment variables from `.env` into `ENV` (process.env).

[![BuildStatus](https://img.shields.io/travis/motdotla/dotenv/master.svg?style=flat-square)](https://travis-ci.org/motdotla/dotenv)
[![NPM version](https://img.shields.io/npm/v/dotenv.svg?style=flat-square)](https://www.npmjs.com/package/dotenv)
[![js-standard-style](https://img.shields.io/badge/code%20style-standard-brightgreen.svg?style=flat-square)](https://github.com/feross/standard)

> "Storing [configuration in the environment](http://www.12factor.net/config)
> is one of the tenets of a [twelve-factor app](http://www.12factor.net/).
> Anything that is likely to change between deployment environments–such as
> resource handles for databases or credentials for external services–should be
> extracted from the code into environment variables.
>
> But it is not always practical to set environment variables on development
> machines or continuous integration servers where multiple projects are run.
> Dotenv loads variables from a `.env` file into ENV when the environment is
> bootstrapped."
>
> [Brandon Keepers' Dotenv in Ruby](https://github.com/bkeepers/dotenv)

## Install

```bash
npm install dotenv --save
```

## Usage

As early as possible in your application, require and load dotenv.

```javascript
require('dotenv').load();
```

Create a `.env` file in the root directory of your project. Add
environment-specific variables on new lines in the form of `NAME=VALUE`.
For example:

```
DB_HOST=localhost
DB_USER=root
DB_PASS=s1mpl3
```

That's it.

`process.env` now has the keys and values you defined in your `.env` file.

```javascript
db.connect({
  host: process.env.DB_HOST,
  username: process.env.DB_USER,
  password: process.env.DB_PASS
});
```

### Preload

If you are using iojs-v1.6.0 or later, you can use the `--require` (`-r`) command line option to preload dotenv. By doing this, you do not need to require and load dotenv in your application code.


```bash
$ node -r dotenv/config your_script.js
```

The configuration options below are supported as command line arguments in the format `dotenv_config_<option>=value`

```bash
$ node -r dotenv/config your_script.js dotenv_config_path=/custom/path/to/your/env/vars
```

## Config

`config` will read your .env file, parse the contents, and assign it to
`process.env` - just like `load` does. You can additionally, pass options to
`config`.

Note: `config` and `load` are synonyms. You can pass options to either.

### Options

#### Silent

Default: `false`

Dotenv outputs a warning to your console if missing a `.env` file. Suppress
this warning using silent.

```js
require('dotenv').config({silent: true});
```

#### Path

Default: `.env`

You can specify a custom path if your file containing environment variables is
named or located differently.

```js
require('dotenv').config({path: '/custom/path/to/your/env/vars'});
```

#### Encoding

Default: `utf8`

You may specify the encoding of your file containing environment variables
using this option.

```js
require('dotenv').config({encoding: 'base64'});
```

## Parse

The engine which parses the contents of your file containing environment
variables is available to use. It accepts a String or Buffer and will return
an Object with the parsed keys and values.

```js
var dotenv  = require('dotenv');
var buf    = new Buffer('BASIC=basic');
var config  = dotenv.parse(buf); // will return an object
console.log(typeof config, config) // object { BASIC : 'basic' }
```

### Rules

The parsing engine currently supports the following rules:

- `BASIC=basic` becomes `{BASIC: 'basic'}`
- empty lines are skipped
- lines beginning with `#` are treated as comments
- empty values become empty strings (`EMPTY=` becomes `{EMPTY: ''}`)
- single and double quoted values are escaped (`SINGLE_QUOTE='quoted'` becomes `{SINGLE_QUOTE: "quoted"}`)
- new lines are expanded if in double quotes (`MULTILINE="new\nline"` becomes

```
{MULTILINE: 'new
line'}
```
- inner quotes are maintained (think JSON) (`JSON={"foo": "bar"}` becomes `{JSON:"{\"foo\": \"bar\"}"`)

#### Expanding Variables

Basic variable expansion is supported.

```
BASIC=basic
TEST=$BASIC
```

Parsing that would result in `{BASIC: 'basic', TEST: 'basic'}`. You can escape
variables by quoting or beginning with `\` (e.g. `TEST=\$BASIC`). If the
variable is not found in the file, `process.env` is checked. Missing variables
result in an empty string.

```
BASIC=basic
TEST=$TEST
DNE=$DNE
```

```bash
TEST=example node -e 'require("dotenv").config();'
```

- `process.env.BASIC` would equal `basic`
- `process.env.TEST` would equal `example`
- `process.env.DNE` would equal `""`

## FAQ

### Should I commit my .env file?

No. We **strongly** recommend against committing your .env file to version
control. It should only include environment-specific values such as database
passwords or API keys. Your production database should have a different
password than your development database.

## Contributing

See [Contributing Guide](Contributing.md)

## Who's using dotenv

Here's just a few of many repositories using dotenv:

* [npm](https://github.com/npm/newww)
* [sendgrid-nodejs](https://github.com/sendgrid/sendgrid-nodejs)
* [handshake.js](https://github.com/handshakejs/handshakejs-api)
* [google-oauth2-service-account](https://github.com/jacoblwe20/google-oauth2-service-account)
* [kibble](https://github.com/motdotla/kibble)
* [github-streaker](https://github.com/motdotla/github-streaker)
