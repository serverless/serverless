# dotenv

Dotenv loads environment variables from .env into ENV (process.env). It is a superior alternative to [nconf](https://github.com/flatiron/nconf) and other variants.

[![BuildStatus](https://travis-ci.org/scottmotte/dotenv.png?branch=master)](https://travis-ci.org/scottmotte/dotenv)
[![NPM version](https://badge.fury.io/js/dotenv.png)](http://badge.fury.io/js/dotenv)

> "Storing [configuration in the environment](http://www.12factor.net/config) is one of the tenets of a [twelve-factor app](http://www.12factor.net/). Anything that is likely to change between deployment environments–such as resource handles for databases or credentials for external services–should be extracted from the code into environment variables.
> 
> But it is not always practical to set environment variables on development machines or continuous integration servers where multiple projects are run. Dotenv load variables from a `.env` file into ENV when the environment is bootstrapped."
> 
> [Brandon Keepers' Dotenv in Ruby](https://github.com/bkeepers/dotenv)

## Installation

Add it to your package.json file.

```javascript
{
  ...
  "dependencies": {
    ...
    "dotenv": "0.4.0"
  }
}
```

## Usage

As early as possible in your application require dotenv and load the `.env` variables: 

```javascript
var dotenv = require('dotenv');
dotenv.load();
```

Then, create a `.env` file in the root directory of your project. Add the application configuration you want. For example:

```
S3_BUCKET=YOURS3BUCKET
SECRET_KEY=YOURSECRETKEYGOESHERE
SENDGRID_USERNAME=YOURSENDGRIDUSERNAME
SENDGRID_PASSWORD=YOURSENDGRIDPASSWORDGOESHERE
```

Whenever your application loads, these variables will be available in `process.env`:

```javascript
var sendgrid_username = process.env.SENDGRID_USERNAME;
var secret_key        = process.env.SECRET_KEY;
```

That's it. You're done.

### Custom .env location path

The generally accepted standard is to keep your .env file in the root of your project directory. But you might find yourself wanting to place it elsewhere on your server. Here is how to do that.

```
var dotenv = require('dotenv');
dotenv._getKeyAndValueFromLine('/custom/path/to/your/.env');
dotenv._setEnvs();
```

That's it. It ends up being just one extra line of code.

### Dotenv.parse

Also added in `0.2.6` the method `parse` has been exposed. This is how `dotenv` internally parses multiline buffers or strings into an object to place into the `process.env` object. 

```javascript
var dotenv  = require('dotenv');
var file    = fs.readFileSync('./config/staging');
var config  = dotenv.parse(file); // passing in a buffer
console.log( typeof config, config ) // object { API : 'http://this.is.a/example' }
```

## Should I commit my .env file?

Try not to commit your .env file to version control. It is best to keep it local to your machine and local on any machine you deploy to. Keep production credential .envs on your production machines, and keep development .envs on your local machine.

## Contributing

1. Fork it
2. Create your feature branch (`git checkout -b my-new-feature`)
3. Commit your changes (`git commit -am 'Added some feature'`)
4. Push to the branch (`git push origin my-new-feature`)
5. Create new Pull Request

## Running tests

```bash
npm install
npm test
```

## Who's using dotenv

Here's a list of apps/sites/libraries using dotenv. It's in no way a complete list. 

* [sendgrid-nodejs](https://github.com/sendgrid/sendgrid-nodejs)
* [handshake.js](https://github.com/handshakejs/handshakejs-api)
* [xavi](http://xavi.io/)
* [google-oauth2-service-account](https://github.com/jacoblwe20/google-oauth2-service-account)
* [kibble](https://github.com/scottmotte/kibble)
* [flossedtoday](https://github.com/scottmotte/flossedtoday)
* [github-streaker](https://github.com/scottmotte/github-streaker)

[Create a pull request](https://github.com/scottmotte/dotenv/pulls) and add yours to the list.
