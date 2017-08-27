module.exports =
/******/ (function(modules) { // webpackBootstrap
/******/ 	// The module cache
/******/ 	var installedModules = {};
/******/
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/
/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId]) {
/******/ 			return installedModules[moduleId].exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			i: moduleId,
/******/ 			l: false,
/******/ 			exports: {}
/******/ 		};
/******/
/******/ 		// Execute the module function
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/
/******/ 		// Flag the module as loaded
/******/ 		module.l = true;
/******/
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/
/******/
/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = modules;
/******/
/******/ 	// expose the module cache
/******/ 	__webpack_require__.c = installedModules;
/******/
/******/ 	// define getter function for harmony exports
/******/ 	__webpack_require__.d = function(exports, name, getter) {
/******/ 		if(!__webpack_require__.o(exports, name)) {
/******/ 			Object.defineProperty(exports, name, {
/******/ 				configurable: false,
/******/ 				enumerable: true,
/******/ 				get: getter
/******/ 			});
/******/ 		}
/******/ 	};
/******/
/******/ 	// getDefaultExport function for compatibility with non-harmony modules
/******/ 	__webpack_require__.n = function(module) {
/******/ 		var getter = module && module.__esModule ?
/******/ 			function getDefault() { return module['default']; } :
/******/ 			function getModuleExports() { return module; };
/******/ 		__webpack_require__.d(getter, 'a', getter);
/******/ 		return getter;
/******/ 	};
/******/
/******/ 	// Object.prototype.hasOwnProperty.call
/******/ 	__webpack_require__.o = function(object, property) { return Object.prototype.hasOwnProperty.call(object, property); };
/******/
/******/ 	// __webpack_public_path__
/******/ 	__webpack_require__.p = "";
/******/
/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(__webpack_require__.s = 27);
/******/ })
/************************************************************************/
/******/ ([
/* 0 */
/***/ (function(module, exports) {

module.exports = require("path");

/***/ }),
/* 1 */
/***/ (function(module, exports, __webpack_require__) {

var os = __webpack_require__(4);
var fs = __webpack_require__(2);
var _ls = __webpack_require__(9);

// Module globals
var config = {
  silent: false,
  fatal: false,
  verbose: false,
};
exports.config = config;

var state = {
  error: null,
  currentCmd: 'shell.js',
  previousDir: null,
  tempDir: null
};
exports.state = state;

var platform = os.type().match(/^Win/) ? 'win' : 'unix';
exports.platform = platform;

function log() {
  if (!config.silent)
    console.error.apply(console, arguments);
}
exports.log = log;

// Shows error message. Throws unless _continue or config.fatal are true
function error(msg, _continue) {
  if (state.error === null)
    state.error = '';
  var log_entry = state.currentCmd + ': ' + msg;
  if (state.error === '')
    state.error = log_entry;
  else
    state.error += '\n' + log_entry;

  if (msg.length > 0)
    log(log_entry);

  if (config.fatal)
    process.exit(1);

  if (!_continue)
    throw '';
}
exports.error = error;

// In the future, when Proxies are default, we can add methods like `.to()` to primitive strings.
// For now, this is a dummy function to bookmark places we need such strings
function ShellString(str) {
  return str;
}
exports.ShellString = ShellString;

// Return the home directory in a platform-agnostic way, with consideration for
// older versions of node
function getUserHome() {
  var result;
  if (os.homedir)
    result = os.homedir(); // node 3+
  else
    result = process.env[(process.platform === 'win32') ? 'USERPROFILE' : 'HOME'];
  return result;
}
exports.getUserHome = getUserHome;

// Returns {'alice': true, 'bob': false} when passed a string and dictionary as follows:
//   parseOptions('-a', {'a':'alice', 'b':'bob'});
// Returns {'reference': 'string-value', 'bob': false} when passed two dictionaries of the form:
//   parseOptions({'-r': 'string-value'}, {'r':'reference', 'b':'bob'});
function parseOptions(opt, map) {
  if (!map)
    error('parseOptions() internal error: no map given');

  // All options are false by default
  var options = {};
  for (var letter in map) {
    if (map[letter][0] !== '!')
      options[map[letter]] = false;
  }

  if (!opt)
    return options; // defaults

  var optionName;
  if (typeof opt === 'string') {
    if (opt[0] !== '-')
      return options;

    // e.g. chars = ['R', 'f']
    var chars = opt.slice(1).split('');

    chars.forEach(function(c) {
      if (c in map) {
        optionName = map[c];
        if (optionName[0] === '!')
          options[optionName.slice(1, optionName.length-1)] = false;
        else
          options[optionName] = true;
      } else {
        error('option not recognized: '+c);
      }
    });
  } else if (typeof opt === 'object') {
    for (var key in opt) {
      // key is a string of the form '-r', '-d', etc.
      var c = key[1];
      if (c in map) {
        optionName = map[c];
        options[optionName] = opt[key]; // assign the given value
      } else {
        error('option not recognized: '+c);
      }
    }
  } else {
    error('options must be strings or key-value pairs');
  }
  return options;
}
exports.parseOptions = parseOptions;

// Expands wildcards with matching (ie. existing) file names.
// For example:
//   expand(['file*.js']) = ['file1.js', 'file2.js', ...]
//   (if the files 'file1.js', 'file2.js', etc, exist in the current dir)
function expand(list) {
  var expanded = [];
  list.forEach(function(listEl) {
    // Wildcard present on directory names ?
    if(listEl.search(/\*[^\/]*\//) > -1 || listEl.search(/\*\*[^\/]*\//) > -1) {
      var match = listEl.match(/^([^*]+\/|)(.*)/);
      var root = match[1];
      var rest = match[2];
      var restRegex = rest.replace(/\*\*/g, ".*").replace(/\*/g, "[^\\/]*");
      restRegex = new RegExp(restRegex);

      _ls('-R', root).filter(function (e) {
        return restRegex.test(e);
      }).forEach(function(file) {
        expanded.push(file);
      });
    }
    // Wildcard present on file names ?
    else if (listEl.search(/\*/) > -1) {
      _ls('', listEl).forEach(function(file) {
        expanded.push(file);
      });
    } else {
      expanded.push(listEl);
    }
  });
  return expanded;
}
exports.expand = expand;

// Normalizes _unlinkSync() across platforms to match Unix behavior, i.e.
// file can be unlinked even if it's read-only, see https://github.com/joyent/node/issues/3006
function unlinkSync(file) {
  try {
    fs.unlinkSync(file);
  } catch(e) {
    // Try to override file permission
    if (e.code === 'EPERM') {
      fs.chmodSync(file, '0666');
      fs.unlinkSync(file);
    } else {
      throw e;
    }
  }
}
exports.unlinkSync = unlinkSync;

// e.g. 'shelljs_a5f185d0443ca...'
function randomFileName() {
  function randomHash(count) {
    if (count === 1)
      return parseInt(16*Math.random(), 10).toString(16);
    else {
      var hash = '';
      for (var i=0; i<count; i++)
        hash += randomHash(1);
      return hash;
    }
  }

  return 'shelljs_'+randomHash(20);
}
exports.randomFileName = randomFileName;

// extend(target_obj, source_obj1 [, source_obj2 ...])
// Shallow extend, e.g.:
//    extend({A:1}, {b:2}, {c:3}) returns {A:1, b:2, c:3}
function extend(target) {
  var sources = [].slice.call(arguments, 1);
  sources.forEach(function(source) {
    for (var key in source)
      target[key] = source[key];
  });

  return target;
}
exports.extend = extend;

// Common wrapper for all Unix-like commands
function wrap(cmd, fn, options) {
  return function() {
    var retValue = null;

    state.currentCmd = cmd;
    state.error = null;

    try {
      var args = [].slice.call(arguments, 0);

      if (config.verbose) {
        args.unshift(cmd);
        console.log.apply(console, args);
        args.shift();
      }

      if (options && options.notUnix) {
        retValue = fn.apply(this, args);
      } else {
        if (typeof args[0] === 'object' && args[0].constructor.name === 'Object') {
          args = args; // object count as options
        } else if (args.length === 0 || typeof args[0] !== 'string' || args[0].length <= 1 || args[0][0] !== '-') {
          args.unshift(''); // only add dummy option if '-option' not already present
        }
        // Expand the '~' if appropriate
        var homeDir = getUserHome();
        args = args.map(function(arg) {
          if (typeof arg === 'string' && arg.slice(0, 2) === '~/' || arg === '~')
            return arg.replace(/^~/, homeDir);
          else
            return arg;
        });
        retValue = fn.apply(this, args);
      }
    } catch (e) {
      if (!state.error) {
        // If state.error hasn't been set it's an error thrown by Node, not us - probably a bug...
        console.log('shell.js: internal error');
        console.log(e.stack || e);
        process.exit(1);
      }
      if (config.fatal)
        throw e;
    }

    state.currentCmd = 'shell.js';
    return retValue;
  };
} // wrap
exports.wrap = wrap;


/***/ }),
/* 2 */
/***/ (function(module, exports) {

module.exports = require("fs");

/***/ }),
/* 3 */
/***/ (function(module, exports) {

module.exports = require("bluebird");

/***/ }),
/* 4 */
/***/ (function(module, exports) {

module.exports = require("os");

/***/ }),
/* 5 */
/***/ (function(module, exports) {

module.exports = require("lodash");

/***/ }),
/* 6 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
/**
 * Promisified FSE
 */


const BbPromise = __webpack_require__(3);
const fse = BbPromise.promisifyAll(__webpack_require__(20));

module.exports = fse;


/***/ }),
/* 7 */
/***/ (function(module, exports) {

module.exports = {"name":"serverless","version":"1.20.2","engines":{"node":">=4.0"},"preferGlobal":true,"homepage":"https://github.com/serverless/serverless#readme","description":"Serverless Framework - Build web, mobile and IoT applications with serverless architectures using AWS Lambda, Azure Functions, Google CloudFunctions & more","author":"serverless.com","license":"MIT","repository":{"type":"git","url":"https://github.com/serverless/serverless"},"keywords":["serverless","serverless framework","serverless applications","serverless modules","api gateway","lambda","aws","aws lambda","amazon","amazon web services","azure","azure functions","google cloud functions","apache open whisk","iot","internet of things","serverless.com"],"files":["bin","lib","scripts/postinstall.js","scripts/preuninstall.js","scripts/pre-release.js","package.json","package-lock.json","README.md","LICENSE.txt","CHANGELOG.md"],"main":"lib/Serverless.js","bin":{"serverless":"./bin/serverless","slss":"./bin/serverless","sls":"./bin/serverless"},"scripts":{"test-bare":"env FORCE_COLOR=0 node_modules/mocha/bin/_mocha \"!(node_modules)/**/*.test.js\" --require=sinon-bluebird -R spec --recursive --no-exit","test":"env FORCE_COLOR=0 istanbul cover -x \"**/*.test.js\" node_modules/mocha/bin/_mocha \"!(node_modules)/**/*.test.js\" -- --require=sinon-bluebird -R spec --recursive","lint":"eslint . --cache","docs":"node scripts/generate-readme.js","simple-integration-test":"jest --maxWorkers=5 simple-suite","complex-integration-test":"jest --maxWorkers=5 integration","postinstall":"node ./scripts/postinstall.js","prepublishOnly":"node ./scripts/pre-release.js","build":"webpack"},"jest":{"testRegex":"(\\.|/)(tests)\\.js$","setupTestFrameworkScriptFile":"<rootDir>/tests/setupTests.js"},"devDependencies":{"chai":"^3.5.0","chai-as-promised":"^6.0.0","coveralls":"^2.12.0","eslint":"^3.3.1","eslint-config-airbnb":"^10.0.1","eslint-config-airbnb-base":"^5.0.2","eslint-plugin-import":"^1.13.0","eslint-plugin-jsx-a11y":"^2.1.0","eslint-plugin-react":"^6.1.1","istanbul":"^0.4.4","jest-cli":"^18.0.0","jszip":"^3.1.2","markdown-magic":"^0.1.15","mocha":"^3.0.2","mocha-lcov-reporter":"^1.2.0","mock-require":"^1.3.0","proxyquire":"^1.7.10","sinon":"^1.17.5","sinon-bluebird":"^3.1.0","sinon-chai":"^2.9.0","uglifyjs-webpack-plugin":"^0.4.6","webpack":"^3.5.5"},"dependencies":{"@serverless/fdk":"^0.3.0","apollo-client":"^1.4.2","archiver":"^1.1.0","async":"^1.5.2","aws-sdk":"^2.7.13","bluebird":"^3.4.0","chalk":"^2.0.0","ci-info":"^1.0.0","download":"^5.0.2","filesize":"^3.3.0","fs-extra":"^0.26.7","get-stdin":"^5.0.1","globby":"^6.1.0","graceful-fs":"^4.1.11","graphql":"^0.10.1","graphql-tag":"^2.4.0","https-proxy-agent":"^1.0.0","is-docker":"^1.1.0","js-yaml":"^3.6.1","json-refs":"^2.1.5","jwt-decode":"^2.2.0","lodash":"^4.13.1","minimist":"^1.2.0","moment":"^2.13.0","node-fetch":"^1.6.0","opn":"^5.0.0","pg":"^7.2.0","pg-native":"^2.2.0","raven":"^1.2.1","rc":"^1.1.6","replaceall":"^0.1.6","semver":"^5.0.3","semver-regex":"^1.0.0","shelljs":"^0.6.0","tabtab":"^2.2.2","uuid":"^2.0.2","write-file-atomic":"^2.1.0"}}

/***/ }),
/* 8 */
/***/ (function(module, exports) {

module.exports = require("js-yaml");

/***/ }),
/* 9 */
/***/ (function(module, exports, __webpack_require__) {

var path = __webpack_require__(0);
var fs = __webpack_require__(2);
var common = __webpack_require__(1);
var _cd = __webpack_require__(10);
var _pwd = __webpack_require__(11);

//@
//@ ### ls([options,] [path, ...])
//@ ### ls([options,] path_array)
//@ Available options:
//@
//@ + `-R`: recursive
//@ + `-A`: all files (include files beginning with `.`, except for `.` and `..`)
//@ + `-d`: list directories themselves, not their contents
//@ + `-l`: list objects representing each file, each with fields containing `ls
//@         -l` output fields. See
//@         [fs.Stats](https://nodejs.org/api/fs.html#fs_class_fs_stats)
//@         for more info
//@
//@ Examples:
//@
//@ ```javascript
//@ ls('projs/*.js');
//@ ls('-R', '/users/me', '/tmp');
//@ ls('-R', ['/users/me', '/tmp']); // same as above
//@ ls('-l', 'file.txt'); // { name: 'file.txt', mode: 33188, nlink: 1, ...}
//@ ```
//@
//@ Returns array of files in the given path, or in current directory if no path provided.
function _ls(options, paths) {
  options = common.parseOptions(options, {
    'R': 'recursive',
    'A': 'all',
    'a': 'all_deprecated',
    'd': 'directory',
    'l': 'long'
  });

  if (options.all_deprecated) {
    // We won't support the -a option as it's hard to image why it's useful
    // (it includes '.' and '..' in addition to '.*' files)
    // For backwards compatibility we'll dump a deprecated message and proceed as before
    common.log('ls: Option -a is deprecated. Use -A instead');
    options.all = true;
  }

  if (!paths)
    paths = ['.'];
  else if (typeof paths === 'object')
    paths = paths; // assume array
  else if (typeof paths === 'string')
    paths = [].slice.call(arguments, 1);

  var list = [];

  // Conditionally pushes file to list - returns true if pushed, false otherwise
  // (e.g. prevents hidden files to be included unless explicitly told so)
  function pushFile(file, query) {
    var name = file.name || file;
    // hidden file?
    if (path.basename(name)[0] === '.') {
      // not explicitly asking for hidden files?
      if (!options.all && !(path.basename(query)[0] === '.' && path.basename(query).length > 1))
        return false;
    }

    if (common.platform === 'win')
      name = name.replace(/\\/g, '/');

    if (file.name) {
      file.name = name;
    } else {
      file = name;
    }
    list.push(file);
    return true;
  }

  paths.forEach(function(p) {
    if (fs.existsSync(p)) {
      var stats = ls_stat(p);
      // Simple file?
      if (stats.isFile()) {
        if (options.long) {
          pushFile(stats, p);
        } else {
          pushFile(p, p);
        }
        return; // continue
      }

      // Simple dir?
      if (options.directory) {
        pushFile(p, p);
        return;
      } else if (stats.isDirectory()) {
        // Iterate over p contents
        fs.readdirSync(p).forEach(function(file) {
          var orig_file = file;
          if (options.long)
            file = ls_stat(path.join(p, file));
          if (!pushFile(file, p))
            return;

          // Recursive?
          if (options.recursive) {
            var oldDir = _pwd();
            _cd('', p);
            if (fs.statSync(orig_file).isDirectory())
              list = list.concat(_ls('-R'+(options.all?'A':''), orig_file+'/*'));
            _cd('', oldDir);
          }
        });
        return; // continue
      }
    }

    // p does not exist - possible wildcard present

    var basename = path.basename(p);
    var dirname = path.dirname(p);
    // Wildcard present on an existing dir? (e.g. '/tmp/*.js')
    if (basename.search(/\*/) > -1 && fs.existsSync(dirname) && fs.statSync(dirname).isDirectory) {
      // Escape special regular expression chars
      var regexp = basename.replace(/(\^|\$|\(|\)|<|>|\[|\]|\{|\}|\.|\+|\?)/g, '\\$1');
      // Translates wildcard into regex
      regexp = '^' + regexp.replace(/\*/g, '.*') + '$';
      // Iterate over directory contents
      fs.readdirSync(dirname).forEach(function(file) {
        if (file.match(new RegExp(regexp))) {
          var file_path = path.join(dirname,  file);
          file_path = options.long ? ls_stat(file_path) : file_path;
          if (file_path.name)
            file_path.name = path.normalize(file_path.name);
          else
            file_path = path.normalize(file_path);
          if (!pushFile(file_path, basename))
            return;

          // Recursive?
          if (options.recursive) {
            var pp = dirname + '/' + file;
            if (fs.lstatSync(pp).isDirectory())
              list = list.concat(_ls('-R'+(options.all?'A':''), pp+'/*'));
          } // recursive
        } // if file matches
      }); // forEach
      return;
    }

    common.error('no such file or directory: ' + p, true);
  });

  return list;
}
module.exports = _ls;


function ls_stat(path) {
  var stats = fs.statSync(path);
  // Note: this object will contain more information than .toString() returns
  stats.name = path;
  stats.toString = function() {
    // Return a string resembling unix's `ls -l` format
    return [this.mode, this.nlink, this.uid, this.gid, this.size, this.mtime, this.name].join(' ');
  };
  return stats;
}


/***/ }),
/* 10 */
/***/ (function(module, exports, __webpack_require__) {

var fs = __webpack_require__(2);
var common = __webpack_require__(1);

//@
//@ ### cd([dir])
//@ Changes to directory `dir` for the duration of the script. Changes to home
//@ directory if no argument is supplied.
function _cd(options, dir) {
  if (!dir)
    dir = common.getUserHome();

  if (dir === '-') {
    if (!common.state.previousDir)
      common.error('could not find previous directory');
    else
      dir = common.state.previousDir;
  }

  if (!fs.existsSync(dir))
    common.error('no such file or directory: ' + dir);

  if (!fs.statSync(dir).isDirectory())
    common.error('not a directory: ' + dir);

  common.state.previousDir = process.cwd();
  process.chdir(dir);
}
module.exports = _cd;


/***/ }),
/* 11 */
/***/ (function(module, exports, __webpack_require__) {

var path = __webpack_require__(0);
var common = __webpack_require__(1);

//@
//@ ### pwd()
//@ Returns the current directory.
function _pwd() {
  var pwd = path.resolve(process.cwd());
  return common.ShellString(pwd);
}
module.exports = _pwd;


/***/ }),
/* 12 */
/***/ (function(module, exports, __webpack_require__) {

var common = __webpack_require__(1);
var _cd = __webpack_require__(10);
var path = __webpack_require__(0);

// Pushd/popd/dirs internals
var _dirStack = [];

function _isStackIndex(index) {
  return (/^[\-+]\d+$/).test(index);
}

function _parseStackIndex(index) {
  if (_isStackIndex(index)) {
    if (Math.abs(index) < _dirStack.length + 1) { // +1 for pwd
      return (/^-/).test(index) ? Number(index) - 1 : Number(index);
    } else {
      common.error(index + ': directory stack index out of range');
    }
  } else {
    common.error(index + ': invalid number');
  }
}

function _actualDirStack() {
  return [process.cwd()].concat(_dirStack);
}

//@
//@ ### pushd([options,] [dir | '-N' | '+N'])
//@
//@ Available options:
//@
//@ + `-n`: Suppresses the normal change of directory when adding directories to the stack, so that only the stack is manipulated.
//@
//@ Arguments:
//@
//@ + `dir`: Makes the current working directory be the top of the stack, and then executes the equivalent of `cd dir`.
//@ + `+N`: Brings the Nth directory (counting from the left of the list printed by dirs, starting with zero) to the top of the list by rotating the stack.
//@ + `-N`: Brings the Nth directory (counting from the right of the list printed by dirs, starting with zero) to the top of the list by rotating the stack.
//@
//@ Examples:
//@
//@ ```javascript
//@ // process.cwd() === '/usr'
//@ pushd('/etc'); // Returns /etc /usr
//@ pushd('+1');   // Returns /usr /etc
//@ ```
//@
//@ Save the current directory on the top of the directory stack and then cd to `dir`. With no arguments, pushd exchanges the top two directories. Returns an array of paths in the stack.
function _pushd(options, dir) {
  if (_isStackIndex(options)) {
    dir = options;
    options = '';
  }

  options = common.parseOptions(options, {
    'n' : 'no-cd'
  });

  var dirs = _actualDirStack();

  if (dir === '+0') {
    return dirs; // +0 is a noop
  } else if (!dir) {
    if (dirs.length > 1) {
      dirs = dirs.splice(1, 1).concat(dirs);
    } else {
      return common.error('no other directory');
    }
  } else if (_isStackIndex(dir)) {
    var n = _parseStackIndex(dir);
    dirs = dirs.slice(n).concat(dirs.slice(0, n));
  } else {
    if (options['no-cd']) {
      dirs.splice(1, 0, dir);
    } else {
      dirs.unshift(dir);
    }
  }

  if (options['no-cd']) {
    dirs = dirs.slice(1);
  } else {
    dir = path.resolve(dirs.shift());
    _cd('', dir);
  }

  _dirStack = dirs;
  return _dirs('');
}
exports.pushd = _pushd;

//@
//@ ### popd([options,] ['-N' | '+N'])
//@
//@ Available options:
//@
//@ + `-n`: Suppresses the normal change of directory when removing directories from the stack, so that only the stack is manipulated.
//@
//@ Arguments:
//@
//@ + `+N`: Removes the Nth directory (counting from the left of the list printed by dirs), starting with zero.
//@ + `-N`: Removes the Nth directory (counting from the right of the list printed by dirs), starting with zero.
//@
//@ Examples:
//@
//@ ```javascript
//@ echo(process.cwd()); // '/usr'
//@ pushd('/etc');       // '/etc /usr'
//@ echo(process.cwd()); // '/etc'
//@ popd();              // '/usr'
//@ echo(process.cwd()); // '/usr'
//@ ```
//@
//@ When no arguments are given, popd removes the top directory from the stack and performs a cd to the new top directory. The elements are numbered from 0 starting at the first directory listed with dirs; i.e., popd is equivalent to popd +0. Returns an array of paths in the stack.
function _popd(options, index) {
  if (_isStackIndex(options)) {
    index = options;
    options = '';
  }

  options = common.parseOptions(options, {
    'n' : 'no-cd'
  });

  if (!_dirStack.length) {
    return common.error('directory stack empty');
  }

  index = _parseStackIndex(index || '+0');

  if (options['no-cd'] || index > 0 || _dirStack.length + index === 0) {
    index = index > 0 ? index - 1 : index;
    _dirStack.splice(index, 1);
  } else {
    var dir = path.resolve(_dirStack.shift());
    _cd('', dir);
  }

  return _dirs('');
}
exports.popd = _popd;

//@
//@ ### dirs([options | '+N' | '-N'])
//@
//@ Available options:
//@
//@ + `-c`: Clears the directory stack by deleting all of the elements.
//@
//@ Arguments:
//@
//@ + `+N`: Displays the Nth directory (counting from the left of the list printed by dirs when invoked without options), starting with zero.
//@ + `-N`: Displays the Nth directory (counting from the right of the list printed by dirs when invoked without options), starting with zero.
//@
//@ Display the list of currently remembered directories. Returns an array of paths in the stack, or a single path if +N or -N was specified.
//@
//@ See also: pushd, popd
function _dirs(options, index) {
  if (_isStackIndex(options)) {
    index = options;
    options = '';
  }

  options = common.parseOptions(options, {
    'c' : 'clear'
  });

  if (options['clear']) {
    _dirStack = [];
    return _dirStack;
  }

  var stack = _actualDirStack();

  if (index) {
    index = _parseStackIndex(index);

    if (index < 0) {
      index = stack.length + index;
    }

    common.log(stack[index]);
    return stack[index];
  }

  common.log(stack.join(' '));

  return stack;
}
exports.dirs = _dirs;


/***/ }),
/* 13 */
/***/ (function(module, exports) {

module.exports = __dirname;


/***/ }),
/* 14 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


const fse = __webpack_require__(6);

function fileExistsSync(filePath) {
  try {
    const stats = fse.lstatSync(filePath);
    return stats.isFile();
  } catch (e) {
    return false;
  }
}

module.exports = fileExistsSync;


/***/ }),
/* 15 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


const fse = __webpack_require__(6);
const parse = __webpack_require__(24);

function readFileSync(filePath) {
  const contents = fse.readFileSync(filePath);
  return parse(filePath, contents);
}

module.exports = readFileSync;


/***/ }),
/* 16 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


/* Config util */
const p = __webpack_require__(0);
const os = __webpack_require__(4);
const _ = __webpack_require__(5);
const writeFileAtomic = __webpack_require__(68);
const fileExistsSync = __webpack_require__(14);
const readFileSync = __webpack_require__(15);
const initialSetup = __webpack_require__(69);

const serverlessrcPath = p.join(os.homedir(), '.serverlessrc');

function createConfig() {
  // set default config options
  const config = {
    userId: null, // currentUserId
    frameworkId: initialSetup.generateFrameworkId(),
    trackingDisabled: initialSetup.configureTrack(), // default false
    meta: {
      created_at: Math.round(+new Date() / 1000), // config file creation date
      updated_at: null,  // config file updated date
    },
  };

  // remove legacy files
  initialSetup.removeLegacyFrameworkIdFiles();

  // save new config
  writeFileAtomic.sync(serverlessrcPath, JSON.stringify(config, null, 2));
  return JSON.parse(readFileSync(serverlessrcPath));
}

// check for global .serverlessrc file
function hasConfigFile() {
  return fileExistsSync(serverlessrcPath);
}

// get global + local .serverlessrc config
// 'rc' module merges local config over global
function getConfig() {
  if (!hasConfigFile()) {
    // create config first
    createConfig();
  }
  // then return config merged via rc module
  return __webpack_require__(73)('serverless'); // eslint-disable-line
}

function getGlobalConfig() {
  if (hasConfigFile()) {
    return JSON.parse(readFileSync(serverlessrcPath));
  }
  // else create and return it
  return createConfig();
}

// set global .serverlessrc config value.
function set(key, value) {
  let config = getGlobalConfig();
  if (key && typeof key === 'string' && typeof value !== 'undefined') {
    config = _.set(config, key, value);
  } else if (_.isObject(key)) {
    config = _.merge(config, key);
  } else if (typeof value !== 'undefined') {
    config = _.merge(config, value);
  }
  // update config meta
  config.meta = config.meta || {};
  config.meta.updated_at = Math.round(+new Date() / 1000);
  // write to .serverlessrc file
  writeFileAtomic.sync(serverlessrcPath, JSON.stringify(config, null, 2));
  return config;
}

function deleteValue(key) {
  let config = getGlobalConfig();
  if (key && typeof key === 'string') {
    config = _.omit(config, [key]);
  } else if (key && _.isArray(key)) {
    config = _.omit(config, key);
  }
  // write to .serverlessrc file
  writeFileAtomic.sync(serverlessrcPath, JSON.stringify(config, null, 2));
  return config;
}

/* Get config value with object path */
function get(path) {
  const config = getConfig();
  return _.get(config, path);
}

module.exports = {
  set: set, // eslint-disable-line
  get: get, // eslint-disable-line
  delete: deleteValue,
  getConfig: getConfig, // eslint-disable-line
  getGlobalConfig: getGlobalConfig, // eslint-disable-line
  CONFIG_FILE_PATH: serverlessrcPath,
};


/***/ }),
/* 17 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";

const chalk = __webpack_require__(19);
const version = __webpack_require__(7).version;
// raven implementation examples https://www.npmjs.com/browse/depended/raven
const errorReporter = __webpack_require__(75).raven;

const consoleLog = (message) => {
  console.log(message); // eslint-disable-line no-console
};

const writeMessage = (messageType, message) => {
  let line = '';
  while (line.length < 56 - messageType.length) {
    line = `${line}-`;
  }

  consoleLog(' ');
  consoleLog(chalk.yellow(` ${messageType} ${line}`));
  consoleLog(' ');

  if (message) {
    consoleLog(chalk.white(`  ${message}`));
  }

  consoleLog(' ');
};

module.exports.ServerlessError = class ServerlessError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = this.constructor.name;
    this.message = message;
    this.statusCode = statusCode;
    Error.captureStackTrace(this, this.constructor);
  }
};

// Deprecated - use ServerlessError instead
module.exports.SError = module.exports.ServerlessError;

module.exports.logError = (e) => {
  try {
    const errorType = e.name.replace(/([A-Z])/g, ' $1');

    writeMessage(errorType, e.message);

    if (e.name !== 'ServerlessError') {
      const errorMessage = [
        '    ',
        ' For debugging logs, run again after setting the',
        ' "SLS_DEBUG=*" environment variable.',
      ].join('');
      consoleLog(chalk.red(errorMessage));
      consoleLog(' ');
    }

    if (process.env.SLS_DEBUG) {
      consoleLog(chalk.yellow('  Stack Trace --------------------------------------------'));
      consoleLog(' ');
      consoleLog(e.stack);
      consoleLog(' ');
    }

    const platform = chalk.white(process.platform);
    const nodeVersion = chalk.white(process.version.replace(/^[v|V]/, ''));
    const slsVersion = chalk.white(version);

    consoleLog(chalk.yellow('  Get Support --------------------------------------------'));
    consoleLog(`${chalk.yellow('     Docs:          ')}${chalk.white('docs.serverless.com')}`);
    consoleLog(`${chalk.yellow('     Bugs:          ')}${chalk
      .white('github.com/serverless/serverless/issues')}`);
    consoleLog(`${chalk.yellow('     Forums:        ')}${chalk.white('forum.serverless.com')}`);
    consoleLog(`${chalk.yellow('     Chat:          ')}${chalk
            .white('gitter.im/serverless/serverless')}`);

    consoleLog(' ');
    consoleLog(chalk.yellow('  Your Environment Information -----------------------------'));
    consoleLog(chalk.yellow(`     OS:                     ${platform}`));
    consoleLog(chalk.yellow(`     Node Version:           ${nodeVersion}`));
    consoleLog(chalk.yellow(`     Serverless Version:     ${slsVersion}`));
    consoleLog(' ');

    // Exit early for users who have opted out of tracking
    if (!errorReporter.installed) {
      // process.exit(1) for CI systems to correctly fail
      process.exit(1);
    }
    // report error to sentry.
    errorReporter.captureException(e, (sendErr, eventId) => { // eslint-disable-line
      // process.exit(1) for CI systems to correctly fail
      process.exit(1);
    });
  } catch (errorHandlingError) {
    throw new Error(e);
  }
};

module.exports.logWarning = (message) => {
  writeMessage('Serverless Warning', message);
};


/***/ }),
/* 18 */
/***/ (function(module, exports, __webpack_require__) {

var common = __webpack_require__(1);
var os = __webpack_require__(4);
var fs = __webpack_require__(2);

// Returns false if 'dir' is not a writeable directory, 'dir' otherwise
function writeableDir(dir) {
  if (!dir || !fs.existsSync(dir))
    return false;

  if (!fs.statSync(dir).isDirectory())
    return false;

  var testFile = dir+'/'+common.randomFileName();
  try {
    fs.writeFileSync(testFile, ' ');
    common.unlinkSync(testFile);
    return dir;
  } catch (e) {
    return false;
  }
}


//@
//@ ### tempdir()
//@
//@ Examples:
//@
//@ ```javascript
//@ var tmp = tempdir(); // "/tmp" for most *nix platforms
//@ ```
//@
//@ Searches and returns string containing a writeable, platform-dependent temporary directory.
//@ Follows Python's [tempfile algorithm](http://docs.python.org/library/tempfile.html#tempfile.tempdir).
function _tempDir() {
  var state = common.state;
  if (state.tempDir)
    return state.tempDir; // from cache

  state.tempDir = writeableDir(os.tmpdir && os.tmpdir()) || // node 0.10+
                  writeableDir(os.tmpDir && os.tmpDir()) || // node 0.8+
                  writeableDir(process.env['TMPDIR']) ||
                  writeableDir(process.env['TEMP']) ||
                  writeableDir(process.env['TMP']) ||
                  writeableDir(process.env['Wimp$ScrapDir']) || // RiscOS
                  writeableDir('C:\\TEMP') || // Windows
                  writeableDir('C:\\TMP') || // Windows
                  writeableDir('\\TEMP') || // Windows
                  writeableDir('\\TMP') || // Windows
                  writeableDir('/tmp') ||
                  writeableDir('/var/tmp') ||
                  writeableDir('/usr/tmp') ||
                  writeableDir('.'); // last resort

  return state.tempDir;
}
module.exports = _tempDir;


/***/ }),
/* 19 */
/***/ (function(module, exports) {

module.exports = require("chalk");

/***/ }),
/* 20 */
/***/ (function(module, exports) {

module.exports = require("fs-extra");

/***/ }),
/* 21 */
/***/ (function(module, exports) {

module.exports = require("crypto");

/***/ }),
/* 22 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


const fse = __webpack_require__(6);

function fileExists(filePath) {
  return fse.lstatAsync(filePath)
    .then((stats) => stats.isFile())
    .catch(() => false);
}

module.exports = fileExists;


/***/ }),
/* 23 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


const fse = __webpack_require__(6);
const parse = __webpack_require__(24);

function readFile(filePath) {
  return fse.readFileAsync(filePath, 'utf8')
    .then((contents) => parse(filePath, contents));
}

module.exports = readFile;


/***/ }),
/* 24 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


const YAML = __webpack_require__(8);


function parse(filePath, contents) {
  // Auto-parse JSON
  if (filePath.endsWith('.json')) {
    return JSON.parse(contents);
  } else if (filePath.endsWith('.yml') || filePath.endsWith('.yaml')) {
    return YAML.load(contents.toString(), { filename: filePath });
  }
  return contents.toString().trim();
}

module.exports = parse;


/***/ }),
/* 25 */
/***/ (function(module, exports) {

function webpackEmptyContext(req) {
	throw new Error("Cannot find module '" + req + "'.");
}
webpackEmptyContext.keys = function() { return []; };
webpackEmptyContext.resolve = webpackEmptyContext;
module.exports = webpackEmptyContext;
webpackEmptyContext.id = 25;

/***/ }),
/* 26 */
/***/ (function(module, exports) {

module.exports = require("ci-info");

/***/ }),
/* 27 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


__webpack_require__(28);

const path = __webpack_require__(0);
const BbPromise = __webpack_require__(3);
const os = __webpack_require__(4);
const CLI = __webpack_require__(50);
const Config = __webpack_require__(52);
const YamlParser = __webpack_require__(53);
const PluginManager = __webpack_require__(55);
const Utils = __webpack_require__(61);
const Service = __webpack_require__(74);
const Variables = __webpack_require__(80);
const ServerlessError = __webpack_require__(17).ServerlessError;
const Version = __webpack_require__(7).version;

class Serverless {
  constructor(config) {
    let configObject = config;
    configObject = configObject || {};

    this.providers = {};

    this.version = Version;

    this.yamlParser = new YamlParser(this);
    this.utils = new Utils(this);
    this.service = new Service(this);
    this.variables = new Variables(this);
    this.pluginManager = new PluginManager(this);

    // use the servicePath from the options or try to find it in the CWD
    configObject.servicePath = configObject.servicePath || this.utils.findServicePath();

    this.config = new Config(this, configObject);

    this.classes = {};
    this.classes.CLI = CLI;
    this.classes.YamlParser = YamlParser;
    this.classes.Utils = Utils;
    this.classes.Service = Service;
    this.classes.Variables = Variables;
    this.classes.Error = ServerlessError;
    this.classes.PluginManager = PluginManager;

    this.serverlessDirPath = path.join(os.homedir(), '.serverless');
  }

  init() {
    // create a new CLI instance
    this.cli = new CLI(this);

    // get an array of commands and options that should be processed
    this.processedInput = this.cli.processInput();

    // set the options and commands which were processed by the CLI
    this.pluginManager.setCliOptions(this.processedInput.options);
    this.pluginManager.setCliCommands(this.processedInput.commands);

    return this.service.load(this.processedInput.options)
      .then(() => {
        // load all plugins
        this.pluginManager.loadAllPlugins(this.service.plugins);

        // give the CLI the plugins and commands so that it can print out
        // information such as options when the user enters --help
        this.cli.setLoadedPlugins(this.pluginManager.getPlugins());
        this.cli.setLoadedCommands(this.pluginManager.getCommands());
        return this.pluginManager.updateAutocompleteCacheFile();
      });
  }

  run() {
    this.utils.logStat(this).catch(() => BbPromise.resolve());

    if (this.cli.displayHelp(this.processedInput)) {
      return BbPromise.resolve();
    }

    // make sure the command exists before doing anything else
    this.pluginManager.validateCommand(this.processedInput.commands);

    // populate variables after --help, otherwise help may fail to print
    // (https://github.com/serverless/serverless/issues/2041)
    return this.variables.populateService(this.pluginManager.cliOptions).then(() => {
      // populate function names after variables are loaded in case functions were externalized
      // (https://github.com/serverless/serverless/issues/2997)
      this.service.setFunctionNames(this.processedInput.options);

      // merge custom resources after variables have been populated
      // (https://github.com/serverless/serverless/issues/3511)
      this.service.mergeResourceArrays();

      // validate the service configuration, now that variables are loaded
      this.service.validate();

      // trigger the plugin lifecycle when there's something which should be processed
      return this.pluginManager.run(this.processedInput.commands);
    });
  }

  setProvider(name, provider) {
    this.providers[name] = provider;
  }

  getProvider(name) {
    return this.providers[name] ? this.providers[name] : false;
  }

  getVersion() {
    return this.version;
  }
}

module.exports = Serverless;


/***/ }),
/* 28 */
/***/ (function(module, exports, __webpack_require__) {

var shell = __webpack_require__(29);
for (var cmd in shell)
  global[cmd] = shell[cmd];


/***/ }),
/* 29 */
/***/ (function(module, exports, __webpack_require__) {

//
// ShellJS
// Unix shell commands on top of Node's API
//
// Copyright (c) 2012 Artur Adib
// http://github.com/arturadib/shelljs
//

var common = __webpack_require__(1);


//@
//@ All commands run synchronously, unless otherwise stated.
//@

//@include ./src/cd
var _cd = __webpack_require__(10);
exports.cd = common.wrap('cd', _cd);

//@include ./src/pwd
var _pwd = __webpack_require__(11);
exports.pwd = common.wrap('pwd', _pwd);

//@include ./src/ls
var _ls = __webpack_require__(9);
exports.ls = common.wrap('ls', _ls);

//@include ./src/find
var _find = __webpack_require__(30);
exports.find = common.wrap('find', _find);

//@include ./src/cp
var _cp = __webpack_require__(31);
exports.cp = common.wrap('cp', _cp);

//@include ./src/rm
var _rm = __webpack_require__(32);
exports.rm = common.wrap('rm', _rm);

//@include ./src/mv
var _mv = __webpack_require__(33);
exports.mv = common.wrap('mv', _mv);

//@include ./src/mkdir
var _mkdir = __webpack_require__(34);
exports.mkdir = common.wrap('mkdir', _mkdir);

//@include ./src/test
var _test = __webpack_require__(35);
exports.test = common.wrap('test', _test);

//@include ./src/cat
var _cat = __webpack_require__(36);
exports.cat = common.wrap('cat', _cat);

//@include ./src/to
var _to = __webpack_require__(37);
String.prototype.to = common.wrap('to', _to);

//@include ./src/toEnd
var _toEnd = __webpack_require__(38);
String.prototype.toEnd = common.wrap('toEnd', _toEnd);

//@include ./src/sed
var _sed = __webpack_require__(39);
exports.sed = common.wrap('sed', _sed);

//@include ./src/grep
var _grep = __webpack_require__(40);
exports.grep = common.wrap('grep', _grep);

//@include ./src/which
var _which = __webpack_require__(41);
exports.which = common.wrap('which', _which);

//@include ./src/echo
var _echo = __webpack_require__(42);
exports.echo = _echo; // don't common.wrap() as it could parse '-options'

//@include ./src/dirs
var _dirs = __webpack_require__(12).dirs;
exports.dirs = common.wrap("dirs", _dirs);
var _pushd = __webpack_require__(12).pushd;
exports.pushd = common.wrap('pushd', _pushd);
var _popd = __webpack_require__(12).popd;
exports.popd = common.wrap("popd", _popd);

//@include ./src/ln
var _ln = __webpack_require__(43);
exports.ln = common.wrap('ln', _ln);

//@
//@ ### exit(code)
//@ Exits the current process with the given exit code.
exports.exit = process.exit;

//@
//@ ### env['VAR_NAME']
//@ Object containing environment variables (both getter and setter). Shortcut to process.env.
exports.env = process.env;

//@include ./src/exec
var _exec = __webpack_require__(44);
exports.exec = common.wrap('exec', _exec, {notUnix:true});

//@include ./src/chmod
var _chmod = __webpack_require__(46);
exports.chmod = common.wrap('chmod', _chmod);

//@include ./src/touch
var _touch = __webpack_require__(47);
exports.touch = common.wrap('touch', _touch);

//@include ./src/set
var _set = __webpack_require__(48);
exports.set = common.wrap('set', _set);


//@
//@ ## Non-Unix commands
//@

//@include ./src/tempdir
var _tempDir = __webpack_require__(18);
exports.tempdir = common.wrap('tempdir', _tempDir);


//@include ./src/error
var _error = __webpack_require__(49);
exports.error = _error;



//@
//@ ## Configuration
//@

exports.config = common.config;

//@
//@ ### config.silent
//@ Example:
//@
//@ ```javascript
//@ var sh = require('shelljs');
//@ var silentState = sh.config.silent; // save old silent state
//@ sh.config.silent = true;
//@ /* ... */
//@ sh.config.silent = silentState; // restore old silent state
//@ ```
//@
//@ Suppresses all command output if `true`, except for `echo()` calls.
//@ Default is `false`.

//@
//@ ### config.fatal
//@ Example:
//@
//@ ```javascript
//@ require('shelljs/global');
//@ config.fatal = true; // or set('-e');
//@ cp('this_file_does_not_exist', '/dev/null'); // dies here
//@ /* more commands... */
//@ ```
//@
//@ If `true` the script will die on errors. Default is `false`. This is
//@ analogous to Bash's `set -e`

//@
//@ ### config.verbose
//@ Example:
//@
//@ ```javascript
//@ config.verbose = true; // or set('-v');
//@ cd('dir/');
//@ ls('subdir/');
//@ ```
//@
//@ Will print each command as follows:
//@
//@ ```
//@ cd dir/
//@ ls subdir/
//@ ```


/***/ }),
/* 30 */
/***/ (function(module, exports, __webpack_require__) {

var fs = __webpack_require__(2);
var common = __webpack_require__(1);
var _ls = __webpack_require__(9);

//@
//@ ### find(path [, path ...])
//@ ### find(path_array)
//@ Examples:
//@
//@ ```javascript
//@ find('src', 'lib');
//@ find(['src', 'lib']); // same as above
//@ find('.').filter(function(file) { return file.match(/\.js$/); });
//@ ```
//@
//@ Returns array of all files (however deep) in the given paths.
//@
//@ The main difference from `ls('-R', path)` is that the resulting file names
//@ include the base directories, e.g. `lib/resources/file1` instead of just `file1`.
function _find(options, paths) {
  if (!paths)
    common.error('no path specified');
  else if (typeof paths === 'object')
    paths = paths; // assume array
  else if (typeof paths === 'string')
    paths = [].slice.call(arguments, 1);

  var list = [];

  function pushFile(file) {
    if (common.platform === 'win')
      file = file.replace(/\\/g, '/');
    list.push(file);
  }

  // why not simply do ls('-R', paths)? because the output wouldn't give the base dirs
  // to get the base dir in the output, we need instead ls('-R', 'dir/*') for every directory

  paths.forEach(function(file) {
    pushFile(file);

    if (fs.statSync(file).isDirectory()) {
      _ls('-RA', file+'/*').forEach(function(subfile) {
        pushFile(subfile);
      });
    }
  });

  return list;
}
module.exports = _find;


/***/ }),
/* 31 */
/***/ (function(module, exports, __webpack_require__) {

var fs = __webpack_require__(2);
var path = __webpack_require__(0);
var common = __webpack_require__(1);
var os = __webpack_require__(4);

// Buffered file copy, synchronous
// (Using readFileSync() + writeFileSync() could easily cause a memory overflow
//  with large files)
function copyFileSync(srcFile, destFile) {
  if (!fs.existsSync(srcFile))
    common.error('copyFileSync: no such file or directory: ' + srcFile);

  var BUF_LENGTH = 64*1024,
      buf = new Buffer(BUF_LENGTH),
      bytesRead = BUF_LENGTH,
      pos = 0,
      fdr = null,
      fdw = null;

  try {
    fdr = fs.openSync(srcFile, 'r');
  } catch(e) {
    common.error('copyFileSync: could not read src file ('+srcFile+')');
  }

  try {
    fdw = fs.openSync(destFile, 'w');
  } catch(e) {
    common.error('copyFileSync: could not write to dest file (code='+e.code+'):'+destFile);
  }

  while (bytesRead === BUF_LENGTH) {
    bytesRead = fs.readSync(fdr, buf, 0, BUF_LENGTH, pos);
    fs.writeSync(fdw, buf, 0, bytesRead);
    pos += bytesRead;
  }

  fs.closeSync(fdr);
  fs.closeSync(fdw);

  fs.chmodSync(destFile, fs.statSync(srcFile).mode);
}

// Recursively copies 'sourceDir' into 'destDir'
// Adapted from https://github.com/ryanmcgrath/wrench-js
//
// Copyright (c) 2010 Ryan McGrath
// Copyright (c) 2012 Artur Adib
//
// Licensed under the MIT License
// http://www.opensource.org/licenses/mit-license.php
function cpdirSyncRecursive(sourceDir, destDir, opts) {
  if (!opts) opts = {};

  /* Create the directory where all our junk is moving to; read the mode of the source directory and mirror it */
  var checkDir = fs.statSync(sourceDir);
  try {
    fs.mkdirSync(destDir, checkDir.mode);
  } catch (e) {
    //if the directory already exists, that's okay
    if (e.code !== 'EEXIST') throw e;
  }

  var files = fs.readdirSync(sourceDir);

  for (var i = 0; i < files.length; i++) {
    var srcFile = sourceDir + "/" + files[i];
    var destFile = destDir + "/" + files[i];
    var srcFileStat = fs.lstatSync(srcFile);

    if (srcFileStat.isDirectory()) {
      /* recursion this thing right on back. */
      cpdirSyncRecursive(srcFile, destFile, opts);
    } else if (srcFileStat.isSymbolicLink()) {
      var symlinkFull = fs.readlinkSync(srcFile);
      fs.symlinkSync(symlinkFull, destFile, os.platform() === "win32" ? "junction" : null);
    } else {
      /* At this point, we've hit a file actually worth copying... so copy it on over. */
      if (fs.existsSync(destFile) && opts.no_force) {
        common.log('skipping existing file: ' + files[i]);
      } else {
        copyFileSync(srcFile, destFile);
      }
    }

  } // for files
} // cpdirSyncRecursive


//@
//@ ### cp([options,] source [, source ...], dest)
//@ ### cp([options,] source_array, dest)
//@ Available options:
//@
//@ + `-f`: force (default behavior)
//@ + `-n`: no-clobber
//@ + `-r, -R`: recursive
//@
//@ Examples:
//@
//@ ```javascript
//@ cp('file1', 'dir1');
//@ cp('-Rf', '/tmp/*', '/usr/local/*', '/home/tmp');
//@ cp('-Rf', ['/tmp/*', '/usr/local/*'], '/home/tmp'); // same as above
//@ ```
//@
//@ Copies files. The wildcard `*` is accepted.
function _cp(options, sources, dest) {
  options = common.parseOptions(options, {
    'f': '!no_force',
    'n': 'no_force',
    'R': 'recursive',
    'r': 'recursive'
  });

  // Get sources, dest
  if (arguments.length < 3) {
    common.error('missing <source> and/or <dest>');
  } else if (arguments.length > 3) {
    sources = [].slice.call(arguments, 1, arguments.length - 1);
    dest = arguments[arguments.length - 1];
  } else if (typeof sources === 'string') {
    sources = [sources];
  } else if ('length' in sources) {
    sources = sources; // no-op for array
  } else {
    common.error('invalid arguments');
  }

  var exists = fs.existsSync(dest),
      stats = exists && fs.statSync(dest);

  // Dest is not existing dir, but multiple sources given
  if ((!exists || !stats.isDirectory()) && sources.length > 1)
    common.error('dest is not a directory (too many sources)');

  // Dest is an existing file, but no -f given
  if (exists && stats.isFile() && options.no_force)
    common.error('dest file already exists: ' + dest);

  if (options.recursive) {
    // Recursive allows the shortcut syntax "sourcedir/" for "sourcedir/*"
    // (see Github issue #15)
    sources.forEach(function(src, i) {
      if (src[src.length - 1] === '/') {
        sources[i] += '*';
      // If src is a directory and dest doesn't exist, 'cp -r src dest' should copy src/* into dest
      } else if (fs.statSync(src).isDirectory() && !exists) {
        sources[i] += '/*';
      }
    });

    // Create dest
    try {
      fs.mkdirSync(dest, parseInt('0777', 8));
    } catch (e) {
      // like Unix's cp, keep going even if we can't create dest dir
    }
  }

  sources = common.expand(sources);

  sources.forEach(function(src) {
    if (!fs.existsSync(src)) {
      common.error('no such file or directory: '+src, true);
      return; // skip file
    }

    // If here, src exists
    if (fs.statSync(src).isDirectory()) {
      if (!options.recursive) {
        // Non-Recursive
        common.log(src + ' is a directory (not copied)');
      } else {
        // Recursive
        // 'cp /a/source dest' should create 'source' in 'dest'
        var newDest = path.join(dest, path.basename(src)),
            checkDir = fs.statSync(src);
        try {
          fs.mkdirSync(newDest, checkDir.mode);
        } catch (e) {
          //if the directory already exists, that's okay
          if (e.code !== 'EEXIST') {
            common.error('dest file no such file or directory: ' + newDest, true);
            throw e;
          }
        }

        cpdirSyncRecursive(src, newDest, {no_force: options.no_force});
      }
      return; // done with dir
    }

    // If here, src is a file

    // When copying to '/path/dir':
    //    thisDest = '/path/dir/file1'
    var thisDest = dest;
    if (fs.existsSync(dest) && fs.statSync(dest).isDirectory())
      thisDest = path.normalize(dest + '/' + path.basename(src));

    if (fs.existsSync(thisDest) && options.no_force) {
      common.error('dest file already exists: ' + thisDest, true);
      return; // skip file
    }

    copyFileSync(src, thisDest);
  }); // forEach(src)
}
module.exports = _cp;


/***/ }),
/* 32 */
/***/ (function(module, exports, __webpack_require__) {

var common = __webpack_require__(1);
var fs = __webpack_require__(2);

// Recursively removes 'dir'
// Adapted from https://github.com/ryanmcgrath/wrench-js
//
// Copyright (c) 2010 Ryan McGrath
// Copyright (c) 2012 Artur Adib
//
// Licensed under the MIT License
// http://www.opensource.org/licenses/mit-license.php
function rmdirSyncRecursive(dir, force) {
  var files;

  files = fs.readdirSync(dir);

  // Loop through and delete everything in the sub-tree after checking it
  for(var i = 0; i < files.length; i++) {
    var file = dir + "/" + files[i],
        currFile = fs.lstatSync(file);

    if(currFile.isDirectory()) { // Recursive function back to the beginning
      rmdirSyncRecursive(file, force);
    }

    else if(currFile.isSymbolicLink()) { // Unlink symlinks
      if (force || isWriteable(file)) {
        try {
          common.unlinkSync(file);
        } catch (e) {
          common.error('could not remove file (code '+e.code+'): ' + file, true);
        }
      }
    }

    else // Assume it's a file - perhaps a try/catch belongs here?
      if (force || isWriteable(file)) {
        try {
          common.unlinkSync(file);
        } catch (e) {
          common.error('could not remove file (code '+e.code+'): ' + file, true);
        }
      }
  }

  // Now that we know everything in the sub-tree has been deleted, we can delete the main directory.
  // Huzzah for the shopkeep.

  var result;
  try {
    // Retry on windows, sometimes it takes a little time before all the files in the directory are gone
    var start = Date.now();
    while (true) {
      try {
        result = fs.rmdirSync(dir);
        if (fs.existsSync(dir)) throw { code: "EAGAIN" };
        break;
      } catch(er) {
        // In addition to error codes, also check if the directory still exists and loop again if true
        if (process.platform === "win32" && (er.code === "ENOTEMPTY" || er.code === "EBUSY" || er.code === "EPERM" || er.code === "EAGAIN")) {
          if (Date.now() - start > 1000) throw er;
        } else if (er.code === "ENOENT") {
          // Directory did not exist, deletion was successful
          break;
        } else {
          throw er;
        }
      }
    }
  } catch(e) {
    common.error('could not remove directory (code '+e.code+'): ' + dir, true);
  }

  return result;
} // rmdirSyncRecursive

// Hack to determine if file has write permissions for current user
// Avoids having to check user, group, etc, but it's probably slow
function isWriteable(file) {
  var writePermission = true;
  try {
    var __fd = fs.openSync(file, 'a');
    fs.closeSync(__fd);
  } catch(e) {
    writePermission = false;
  }

  return writePermission;
}

//@
//@ ### rm([options,] file [, file ...])
//@ ### rm([options,] file_array)
//@ Available options:
//@
//@ + `-f`: force
//@ + `-r, -R`: recursive
//@
//@ Examples:
//@
//@ ```javascript
//@ rm('-rf', '/tmp/*');
//@ rm('some_file.txt', 'another_file.txt');
//@ rm(['some_file.txt', 'another_file.txt']); // same as above
//@ ```
//@
//@ Removes files. The wildcard `*` is accepted.
function _rm(options, files) {
  options = common.parseOptions(options, {
    'f': 'force',
    'r': 'recursive',
    'R': 'recursive'
  });
  if (!files)
    common.error('no paths given');

  if (typeof files === 'string')
    files = [].slice.call(arguments, 1);
  // if it's array leave it as it is

  files = common.expand(files);

  files.forEach(function(file) {
    if (!fs.existsSync(file)) {
      // Path does not exist, no force flag given
      if (!options.force)
        common.error('no such file or directory: '+file, true);

      return; // skip file
    }

    // If here, path exists

    var stats = fs.lstatSync(file);
    if (stats.isFile() || stats.isSymbolicLink()) {

      // Do not check for file writing permissions
      if (options.force) {
        common.unlinkSync(file);
        return;
      }

      if (isWriteable(file))
        common.unlinkSync(file);
      else
        common.error('permission denied: '+file, true);

      return;
    } // simple file

    // Path is an existing directory, but no -r flag given
    if (stats.isDirectory() && !options.recursive) {
      common.error('path is a directory', true);
      return; // skip path
    }

    // Recursively remove existing directory
    if (stats.isDirectory() && options.recursive) {
      rmdirSyncRecursive(file, options.force);
    }
  }); // forEach(file)
} // rm
module.exports = _rm;


/***/ }),
/* 33 */
/***/ (function(module, exports, __webpack_require__) {

var fs = __webpack_require__(2);
var path = __webpack_require__(0);
var common = __webpack_require__(1);

//@
//@ ### mv([options ,] source [, source ...], dest')
//@ ### mv([options ,] source_array, dest')
//@ Available options:
//@
//@ + `-f`: force (default behavior)
//@ + `-n`: no-clobber
//@
//@ Examples:
//@
//@ ```javascript
//@ mv('-n', 'file', 'dir/');
//@ mv('file1', 'file2', 'dir/');
//@ mv(['file1', 'file2'], 'dir/'); // same as above
//@ ```
//@
//@ Moves files. The wildcard `*` is accepted.
function _mv(options, sources, dest) {
  options = common.parseOptions(options, {
    'f': '!no_force',
    'n': 'no_force'
  });

  // Get sources, dest
  if (arguments.length < 3) {
    common.error('missing <source> and/or <dest>');
  } else if (arguments.length > 3) {
    sources = [].slice.call(arguments, 1, arguments.length - 1);
    dest = arguments[arguments.length - 1];
  } else if (typeof sources === 'string') {
    sources = [sources];
  } else if ('length' in sources) {
    sources = sources; // no-op for array
  } else {
    common.error('invalid arguments');
  }

  sources = common.expand(sources);

  var exists = fs.existsSync(dest),
      stats = exists && fs.statSync(dest);

  // Dest is not existing dir, but multiple sources given
  if ((!exists || !stats.isDirectory()) && sources.length > 1)
    common.error('dest is not a directory (too many sources)');

  // Dest is an existing file, but no -f given
  if (exists && stats.isFile() && options.no_force)
    common.error('dest file already exists: ' + dest);

  sources.forEach(function(src) {
    if (!fs.existsSync(src)) {
      common.error('no such file or directory: '+src, true);
      return; // skip file
    }

    // If here, src exists

    // When copying to '/path/dir':
    //    thisDest = '/path/dir/file1'
    var thisDest = dest;
    if (fs.existsSync(dest) && fs.statSync(dest).isDirectory())
      thisDest = path.normalize(dest + '/' + path.basename(src));

    if (fs.existsSync(thisDest) && options.no_force) {
      common.error('dest file already exists: ' + thisDest, true);
      return; // skip file
    }

    if (path.resolve(src) === path.dirname(path.resolve(thisDest))) {
      common.error('cannot move to self: '+src, true);
      return; // skip file
    }

    fs.renameSync(src, thisDest);
  }); // forEach(src)
} // mv
module.exports = _mv;


/***/ }),
/* 34 */
/***/ (function(module, exports, __webpack_require__) {

var common = __webpack_require__(1);
var fs = __webpack_require__(2);
var path = __webpack_require__(0);

// Recursively creates 'dir'
function mkdirSyncRecursive(dir) {
  var baseDir = path.dirname(dir);

  // Base dir exists, no recursion necessary
  if (fs.existsSync(baseDir)) {
    fs.mkdirSync(dir, parseInt('0777', 8));
    return;
  }

  // Base dir does not exist, go recursive
  mkdirSyncRecursive(baseDir);

  // Base dir created, can create dir
  fs.mkdirSync(dir, parseInt('0777', 8));
}

//@
//@ ### mkdir([options,] dir [, dir ...])
//@ ### mkdir([options,] dir_array)
//@ Available options:
//@
//@ + `-p`: full path (will create intermediate dirs if necessary)
//@
//@ Examples:
//@
//@ ```javascript
//@ mkdir('-p', '/tmp/a/b/c/d', '/tmp/e/f/g');
//@ mkdir('-p', ['/tmp/a/b/c/d', '/tmp/e/f/g']); // same as above
//@ ```
//@
//@ Creates directories.
function _mkdir(options, dirs) {
  options = common.parseOptions(options, {
    'p': 'fullpath'
  });
  if (!dirs)
    common.error('no paths given');

  if (typeof dirs === 'string')
    dirs = [].slice.call(arguments, 1);
  // if it's array leave it as it is

  dirs.forEach(function(dir) {
    if (fs.existsSync(dir)) {
      if (!options.fullpath)
          common.error('path already exists: ' + dir, true);
      return; // skip dir
    }

    // Base dir does not exist, and no -p option given
    var baseDir = path.dirname(dir);
    if (!fs.existsSync(baseDir) && !options.fullpath) {
      common.error('no such file or directory: ' + baseDir, true);
      return; // skip dir
    }

    if (options.fullpath)
      mkdirSyncRecursive(dir);
    else
      fs.mkdirSync(dir, parseInt('0777', 8));
  });
} // mkdir
module.exports = _mkdir;


/***/ }),
/* 35 */
/***/ (function(module, exports, __webpack_require__) {

var common = __webpack_require__(1);
var fs = __webpack_require__(2);

//@
//@ ### test(expression)
//@ Available expression primaries:
//@
//@ + `'-b', 'path'`: true if path is a block device
//@ + `'-c', 'path'`: true if path is a character device
//@ + `'-d', 'path'`: true if path is a directory
//@ + `'-e', 'path'`: true if path exists
//@ + `'-f', 'path'`: true if path is a regular file
//@ + `'-L', 'path'`: true if path is a symbolic link
//@ + `'-p', 'path'`: true if path is a pipe (FIFO)
//@ + `'-S', 'path'`: true if path is a socket
//@
//@ Examples:
//@
//@ ```javascript
//@ if (test('-d', path)) { /* do something with dir */ };
//@ if (!test('-f', path)) continue; // skip if it's a regular file
//@ ```
//@
//@ Evaluates expression using the available primaries and returns corresponding value.
function _test(options, path) {
  if (!path)
    common.error('no path given');

  // hack - only works with unary primaries
  options = common.parseOptions(options, {
    'b': 'block',
    'c': 'character',
    'd': 'directory',
    'e': 'exists',
    'f': 'file',
    'L': 'link',
    'p': 'pipe',
    'S': 'socket'
  });

  var canInterpret = false;
  for (var key in options)
    if (options[key] === true) {
      canInterpret = true;
      break;
    }

  if (!canInterpret)
    common.error('could not interpret expression');

  if (options.link) {
    try {
      return fs.lstatSync(path).isSymbolicLink();
    } catch(e) {
      return false;
    }
  }

  if (!fs.existsSync(path))
    return false;

  if (options.exists)
    return true;

  var stats = fs.statSync(path);

  if (options.block)
    return stats.isBlockDevice();

  if (options.character)
    return stats.isCharacterDevice();

  if (options.directory)
    return stats.isDirectory();

  if (options.file)
    return stats.isFile();

  if (options.pipe)
    return stats.isFIFO();

  if (options.socket)
    return stats.isSocket();
} // test
module.exports = _test;


/***/ }),
/* 36 */
/***/ (function(module, exports, __webpack_require__) {

var common = __webpack_require__(1);
var fs = __webpack_require__(2);

//@
//@ ### cat(file [, file ...])
//@ ### cat(file_array)
//@
//@ Examples:
//@
//@ ```javascript
//@ var str = cat('file*.txt');
//@ var str = cat('file1', 'file2');
//@ var str = cat(['file1', 'file2']); // same as above
//@ ```
//@
//@ Returns a string containing the given file, or a concatenated string
//@ containing the files if more than one file is given (a new line character is
//@ introduced between each file). Wildcard `*` accepted.
function _cat(options, files) {
  var cat = '';

  if (!files)
    common.error('no paths given');

  if (typeof files === 'string')
    files = [].slice.call(arguments, 1);
  // if it's array leave it as it is

  files = common.expand(files);

  files.forEach(function(file) {
    if (!fs.existsSync(file))
      common.error('no such file or directory: ' + file);

    cat += fs.readFileSync(file, 'utf8');
  });

  return common.ShellString(cat);
}
module.exports = _cat;


/***/ }),
/* 37 */
/***/ (function(module, exports, __webpack_require__) {

var common = __webpack_require__(1);
var fs = __webpack_require__(2);
var path = __webpack_require__(0);

//@
//@ ### 'string'.to(file)
//@
//@ Examples:
//@
//@ ```javascript
//@ cat('input.txt').to('output.txt');
//@ ```
//@
//@ Analogous to the redirection operator `>` in Unix, but works with JavaScript strings (such as
//@ those returned by `cat`, `grep`, etc). _Like Unix redirections, `to()` will overwrite any existing file!_
function _to(options, file) {
  if (!file)
    common.error('wrong arguments');

  if (!fs.existsSync( path.dirname(file) ))
      common.error('no such file or directory: ' + path.dirname(file));

  try {
    fs.writeFileSync(file, this.toString(), 'utf8');
    return this;
  } catch(e) {
    common.error('could not write to file (code '+e.code+'): '+file, true);
  }
}
module.exports = _to;


/***/ }),
/* 38 */
/***/ (function(module, exports, __webpack_require__) {

var common = __webpack_require__(1);
var fs = __webpack_require__(2);
var path = __webpack_require__(0);

//@
//@ ### 'string'.toEnd(file)
//@
//@ Examples:
//@
//@ ```javascript
//@ cat('input.txt').toEnd('output.txt');
//@ ```
//@
//@ Analogous to the redirect-and-append operator `>>` in Unix, but works with JavaScript strings (such as
//@ those returned by `cat`, `grep`, etc).
function _toEnd(options, file) {
  if (!file)
    common.error('wrong arguments');

  if (!fs.existsSync( path.dirname(file) ))
      common.error('no such file or directory: ' + path.dirname(file));

  try {
    fs.appendFileSync(file, this.toString(), 'utf8');
    return this;
  } catch(e) {
    common.error('could not append to file (code '+e.code+'): '+file, true);
  }
}
module.exports = _toEnd;


/***/ }),
/* 39 */
/***/ (function(module, exports, __webpack_require__) {

var common = __webpack_require__(1);
var fs = __webpack_require__(2);

//@
//@ ### sed([options,] search_regex, replacement, file [, file ...])
//@ ### sed([options,] search_regex, replacement, file_array)
//@ Available options:
//@
//@ + `-i`: Replace contents of 'file' in-place. _Note that no backups will be created!_
//@
//@ Examples:
//@
//@ ```javascript
//@ sed('-i', 'PROGRAM_VERSION', 'v0.1.3', 'source.js');
//@ sed(/.*DELETE_THIS_LINE.*\n/, '', 'source.js');
//@ ```
//@
//@ Reads an input string from `files` and performs a JavaScript `replace()` on the input
//@ using the given search regex and replacement string or function. Returns the new string after replacement.
function _sed(options, regex, replacement, files) {
  options = common.parseOptions(options, {
    'i': 'inplace'
  });

  if (typeof replacement === 'string' || typeof replacement === 'function')
    replacement = replacement; // no-op
  else if (typeof replacement === 'number')
    replacement = replacement.toString(); // fallback
  else
    common.error('invalid replacement string');

  // Convert all search strings to RegExp
  if (typeof regex === 'string')
    regex = RegExp(regex);

  if (!files)
    common.error('no files given');

  if (typeof files === 'string')
    files = [].slice.call(arguments, 3);
  // if it's array leave it as it is

  files = common.expand(files);

  var sed = [];
  files.forEach(function(file) {
    if (!fs.existsSync(file)) {
      common.error('no such file or directory: ' + file, true);
      return;
    }

    var result = fs.readFileSync(file, 'utf8').split('\n').map(function (line) {
      return line.replace(regex, replacement);
    }).join('\n');

    sed.push(result);

    if (options.inplace)
      fs.writeFileSync(file, result, 'utf8');
  });

  return common.ShellString(sed.join('\n'));
}
module.exports = _sed;


/***/ }),
/* 40 */
/***/ (function(module, exports, __webpack_require__) {

var common = __webpack_require__(1);
var fs = __webpack_require__(2);

//@
//@ ### grep([options,] regex_filter, file [, file ...])
//@ ### grep([options,] regex_filter, file_array)
//@ Available options:
//@
//@ + `-v`: Inverse the sense of the regex and print the lines not matching the criteria.
//@
//@ Examples:
//@
//@ ```javascript
//@ grep('-v', 'GLOBAL_VARIABLE', '*.js');
//@ grep('GLOBAL_VARIABLE', '*.js');
//@ ```
//@
//@ Reads input string from given files and returns a string containing all lines of the
//@ file that match the given `regex_filter`. Wildcard `*` accepted.
function _grep(options, regex, files) {
  options = common.parseOptions(options, {
    'v': 'inverse'
  });

  if (!files)
    common.error('no paths given');

  if (typeof files === 'string')
    files = [].slice.call(arguments, 2);
  // if it's array leave it as it is

  files = common.expand(files);

  var grep = '';
  files.forEach(function(file) {
    if (!fs.existsSync(file)) {
      common.error('no such file or directory: ' + file, true);
      return;
    }

    var contents = fs.readFileSync(file, 'utf8'),
        lines = contents.split(/\r*\n/);
    lines.forEach(function(line) {
      var matched = line.match(regex);
      if ((options.inverse && !matched) || (!options.inverse && matched))
        grep += line + '\n';
    });
  });

  return common.ShellString(grep);
}
module.exports = _grep;


/***/ }),
/* 41 */
/***/ (function(module, exports, __webpack_require__) {

var common = __webpack_require__(1);
var fs = __webpack_require__(2);
var path = __webpack_require__(0);

// XP's system default value for PATHEXT system variable, just in case it's not
// set on Windows.
var XP_DEFAULT_PATHEXT = '.com;.exe;.bat;.cmd;.vbs;.vbe;.js;.jse;.wsf;.wsh';

// Cross-platform method for splitting environment PATH variables
function splitPath(p) {
  if (!p)
    return [];

  if (common.platform === 'win')
    return p.split(';');
  else
    return p.split(':');
}

function checkPath(path) {
  return fs.existsSync(path) && !fs.statSync(path).isDirectory();
}

//@
//@ ### which(command)
//@
//@ Examples:
//@
//@ ```javascript
//@ var nodeExec = which('node');
//@ ```
//@
//@ Searches for `command` in the system's PATH. On Windows, this uses the
//@ `PATHEXT` variable to append the extension if it's not already executable.
//@ Returns string containing the absolute path to the command.
function _which(options, cmd) {
  if (!cmd)
    common.error('must specify command');

  var pathEnv = process.env.path || process.env.Path || process.env.PATH,
      pathArray = splitPath(pathEnv),
      where = null;

  // No relative/absolute paths provided?
  if (cmd.search(/\//) === -1) {
    // Search for command in PATH
    pathArray.forEach(function(dir) {
      if (where)
        return; // already found it

      var attempt = path.resolve(dir, cmd);

      if (common.platform === 'win') {
        attempt = attempt.toUpperCase();

        // In case the PATHEXT variable is somehow not set (e.g.
        // child_process.spawn with an empty environment), use the XP default.
        var pathExtEnv = process.env.PATHEXT || XP_DEFAULT_PATHEXT;
        var pathExtArray = splitPath(pathExtEnv.toUpperCase());
        var i;

        // If the extension is already in PATHEXT, just return that.
        for (i = 0; i < pathExtArray.length; i++) {
          var ext = pathExtArray[i];
          if (attempt.slice(-ext.length) === ext && checkPath(attempt)) {
            where = attempt;
            return;
          }
        }

        // Cycle through the PATHEXT variable
        var baseAttempt = attempt;
        for (i = 0; i < pathExtArray.length; i++) {
          attempt = baseAttempt + pathExtArray[i];
          if (checkPath(attempt)) {
            where = attempt;
            return;
          }
        }
      } else {
        // Assume it's Unix-like
        if (checkPath(attempt)) {
          where = attempt;
          return;
        }
      }
    });
  }

  // Command not found anywhere?
  if (!checkPath(cmd) && !where)
    return null;

  where = where || path.resolve(cmd);

  return common.ShellString(where);
}
module.exports = _which;


/***/ }),
/* 42 */
/***/ (function(module, exports, __webpack_require__) {

var common = __webpack_require__(1);

//@
//@ ### echo(string [, string ...])
//@
//@ Examples:
//@
//@ ```javascript
//@ echo('hello world');
//@ var str = echo('hello world');
//@ ```
//@
//@ Prints string to stdout, and returns string with additional utility methods
//@ like `.to()`.
function _echo() {
  var messages = [].slice.call(arguments, 0);
  console.log.apply(console, messages);
  return common.ShellString(messages.join(' '));
}
module.exports = _echo;


/***/ }),
/* 43 */
/***/ (function(module, exports, __webpack_require__) {

var fs = __webpack_require__(2);
var path = __webpack_require__(0);
var common = __webpack_require__(1);

//@
//@ ### ln([options,] source, dest)
//@ Available options:
//@
//@ + `-s`: symlink
//@ + `-f`: force
//@
//@ Examples:
//@
//@ ```javascript
//@ ln('file', 'newlink');
//@ ln('-sf', 'file', 'existing');
//@ ```
//@
//@ Links source to dest. Use -f to force the link, should dest already exist.
function _ln(options, source, dest) {
  options = common.parseOptions(options, {
    's': 'symlink',
    'f': 'force'
  });

  if (!source || !dest) {
    common.error('Missing <source> and/or <dest>');
  }

  source = String(source);
  var sourcePath = path.normalize(source).replace(RegExp(path.sep + '$'), '');
  var isAbsolute = (path.resolve(source) === sourcePath);
  dest = path.resolve(process.cwd(), String(dest));

  if (fs.existsSync(dest)) {
    if (!options.force) {
      common.error('Destination file exists', true);
    }

    fs.unlinkSync(dest);
  }

  if (options.symlink) {
    var isWindows = common.platform === 'win';
    var linkType = isWindows ? 'file' : null;
    var resolvedSourcePath = isAbsolute ? sourcePath : path.resolve(process.cwd(), path.dirname(dest), source);
    if (!fs.existsSync(resolvedSourcePath)) {
      common.error('Source file does not exist', true);
    } else if (isWindows && fs.statSync(resolvedSourcePath).isDirectory()) {
      linkType =  'junction';
    }

    try {
      fs.symlinkSync(linkType === 'junction' ? resolvedSourcePath: source, dest, linkType);
    } catch (err) {
      common.error(err.message);
    }
  } else {
    if (!fs.existsSync(source)) {
      common.error('Source file does not exist', true);
    }
    try {
      fs.linkSync(source, dest);
    } catch (err) {
      common.error(err.message);
    }
  }
}
module.exports = _ln;


/***/ }),
/* 44 */
/***/ (function(module, exports, __webpack_require__) {

var common = __webpack_require__(1);
var _tempDir = __webpack_require__(18);
var _pwd = __webpack_require__(11);
var path = __webpack_require__(0);
var fs = __webpack_require__(2);
var child = __webpack_require__(45);

var DEFAULT_MAXBUFFER_SIZE = 20*1024*1024;

// Hack to run child_process.exec() synchronously (sync avoids callback hell)
// Uses a custom wait loop that checks for a flag file, created when the child process is done.
// (Can't do a wait loop that checks for internal Node variables/messages as
// Node is single-threaded; callbacks and other internal state changes are done in the
// event loop).
function execSync(cmd, opts) {
  var tempDir = _tempDir();
  var stdoutFile = path.resolve(tempDir+'/'+common.randomFileName()),
      stderrFile = path.resolve(tempDir+'/'+common.randomFileName()),
      codeFile = path.resolve(tempDir+'/'+common.randomFileName()),
      scriptFile = path.resolve(tempDir+'/'+common.randomFileName()),
      sleepFile = path.resolve(tempDir+'/'+common.randomFileName());

  opts = common.extend({
    silent: common.config.silent,
    cwd: _pwd(),
    env: process.env,
    maxBuffer: DEFAULT_MAXBUFFER_SIZE
  }, opts);

  var previousStdoutContent = '',
      previousStderrContent = '';
  // Echoes stdout and stderr changes from running process, if not silent
  function updateStream(streamFile) {
    if (opts.silent || !fs.existsSync(streamFile))
      return;

    var previousStreamContent,
        proc_stream;
    if (streamFile === stdoutFile) {
      previousStreamContent = previousStdoutContent;
      proc_stream = process.stdout;
    } else { // assume stderr
      previousStreamContent = previousStderrContent;
      proc_stream = process.stderr;
    }

    var streamContent = fs.readFileSync(streamFile, 'utf8');
    // No changes since last time?
    if (streamContent.length <= previousStreamContent.length)
      return;

    proc_stream.write(streamContent.substr(previousStreamContent.length));
    previousStreamContent = streamContent;
  }

  function escape(str) {
    return (str+'').replace(/([\\"'])/g, "\\$1").replace(/\0/g, "\\0");
  }

  if (fs.existsSync(scriptFile)) common.unlinkSync(scriptFile);
  if (fs.existsSync(stdoutFile)) common.unlinkSync(stdoutFile);
  if (fs.existsSync(stderrFile)) common.unlinkSync(stderrFile);
  if (fs.existsSync(codeFile)) common.unlinkSync(codeFile);

  var execCommand = '"'+process.execPath+'" '+scriptFile;
  var script;

  if (typeof child.execSync === 'function') {
    script = [
      "var child = require('child_process')",
      "  , fs = require('fs');",
      "var childProcess = child.exec('"+escape(cmd)+"', {env: process.env, maxBuffer: "+opts.maxBuffer+"}, function(err) {",
      "  fs.writeFileSync('"+escape(codeFile)+"', err ? err.code.toString() : '0');",
      "});",
      "var stdoutStream = fs.createWriteStream('"+escape(stdoutFile)+"');",
      "var stderrStream = fs.createWriteStream('"+escape(stderrFile)+"');",
      "childProcess.stdout.pipe(stdoutStream, {end: false});",
      "childProcess.stderr.pipe(stderrStream, {end: false});",
      "childProcess.stdout.pipe(process.stdout);",
      "childProcess.stderr.pipe(process.stderr);",
      "var stdoutEnded = false, stderrEnded = false;",
      "function tryClosingStdout(){ if(stdoutEnded){ stdoutStream.end(); } }",
      "function tryClosingStderr(){ if(stderrEnded){ stderrStream.end(); } }",
      "childProcess.stdout.on('end', function(){ stdoutEnded = true; tryClosingStdout(); });",
      "childProcess.stderr.on('end', function(){ stderrEnded = true; tryClosingStderr(); });"
    ].join('\n');

    fs.writeFileSync(scriptFile, script);

    if (opts.silent) {
      opts.stdio = 'ignore';
    } else {
      opts.stdio = [0, 1, 2];
    }

    // Welcome to the future
    child.execSync(execCommand, opts);
  } else {
    cmd += ' > '+stdoutFile+' 2> '+stderrFile; // works on both win/unix

    script = [
      "var child = require('child_process')",
      "  , fs = require('fs');",
      "var childProcess = child.exec('"+escape(cmd)+"', {env: process.env, maxBuffer: "+opts.maxBuffer+"}, function(err) {",
      "  fs.writeFileSync('"+escape(codeFile)+"', err ? err.code.toString() : '0');",
      "});"
    ].join('\n');

    fs.writeFileSync(scriptFile, script);

    child.exec(execCommand, opts);

    // The wait loop
    // sleepFile is used as a dummy I/O op to mitigate unnecessary CPU usage
    // (tried many I/O sync ops, writeFileSync() seems to be only one that is effective in reducing
    // CPU usage, though apparently not so much on Windows)
    while (!fs.existsSync(codeFile)) { updateStream(stdoutFile); fs.writeFileSync(sleepFile, 'a'); }
    while (!fs.existsSync(stdoutFile)) { updateStream(stdoutFile); fs.writeFileSync(sleepFile, 'a'); }
    while (!fs.existsSync(stderrFile)) { updateStream(stderrFile); fs.writeFileSync(sleepFile, 'a'); }
  }

  // At this point codeFile exists, but it's not necessarily flushed yet.
  // Keep reading it until it is.
  var code = parseInt('', 10);
  while (isNaN(code)) {
    code = parseInt(fs.readFileSync(codeFile, 'utf8'), 10);
  }

  var stdout = fs.readFileSync(stdoutFile, 'utf8');
  var stderr = fs.readFileSync(stderrFile, 'utf8');

  // No biggie if we can't erase the files now -- they're in a temp dir anyway
  try { common.unlinkSync(scriptFile); } catch(e) {}
  try { common.unlinkSync(stdoutFile); } catch(e) {}
  try { common.unlinkSync(stderrFile); } catch(e) {}
  try { common.unlinkSync(codeFile); } catch(e) {}
  try { common.unlinkSync(sleepFile); } catch(e) {}

  // some shell return codes are defined as errors, per http://tldp.org/LDP/abs/html/exitcodes.html
  if (code === 1 || code === 2 || code >= 126)  {
      common.error('', true); // unix/shell doesn't really give an error message after non-zero exit codes
  }
  // True if successful, false if not
  var obj = {
    code: code,
    output: stdout, // deprecated
    stdout: stdout,
    stderr: stderr
  };
  return obj;
} // execSync()

// Wrapper around exec() to enable echoing output to console in real time
function execAsync(cmd, opts, callback) {
  var stdout = '';
  var stderr = '';

  opts = common.extend({
    silent: common.config.silent,
    cwd: _pwd(),
    env: process.env,
    maxBuffer: DEFAULT_MAXBUFFER_SIZE
  }, opts);

  var c = child.exec(cmd, opts, function(err) {
    if (callback)
      callback(err ? err.code : 0, stdout, stderr);
  });

  c.stdout.on('data', function(data) {
    stdout += data;
    if (!opts.silent)
      process.stdout.write(data);
  });

  c.stderr.on('data', function(data) {
    stderr += data;
    if (!opts.silent)
      process.stderr.write(data);
  });

  return c;
}

//@
//@ ### exec(command [, options] [, callback])
//@ Available options (all `false` by default):
//@
//@ + `async`: Asynchronous execution. If a callback is provided, it will be set to
//@   `true`, regardless of the passed value.
//@ + `silent`: Do not echo program output to console.
//@ + and any option available to NodeJS's
//@   [child_process.exec()](https://nodejs.org/api/child_process.html#child_process_child_process_exec_command_options_callback)
//@
//@ Examples:
//@
//@ ```javascript
//@ var version = exec('node --version', {silent:true}).stdout;
//@
//@ var child = exec('some_long_running_process', {async:true});
//@ child.stdout.on('data', function(data) {
//@   /* ... do something with data ... */
//@ });
//@
//@ exec('some_long_running_process', function(code, stdout, stderr) {
//@   console.log('Exit code:', code);
//@   console.log('Program output:', stdout);
//@   console.log('Program stderr:', stderr);
//@ });
//@ ```
//@
//@ Executes the given `command` _synchronously_, unless otherwise specified.  When in synchronous
//@ mode returns the object `{ code:..., stdout:... , stderr:... }`, containing the program's
//@ `stdout`, `stderr`, and its exit `code`. Otherwise returns the child process object,
//@ and the `callback` gets the arguments `(code, stdout, stderr)`.
//@
//@ **Note:** For long-lived processes, it's best to run `exec()` asynchronously as
//@ the current synchronous implementation uses a lot of CPU. This should be getting
//@ fixed soon.
function _exec(command, options, callback) {
  if (!command)
    common.error('must specify command');

  // Callback is defined instead of options.
  if (typeof options === 'function') {
    callback = options;
    options = { async: true };
  }

  // Callback is defined with options.
  if (typeof options === 'object' && typeof callback === 'function') {
    options.async = true;
  }

  options = common.extend({
    silent: common.config.silent,
    async: false
  }, options);

  try {
    if (options.async)
      return execAsync(command, options, callback);
    else
      return execSync(command, options);
  } catch (e) {
    common.error('internal error');
  }
}
module.exports = _exec;


/***/ }),
/* 45 */
/***/ (function(module, exports) {

module.exports = require("child_process");

/***/ }),
/* 46 */
/***/ (function(module, exports, __webpack_require__) {

var common = __webpack_require__(1);
var fs = __webpack_require__(2);
var path = __webpack_require__(0);

var PERMS = (function (base) {
  return {
    OTHER_EXEC  : base.EXEC,
    OTHER_WRITE : base.WRITE,
    OTHER_READ  : base.READ,

    GROUP_EXEC  : base.EXEC  << 3,
    GROUP_WRITE : base.WRITE << 3,
    GROUP_READ  : base.READ << 3,

    OWNER_EXEC  : base.EXEC << 6,
    OWNER_WRITE : base.WRITE << 6,
    OWNER_READ  : base.READ << 6,

    // Literal octal numbers are apparently not allowed in "strict" javascript.  Using parseInt is
    // the preferred way, else a jshint warning is thrown.
    STICKY      : parseInt('01000', 8),
    SETGID      : parseInt('02000', 8),
    SETUID      : parseInt('04000', 8),

    TYPE_MASK   : parseInt('0770000', 8)
  };
})({
  EXEC  : 1,
  WRITE : 2,
  READ  : 4
});

//@
//@ ### chmod(octal_mode || octal_string, file)
//@ ### chmod(symbolic_mode, file)
//@
//@ Available options:
//@
//@ + `-v`: output a diagnostic for every file processed//@
//@ + `-c`: like verbose but report only when a change is made//@
//@ + `-R`: change files and directories recursively//@
//@
//@ Examples:
//@
//@ ```javascript
//@ chmod(755, '/Users/brandon');
//@ chmod('755', '/Users/brandon'); // same as above
//@ chmod('u+x', '/Users/brandon');
//@ ```
//@
//@ Alters the permissions of a file or directory by either specifying the
//@ absolute permissions in octal form or expressing the changes in symbols.
//@ This command tries to mimic the POSIX behavior as much as possible.
//@ Notable exceptions:
//@
//@ + In symbolic modes, 'a-r' and '-r' are identical.  No consideration is
//@   given to the umask.
//@ + There is no "quiet" option since default behavior is to run silent.
function _chmod(options, mode, filePattern) {
  if (!filePattern) {
    if (options.length > 0 && options.charAt(0) === '-') {
      // Special case where the specified file permissions started with - to subtract perms, which
      // get picked up by the option parser as command flags.
      // If we are down by one argument and options starts with -, shift everything over.
      filePattern = mode;
      mode = options;
      options = '';
    }
    else {
      common.error('You must specify a file.');
    }
  }

  options = common.parseOptions(options, {
    'R': 'recursive',
    'c': 'changes',
    'v': 'verbose'
  });

  if (typeof filePattern === 'string') {
    filePattern = [ filePattern ];
  }

  var files;

  if (options.recursive) {
    files = [];
    common.expand(filePattern).forEach(function addFile(expandedFile) {
      var stat = fs.lstatSync(expandedFile);

      if (!stat.isSymbolicLink()) {
        files.push(expandedFile);

        if (stat.isDirectory()) {  // intentionally does not follow symlinks.
          fs.readdirSync(expandedFile).forEach(function (child) {
            addFile(expandedFile + '/' + child);
          });
        }
      }
    });
  }
  else {
    files = common.expand(filePattern);
  }

  files.forEach(function innerChmod(file) {
    file = path.resolve(file);
    if (!fs.existsSync(file)) {
      common.error('File not found: ' + file);
    }

    // When recursing, don't follow symlinks.
    if (options.recursive && fs.lstatSync(file).isSymbolicLink()) {
      return;
    }

    var stat = fs.statSync(file);
    var isDir = stat.isDirectory();
    var perms = stat.mode;
    var type = perms & PERMS.TYPE_MASK;

    var newPerms = perms;

    if (isNaN(parseInt(mode, 8))) {
      // parse options
      mode.split(',').forEach(function (symbolicMode) {
        /*jshint regexdash:true */
        var pattern = /([ugoa]*)([=\+-])([rwxXst]*)/i;
        var matches = pattern.exec(symbolicMode);

        if (matches) {
          var applyTo = matches[1];
          var operator = matches[2];
          var change = matches[3];

          var changeOwner = applyTo.indexOf('u') != -1 || applyTo === 'a' || applyTo === '';
          var changeGroup = applyTo.indexOf('g') != -1 || applyTo === 'a' || applyTo === '';
          var changeOther = applyTo.indexOf('o') != -1 || applyTo === 'a' || applyTo === '';

          var changeRead    = change.indexOf('r') != -1;
          var changeWrite   = change.indexOf('w') != -1;
          var changeExec    = change.indexOf('x') != -1;
          var changeExecDir = change.indexOf('X') != -1;
          var changeSticky  = change.indexOf('t') != -1;
          var changeSetuid  = change.indexOf('s') != -1;

          if (changeExecDir && isDir)
            changeExec = true;

          var mask = 0;
          if (changeOwner) {
            mask |= (changeRead ? PERMS.OWNER_READ : 0) + (changeWrite ? PERMS.OWNER_WRITE : 0) + (changeExec ? PERMS.OWNER_EXEC : 0) + (changeSetuid ? PERMS.SETUID : 0);
          }
          if (changeGroup) {
            mask |= (changeRead ? PERMS.GROUP_READ : 0) + (changeWrite ? PERMS.GROUP_WRITE : 0) + (changeExec ? PERMS.GROUP_EXEC : 0) + (changeSetuid ? PERMS.SETGID : 0);
          }
          if (changeOther) {
            mask |= (changeRead ? PERMS.OTHER_READ : 0) + (changeWrite ? PERMS.OTHER_WRITE : 0) + (changeExec ? PERMS.OTHER_EXEC : 0);
          }

          // Sticky bit is special - it's not tied to user, group or other.
          if (changeSticky) {
            mask |= PERMS.STICKY;
          }

          switch (operator) {
            case '+':
              newPerms |= mask;
              break;

            case '-':
              newPerms &= ~mask;
              break;

            case '=':
              newPerms = type + mask;

              // According to POSIX, when using = to explicitly set the permissions, setuid and setgid can never be cleared.
              if (fs.statSync(file).isDirectory()) {
                newPerms |= (PERMS.SETUID + PERMS.SETGID) & perms;
              }
              break;
          }

          if (options.verbose) {
            console.log(file + ' -> ' + newPerms.toString(8));
          }

          if (perms != newPerms) {
            if (!options.verbose && options.changes) {
              console.log(file + ' -> ' + newPerms.toString(8));
            }
            fs.chmodSync(file, newPerms);
            perms = newPerms; // for the next round of changes!
          }
        }
        else {
          common.error('Invalid symbolic mode change: ' + symbolicMode);
        }
      });
    }
    else {
      // they gave us a full number
      newPerms = type + parseInt(mode, 8);

      // POSIX rules are that setuid and setgid can only be added using numeric form, but not cleared.
      if (fs.statSync(file).isDirectory()) {
        newPerms |= (PERMS.SETUID + PERMS.SETGID) & perms;
      }

      fs.chmodSync(file, newPerms);
    }
  });
}
module.exports = _chmod;


/***/ }),
/* 47 */
/***/ (function(module, exports, __webpack_require__) {

var common = __webpack_require__(1);
var fs = __webpack_require__(2);

//@
//@ ### touch([options,] file)
//@ Available options:
//@
//@ + `-a`: Change only the access time
//@ + `-c`: Do not create any files
//@ + `-m`: Change only the modification time
//@ + `-d DATE`: Parse DATE and use it instead of current time
//@ + `-r FILE`: Use FILE's times instead of current time
//@
//@ Examples:
//@
//@ ```javascript
//@ touch('source.js');
//@ touch('-c', '/path/to/some/dir/source.js');
//@ touch({ '-r': FILE }, '/path/to/some/dir/source.js');
//@ ```
//@
//@ Update the access and modification times of each FILE to the current time.
//@ A FILE argument that does not exist is created empty, unless -c is supplied.
//@ This is a partial implementation of *[touch(1)](http://linux.die.net/man/1/touch)*.
function _touch(opts, files) {
  opts = common.parseOptions(opts, {
    'a': 'atime_only',
    'c': 'no_create',
    'd': 'date',
    'm': 'mtime_only',
    'r': 'reference',
  });

  if (!files) {
    common.error('no paths given');
  }

  if (Array.isArray(files)) {
    files.forEach(function(f) {
      touchFile(opts, f);
    });
  } else if (typeof files === 'string') {
    touchFile(opts, files);
  } else {
    common.error('file arg should be a string file path or an Array of string file paths');
  }

}

function touchFile(opts, file) {
  var stat = tryStatFile(file);

  if (stat && stat.isDirectory()) {
    // don't error just exit
    return;
  }

  // if the file doesn't already exist and the user has specified --no-create then
  // this script is finished
  if (!stat && opts.no_create) {
    return;
  }

  // open the file and then close it. this will create it if it doesn't exist but will
  // not truncate the file
  fs.closeSync(fs.openSync(file, 'a'));

  //
  // Set timestamps
  //

  // setup some defaults
  var now = new Date();
  var mtime = opts.date || now;
  var atime = opts.date || now;

  // use reference file
  if (opts.reference) {
    var refStat = tryStatFile(opts.reference);
    if (!refStat) {
      common.error('failed to get attributess of ' + opts.reference);
    }
    mtime = refStat.mtime;
    atime = refStat.atime;
  } else if (opts.date) {
    mtime = opts.date;
    atime = opts.date;
  }

  if (opts.atime_only && opts.mtime_only) {
    // keep the new values of mtime and atime like GNU
  } else if (opts.atime_only) {
    mtime = stat.mtime;
  } else if (opts.mtime_only) {
    atime = stat.atime;
  }

  fs.utimesSync(file, atime, mtime);
}

module.exports = _touch;

function tryStatFile(filePath) {
  try {
    return fs.statSync(filePath);
  } catch (e) {
    return null;
  }
}


/***/ }),
/* 48 */
/***/ (function(module, exports, __webpack_require__) {

var common = __webpack_require__(1);

//@
//@ ### set(options)
//@ Available options:
//@
//@ + `+/-e`: exit upon error (`config.fatal`)
//@ + `+/-v`: verbose: show all commands (`config.verbose`)
//@
//@ Examples:
//@
//@ ```javascript
//@ set('-e'); // exit upon first error
//@ set('+e'); // this undoes a "set('-e')"
//@ ```
//@
//@ Sets global configuration variables
function _set(options) {
  if (!options) {
    var args = [].slice.call(arguments, 0);
    if (args.length < 2)
      common.error('must provide an argument');
    options = args[1];
  }
  var negate = (options[0] === '+');
  if (negate) {
    options = '-' + options.slice(1); // parseOptions needs a '-' prefix
  }
  options = common.parseOptions(options, {
    'e': 'fatal',
    'v': 'verbose'
  });

  var key;
  if (negate) {
    for (key in options)
      options[key] = !options[key];
  }

  for (key in options) {
    // Only change the global config if `negate` is false and the option is true
    // or if `negate` is true and the option is false (aka negate !== option)
    if (negate !== options[key]) {
      common.config[key] = options[key];
    }
  }
  return;
}
module.exports = _set;


/***/ }),
/* 49 */
/***/ (function(module, exports, __webpack_require__) {

var common = __webpack_require__(1);

//@
//@ ### error()
//@ Tests if error occurred in the last command. Returns `null` if no error occurred,
//@ otherwise returns string explaining the error
function error() {
  return common.state.error;
}
module.exports = error;


/***/ }),
/* 50 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


const version = __webpack_require__(7).version;
const minimist = __webpack_require__(51);
const _ = __webpack_require__(5);
const os = __webpack_require__(4);
const chalk = __webpack_require__(19);

class CLI {
  constructor(serverless, inputArray) {
    this.serverless = serverless;
    this.inputArray = inputArray || null;
    this.loadedPlugins = [];
    this.loadedCommands = {};
  }

  setLoadedPlugins(plugins) {
    this.loadedPlugins = plugins;
  }

  setLoadedCommands(commands) {
    this.loadedCommands = commands;
  }

  processInput() {
    let inputArray;

    // check if commands are passed externally (e.g. used by tests)
    // otherwise use process.argv to receive the commands
    if (this.inputArray !== null) {
      inputArray = this.inputArray;
    } else {
      inputArray = process.argv.slice(2);
    }

    const argv = minimist(inputArray);

    const commands = [].concat(argv._);
    const options = _.omit(argv, ['_']);

    return { commands, options };
  }

  displayHelp(processedInput) {
    const commands = processedInput.commands;
    const options = processedInput.options;

    // if only "version" or "v" was entered
    if ((commands.length === 0 && (options.version || options.v)) ||
        (commands.length === 1 && (commands.indexOf('version') > -1))) {
      this.getVersionNumber();
      return true;
    }

    // if only "help" or "h" was entered
    if ((commands.length === 0) ||
        (commands.length === 0 && (options.help || options.h)) ||
        (commands.length === 1 && (commands.indexOf('help') > -1))) {
      if (options.verbose || options.v) {
        this.generateVerboseHelp();
      } else {
        this.generateMainHelp();
      }
      return true;
    }

    // if "help" was entered in combination with commands (or one command)
    if (commands.length >= 1 && (options.help || options.h)) {
      this.generateCommandsHelp(commands);
      return true;
    }
    return false;
  }

  displayCommandUsage(commandObject, command, indents) {
    const dotsLength = 30;

    // check if command has lifecycleEvents (can be executed)
    if (commandObject.lifecycleEvents) {
      const usage = commandObject.usage;
      const dots = _.repeat('.', dotsLength - command.length);
      const indent = _.repeat('  ', indents || 0);
      this.consoleLog(`${indent}${chalk.yellow(command)} ${chalk.dim(dots)} ${usage}`);
    }

    _.forEach(commandObject.commands, (subcommandObject, subcommand) => {
      this.displayCommandUsage(subcommandObject, `${command} ${subcommand}`, indents);
    });
  }

  displayCommandOptions(commandObject) {
    const dotsLength = 40;
    _.forEach(commandObject.options, (optionsObject, option) => {
      let optionsDots = _.repeat('.', dotsLength - option.length);
      const optionsUsage = optionsObject.usage;

      if (optionsObject.required) {
        optionsDots = optionsDots.slice(0, optionsDots.length - 18);
      } else {
        optionsDots = optionsDots.slice(0, optionsDots.length - 7);
      }
      if (optionsObject.shortcut) {
        optionsDots = optionsDots.slice(0, optionsDots.length - 5);
      }

      const optionInfo = `    --${option}`;
      let shortcutInfo = '';
      let requiredInfo = '';
      if (optionsObject.shortcut) {
        shortcutInfo = ` / -${optionsObject.shortcut}`;
      }
      if (optionsObject.required) {
        requiredInfo = ' (required)';
      }

      const thingsToLog = `${optionInfo}${shortcutInfo}${requiredInfo} ${
        chalk.dim(optionsDots)} ${optionsUsage}`;
      this.consoleLog(chalk.yellow(thingsToLog));
    });
  }

  generateMainHelp() {
    let platformCommands;
    let frameworkCommands;
    if (this.loadedCommands) {
      const commandKeys = Object.keys(this.loadedCommands);
      const sortedCommandKeys = _.sortBy(commandKeys);
      const partitionedCommandKeys = _.partition(sortedCommandKeys,
        (key) => this.loadedCommands[key].platform);
      platformCommands = _.fromPairs(
        _.map(partitionedCommandKeys[0], key => [key, this.loadedCommands[key]])
      );
      frameworkCommands = _.fromPairs(
        _.map(partitionedCommandKeys[1], key => [key, this.loadedCommands[key]])
      );
    }

    this.consoleLog('');

    this.consoleLog(chalk.yellow.underline('Commands'));
    this.consoleLog(chalk.dim('* You can run commands with "serverless" or the shortcut "sls"'));
    this.consoleLog(chalk.dim('* Pass "--verbose" to this command to get in-depth plugin info'));
    this.consoleLog(chalk.dim('* Pass "--help" after any <command> for contextual help'));

    this.consoleLog('');

    this.consoleLog(chalk.yellow.underline('Framework'));
    this.consoleLog(chalk.dim('* Documentation: https://serverless.com/framework/docs/'));

    this.consoleLog('');

    if (!_.isEmpty(frameworkCommands)) {
      _.forEach(frameworkCommands, (details, command) => {
        this.displayCommandUsage(details, command);
      });
    } else {
      this.consoleLog('No commands found');
    }

    this.consoleLog('');

    this.consoleLog(chalk.yellow.underline('Platform (Beta)'));
    // eslint-disable-next-line max-len
    this.consoleLog(chalk.dim('* The Serverless Platform is currently in experimental beta. Follow the docs below to get started.'));
    this.consoleLog(chalk.dim('* Documentation: https://serverless.com/platform/docs/'));

    this.consoleLog('');

    if (!_.isEmpty(platformCommands)) {
      _.forEach(platformCommands, (details, command) => {
        this.displayCommandUsage(details, command);
      });
    } else {
      this.consoleLog('No commands found');
    }

    this.consoleLog('');

    // print all the installed plugins
    this.consoleLog(chalk.yellow.underline('Plugins'));

    if (this.loadedPlugins.length) {
      const sortedPlugins = _.sortBy(this.loadedPlugins, (plugin) => plugin.constructor.name);
      this.consoleLog(sortedPlugins.map((plugin) => plugin.constructor.name).join(', '));
    } else {
      this.consoleLog('No plugins added yet');
    }
  }

  generateVerboseHelp() {
    this.consoleLog('');
    this.consoleLog(chalk.yellow.underline('Commands by plugin'));
    this.consoleLog('');

    let pluginCommands = {};

    // add commands to pluginCommands based on command's plugin
    const addToPluginCommands = (cmd) => {
      const pcmd = _.clone(cmd);

      // remove subcommand from clone
      delete pcmd.commands;

      // check if a plugin entry is alreay present in pluginCommands. Use the
      // existing one or create a new plugin entry.
      if (_.has(pluginCommands, pcmd.pluginName)) {
        pluginCommands[pcmd.pluginName] = pluginCommands[pcmd.pluginName].concat(pcmd);
      } else {
        pluginCommands[pcmd.pluginName] = [pcmd];
      }

      // check for subcommands
      if ('commands' in cmd) {
        _.forEach(cmd.commands, (d) => {
          addToPluginCommands(d);
        });
      }
    };

    // fill up pluginCommands with commands in loadedCommands
    _.forEach(this.loadedCommands, (details) => {
      addToPluginCommands(details);
    });

    // sort plugins alphabetically
    pluginCommands = _(pluginCommands).toPairs().sortBy(0).fromPairs()
      .value();

    _.forEach(pluginCommands, (details, plugin) => {
      this.consoleLog(plugin);
      _.forEach(details, (cmd) => {
        // display command usage with single(1) indent
        this.displayCommandUsage(cmd, cmd.key.split(':').join(' '), 1);
      });
      this.consoleLog('');
    });
  }

  generateCommandsHelp(commandsArray) {
    const commandName = commandsArray.join(' ');

    // Get all the commands using getCommands() with filtered entrypoint
    // commands and reduce to the required command.
    const allCommands = this.serverless.pluginManager.getCommands();
    const command = _.reduce(commandsArray, (currentCmd, cmd) => {
      if (currentCmd.commands && cmd in currentCmd.commands) {
        return currentCmd.commands[cmd];
      }
      return null;
    }, { commands: allCommands });

    // Throw error if command not found.
    if (!command) {
      const errorMessage = [
        `Serverless command "${commandName}" not found.`,
        ' Run "serverless help" for a list of all available commands.',
      ].join('');
      throw new this.serverless.classes.Error(errorMessage);
    }

    // print the name of the plugin
    this.consoleLog(chalk.yellow.underline(`Plugin: ${command.pluginName}`));

    this.displayCommandUsage(command, commandName);
    this.displayCommandOptions(command);

    this.consoleLog('');
  }

  getVersionNumber() {
    this.consoleLog(version);
  }

  asciiGreeting() {
    let art = '';
    art = `${art} _______                             __${os.EOL}`;
    art = `${art}|   _   .-----.----.--.--.-----.----|  .-----.-----.-----.${os.EOL}`;
    art = `${art}|   |___|  -__|   _|  |  |  -__|   _|  |  -__|__ --|__ --|${os.EOL}`;
    art = `${art}|____   |_____|__|  \\___/|_____|__| |__|_____|_____|_____|${os.EOL}`;
    art = `${art}|   |   |             The Serverless Application Framework${os.EOL}`;
    art = `${art}|       |                           serverless.com, v${version}${os.EOL}`;
    art = `${art} -------'`;

    this.consoleLog(chalk.yellow(art));
    this.consoleLog('');
  }

  printDot() {
    process.stdout.write(chalk.yellow('.'));
  }

  log(message) {
    this.consoleLog(`Serverless: ${chalk.yellow(`${message}`)}`);
  }

  consoleLog(message) {
    console.log(message); // eslint-disable-line no-console
  }
}

module.exports = CLI;


/***/ }),
/* 51 */
/***/ (function(module, exports) {

module.exports = require("minimist");

/***/ }),
/* 52 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


const _ = __webpack_require__(5);
const path = __webpack_require__(0);
const rootPath = __webpack_require__(13);

class Config {

  constructor(serverless, config) {
    this.serverless = serverless;
    this.serverlessPath = path.join(rootPath);

    if (config) this.update(config);
  }

  update(config) {
    return _.merge(this, config);
  }
}

module.exports = Config;


/***/ }),
/* 53 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


const path = __webpack_require__(0);
const YAML = __webpack_require__(8);
const resolve = __webpack_require__(54).resolveRefs;

class YamlParser {

  constructor(serverless) {
    this.serverless = serverless;
  }

  parse(yamlFilePath) {
    let parentDir = yamlFilePath.split(path.sep);
    parentDir.pop();
    parentDir = parentDir.join('/');
    process.chdir(parentDir);

    const root = this.serverless.utils.readFileSync(yamlFilePath);
    const options = {
      filter: ['relative', 'remote'],
      loaderOptions: {
        processContent: (res, callback) => {
          callback(null, YAML.load(res.text));
        },
      },
    };
    return resolve(root, options).then((res) => (res.resolved));
  }
}

module.exports = YamlParser;


/***/ }),
/* 54 */
/***/ (function(module, exports) {

module.exports = require("json-refs");

/***/ }),
/* 55 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
/* WEBPACK VAR INJECTION */(function(module) {

const path = __webpack_require__(0);
const Module = __webpack_require__(57);
const BbPromise = __webpack_require__(3);
const _ = __webpack_require__(5);
const writeFile = __webpack_require__(58);
const getCacheFilePath = __webpack_require__(59);
const getServerlessConfigFile = __webpack_require__(60);
const crypto = __webpack_require__(21);
const rootPath = __webpack_require__(13);

class PluginManager {
  constructor(serverless) {
    this.serverless = serverless;

    this.cliOptions = {};
    this.cliCommands = [];

    this.plugins = [];
    this.commands = {};
    this.hooks = {};
    this.deprecatedEvents = {};
  }

  setCliOptions(options) {
    this.cliOptions = options;
  }

  setCliCommands(commands) {
    this.cliCommands = commands;
  }

  addPlugin(Plugin) {
    const pluginInstance = new Plugin(this.serverless, this.cliOptions);

    let pluginProvider = null;
    // check if plugin is provider agnostic
    if (pluginInstance.provider) {
      if (typeof pluginInstance.provider === 'string') {
        pluginProvider = pluginInstance.provider;
      } else if (typeof pluginInstance.provider === 'object') {
        pluginProvider = pluginInstance.provider.constructor.getProviderName();
      }
    }

    // ignore plugins that specify a different provider than the current one
    if (pluginProvider
      && (pluginProvider !== this.serverless.service.provider.name)) {
      return;
    }

    // don't load plugins twice
    const loadedPlugins = this.plugins.map(plugin => plugin.constructor.name);
    if (_.includes(loadedPlugins, Plugin.name)) return;

    this.loadCommands(pluginInstance);
    this.loadHooks(pluginInstance);

    this.plugins.push(pluginInstance);
  }

  loadAllPlugins(servicePlugins) {
    this.loadCorePlugins();
    this.loadServicePlugins(servicePlugins);
  }

  loadPlugins(plugins) {
    plugins.forEach((plugin) => {
      try {
        const Plugin = !(function webpackMissingModule() { var e = new Error("Cannot find module \".\""); e.code = 'MODULE_NOT_FOUND'; throw e; }()); // eslint-disable-line global-require

        this.addPlugin(Plugin);
      } catch (error) {
        // Rethrow the original error in case we're in debug mode.
        if (process.env.SLS_DEBUG) {
          throw error;
        }

        const errorMessage = [
          `Serverless plugin "${plugin}" not found.`,
          ' Make sure it\'s installed and listed in the "plugins" section',
          ' of your serverless config file.',
        ].join('');

        if (!this.cliOptions.help) {
          throw new this.serverless.classes.Error(errorMessage);
        }

        this.serverless.cli.log(`WARNING: ${errorMessage}\n`);
      }
    });
  }

  loadCorePlugins() {
    const pluginsDirectoryPath = path.join(rootPath, 'plugins');
    const corePlugins = this.serverless.utils
      .readFileSync(path.join(pluginsDirectoryPath, 'Plugins.json')).plugins
      .map((corePluginPath) => path.join(pluginsDirectoryPath, corePluginPath));

    this.loadPlugins(corePlugins);
  }

  loadServicePlugins(servicePlugs) {
    const servicePlugins = Array.isArray(servicePlugs) ? servicePlugs : [];

    // eslint-disable-next-line no-underscore-dangle
    module.paths = Module._nodeModulePaths(process.cwd());

    // we want to load plugins installed locally in the service
    if (this.serverless && this.serverless.config && this.serverless.config.servicePath) {
      module.paths.unshift(path.join(this.serverless.config.servicePath, '.serverless_plugins'));
    }

    this.loadPlugins(servicePlugins);
  }

  loadCommand(pluginName, details, key) {
    const commands = _.mapValues(details.commands, (subDetails, subKey) =>
      this.loadCommand(pluginName, subDetails, `${key}:${subKey}`)
    );
    return _.assign({}, details, { key, pluginName, commands });
  }

  loadCommands(pluginInstance) {
    const pluginName = pluginInstance.constructor.name;
    _.forEach(pluginInstance.commands, (details, key) => {
      const command = this.loadCommand(pluginName, details, key);
      // Grab and extract deprecated events
      command.lifecycleEvents = _.map(command.lifecycleEvents, event => {
        if (_.startsWith(event, 'deprecated#')) {
          // Extract event and optional redirect
          const transformedEvent = /^deprecated#(.*?)(?:->(.*?))?$/.exec(event);
          this.deprecatedEvents[`${command.key}:${transformedEvent[1]}`] =
            transformedEvent[2] || null;
          return transformedEvent[1];
        }
        return event;
      });
      this.commands[key] = _.merge({}, this.commands[key], command);
    });
  }

  loadHooks(pluginInstance) {
    const pluginName = pluginInstance.constructor.name;
    _.forEach(pluginInstance.hooks, (hook, event) => {
      let target = event;
      const baseEvent = _.replace(event, /^(?:after:|before:)/, '');
      if (_.has(this.deprecatedEvents, baseEvent)) {
        const redirectedEvent = this.deprecatedEvents[baseEvent];
        if (process.env.SLS_DEBUG) {
          this.serverless.cli.log(`WARNING: Plugin ${pluginName} uses deprecated hook ${event},
                     use ${redirectedEvent} hook instead`);
        }
        if (redirectedEvent) {
          target = _.replace(event, baseEvent, redirectedEvent);
        }
      }
      this.hooks[target] = this.hooks[target] || [];
      this.hooks[target].push({
        pluginName,
        hook,
      });
    });
  }

  getCommands() {
    const result = {};

    // Iterate through the commands and stop at entrypoints to include only public
    // command throughout the hierarchy.
    const stack = [{ commands: this.commands, target: result }];
    while (!_.isEmpty(stack)) {
      const currentCommands = stack.pop();
      const commands = currentCommands.commands;
      const target = currentCommands.target;
      _.forOwn(commands, (command, name) => {
        if (command.type !== 'entrypoint') {
          _.set(target, name, _.omit(command, 'commands'));
          if (_.some(command.commands, childCommand => childCommand.type !== 'entrypoint')) {
            target[name].commands = {};
            stack.push({ commands: command.commands, target: target[name].commands });
          }
        }
      });
    }
    return result;
  }

  /**
   * Retrieve the command specified by a command list. The method can be configured
   * to include entrypoint commands (which are invisible to the CLI and can only
   * be used by plugins).
   * @param commandsArray {Array<String>} Commands
   * @param allowEntryPoints {undefined|boolean} Allow entrypoint commands to be returned
   * @returns {Object} Command
   */
  getCommand(commandsArray, allowEntryPoints) {
    return _.reduce(commandsArray, (current, name, index) => {
      if (name in current.commands &&
         (allowEntryPoints || current.commands[name].type !== 'entrypoint')) {
        return current.commands[name];
      }
      const commandName = commandsArray.slice(0, index + 1).join(' ');
      const errorMessage = `Serverless command "${commandName}" not found

  Run "serverless help" for a list of all available commands.`;
      throw new this.serverless.classes.Error(errorMessage);
    }, { commands: this.commands });
  }

  getEvents(command) {
    return _.flatMap(command.lifecycleEvents, (event) => [
      `before:${command.key}:${event}`,
      `${command.key}:${event}`,
      `after:${command.key}:${event}`,
    ]);
  }

  getPlugins() {
    return this.plugins;
  }

  getHooks(events) {
    return _.flatMap([].concat(events), (event) => this.hooks[event] || []);
  }

  invoke(commandsArray, allowEntryPoints) {
    const command = this.getCommand(commandsArray, allowEntryPoints);

    this.convertShortcutsIntoOptions(command);
    this.assignDefaultOptions(command);
    this.validateOptions(command);

    const events = this.getEvents(command);
    const hooks = this.getHooks(events);

    if (hooks.length === 0 && process.env.SLS_DEBUG) {
      const warningMessage = 'Warning: The command you entered did not catch on any hooks';
      this.serverless.cli.log(warningMessage);
    }

    return BbPromise.reduce(hooks, (__, hook) => hook.hook(), null);
  }

  /**
   * Invokes the given command and starts the command's lifecycle.
   * This method can be called by plugins directly to spawn a separate sub lifecycle.
   */
  spawn(commandsArray) {
    let commands = commandsArray;
    if (_.isString(commandsArray)) {
      commands = _.split(commandsArray, ':');
    }
    return this.invoke(commands, true);
  }

  /**
   * Called by the CLI to start a public command.
   */
  run(commandsArray) {
    return this.invoke(commandsArray);
  }

  /**
   * Check if the command is valid. Internally this function will only find
   * CLI accessible commands (command.type !== 'entrypoint')
   */
  validateCommand(commandsArray) {
    this.getCommand(commandsArray);
  }

  validateOptions(command) {
    _.forEach(command.options, (value, key) => {
      if (value.required && (this.cliOptions[key] === true || !(this.cliOptions[key]))) {
        let requiredThings = `the --${key} option`;

        if (value.shortcut) {
          requiredThings += ` / -${value.shortcut} shortcut`;
        }
        let errorMessage = `This command requires ${requiredThings}.`;

        if (value.usage) {
          errorMessage = `${errorMessage} Usage: ${value.usage}`;
        }

        throw new this.serverless.classes.Error(errorMessage);
      }

      if (_.isPlainObject(value.customValidation) &&
        value.customValidation.regularExpression instanceof RegExp &&
        typeof value.customValidation.errorMessage === 'string' &&
        !value.customValidation.regularExpression.test(this.cliOptions[key])) {
        throw new this.serverless.classes.Error(value.customValidation.errorMessage);
      }
    });
  }

  updateAutocompleteCacheFile() {
    const commands = _.clone(this.getCommands());
    const cacheFile = {
      commands: {},
      validationHash: '',
    };

    _.forEach(commands, (commandObj, commandName) => {
      const command = commandObj;
      if (!command.options) {
        command.options = {};
      }
      if (!command.commands) {
        command.commands = {};
      }
      cacheFile.commands[commandName] = Object.keys(command.options)
        .map(option => `--${option}`)
        .concat(Object.keys(command.commands));
    });

    const servicePath = this.serverless.config.servicePath || 'x';
    return getServerlessConfigFile(servicePath)
      .then((serverlessConfigFile) => {
        const serverlessConfigFileHash = crypto.createHash('sha256')
          .update(JSON.stringify(serverlessConfigFile)).digest('hex');
        cacheFile.validationHash = serverlessConfigFileHash;
        const cacheFilePath = getCacheFilePath(servicePath);
        return writeFile(cacheFilePath, cacheFile);
      })
      .catch((e) => null);  // eslint-disable-line
  }

  convertShortcutsIntoOptions(command) {
    _.forEach(command.options, (optionObject, optionKey) => {
      if (optionObject.shortcut && _.includes(Object.keys(this.cliOptions),
          optionObject.shortcut)) {
        Object.keys(this.cliOptions).forEach((option) => {
          if (option === optionObject.shortcut) {
            this.cliOptions[optionKey] = this.cliOptions[option];
          }
        });
      }
    });
  }

  assignDefaultOptions(command) {
    _.forEach(command.options, (value, key) => {
      if (value.default && (!this.cliOptions[key] || this.cliOptions[key] === true)) {
        this.cliOptions[key] = value.default;
      }
    });
  }
}

module.exports = PluginManager;

/* WEBPACK VAR INJECTION */}.call(exports, __webpack_require__(56)(module)))

/***/ }),
/* 56 */
/***/ (function(module, exports) {

module.exports = function(module) {
	if(!module.webpackPolyfill) {
		module.deprecate = function() {};
		module.paths = [];
		// module.parent = undefined by default
		if(!module.children) module.children = [];
		Object.defineProperty(module, "loaded", {
			enumerable: true,
			get: function() {
				return module.l;
			}
		});
		Object.defineProperty(module, "id", {
			enumerable: true,
			get: function() {
				return module.i;
			}
		});
		module.webpackPolyfill = 1;
	}
	return module;
};


/***/ }),
/* 57 */
/***/ (function(module, exports) {

module.exports = require("module");

/***/ }),
/* 58 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


const path = __webpack_require__(0);
const YAML = __webpack_require__(8);
const fse = __webpack_require__(6);

function writeFile(filePath, conts) {
  let contents = conts || '';

  return fse.mkdirsAsync(path.dirname(filePath))
    .then(() => {
      if (filePath.indexOf('.json') !== -1 && typeof contents !== 'string') {
        contents = JSON.stringify(contents, null, 2);
      }

      const yamlFileExists = (filePath.indexOf('.yaml') !== -1);
      const ymlFileExists = (filePath.indexOf('.yml') !== -1);

      if ((yamlFileExists || ymlFileExists) && typeof contents !== 'string') {
        contents = YAML.dump(contents);
      }

      return fse.writeFileAsync(filePath, contents);
    });
}

module.exports = writeFile;


/***/ }),
/* 59 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


const homedir = __webpack_require__(4).homedir();
const path = __webpack_require__(0);
const crypto = __webpack_require__(21);

const getCacheFilePath = function (servicePath) {
  const servicePathHash = crypto.createHash('sha256').update(servicePath).digest('hex');
  return path.join(homedir, '.serverless', 'cache', servicePathHash, 'autocomplete.json');
};

module.exports = getCacheFilePath;


/***/ }),
/* 60 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


const _ = __webpack_require__(5);
const BbPromise = __webpack_require__(3);
const path = __webpack_require__(0);
const fileExists = __webpack_require__(22);
const readFile = __webpack_require__(23);

const getServerlessConfigFile = _.memoize((servicePath) => {
  const jsonPath = path.join(servicePath, 'serverless.json');
  const ymlPath = path.join(servicePath, 'serverless.yml');
  const yamlPath = path.join(servicePath, 'serverless.yaml');

  return BbPromise.props({
    json: fileExists(jsonPath),
    yml: fileExists(ymlPath),
    yaml: fileExists(yamlPath),
  }).then((exists) => {
    if (exists.json) {
      return readFile(jsonPath);
    } else if (exists.yml) {
      return readFile(ymlPath);
    } else if (exists.yaml) {
      return readFile(yamlPath);
    }
    return '';
  });
});

module.exports = getServerlessConfigFile;


/***/ }),
/* 61 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


const fs = __webpack_require__(2);
const path = __webpack_require__(0);
const ci = __webpack_require__(26);
const BbPromise = __webpack_require__(3);
const fse = BbPromise.promisifyAll(__webpack_require__(20));
const _ = __webpack_require__(5);
const fileExistsSync = __webpack_require__(14);
const writeFileSync = __webpack_require__(62);
const readFileSync = __webpack_require__(15);
const walkDirSync = __webpack_require__(63);
const isDockerContainer = __webpack_require__(64);
const version = __webpack_require__(7).version;
const segment = __webpack_require__(65);
const configUtils = __webpack_require__(16);

class Utils {
  constructor(serverless) {
    this.serverless = serverless;
  }

  getVersion() {
    return version;
  }

  dirExistsSync(dirPath) {
    try {
      const stats = fse.statSync(dirPath);
      return stats.isDirectory();
    } catch (e) {
      return false;
    }
  }

  fileExistsSync(filePath) {
    return fileExistsSync(filePath);
  }

  writeFileDir(filePath) {
    return fse.mkdirsSync(path.dirname(filePath));
  }

  writeFileSync(filePath, contents) {
    return writeFileSync(filePath, contents);
  }

  writeFile(filePath, contents) {
    const that = this;
    return new BbPromise((resolve, reject) => {
      try {
        that.writeFileSync(filePath, contents);
      } catch (e) {
        reject(e);
      }
      resolve();
    });
  }

  appendFileSync(filePath, conts) {
    const contents = conts || '';

    return new BbPromise((resolve, reject) => {
      try {
        fs.appendFileSync(filePath, contents);
      } catch (e) {
        reject(e);
      }
      resolve();
    });
  }

  readFileSync(filePath) {
    return readFileSync(filePath);
  }

  readFile(filePath) {
    const that = this;
    let contents;
    return new BbPromise((resolve, reject) => {
      try {
        contents = that.readFileSync(filePath);
      } catch (e) {
        reject(e);
      }
      resolve(contents);
    });
  }

  walkDirSync(dirPath) {
    return walkDirSync(dirPath);
  }

  copyDirContentsSync(srcDir, destDir) {
    const fullFilesPaths = this.walkDirSync(srcDir);

    fullFilesPaths.forEach(fullFilePath => {
      const relativeFilePath = fullFilePath.replace(srcDir, '');
      fse.copySync(fullFilePath, path.join(destDir, relativeFilePath));
    });
  }

  generateShortId(length) {
    return Math.random().toString(36).substr(2, length);
  }

  findServicePath() {
    let servicePath = null;

    if (fileExistsSync(path.join(process.cwd(), 'serverless.yml'))) {
      servicePath = process.cwd();
    } else if (fileExistsSync(path.join(process.cwd(), 'serverless.yaml'))) {
      servicePath = process.cwd();
    } else if (fileExistsSync(path.join(process.cwd(), 'serverless.json'))) {
      servicePath = process.cwd();
    }

    return servicePath;
  }

  logStat(serverless, context) {
    // the context in which serverless was executed (e.g. "install", "usage", "uninstall", ...)
    context = context || 'usage'; //eslint-disable-line

    // Service values
    const service = serverless.service;
    const resources = service.resources;
    const provider = service.provider;
    const functions = service.functions;

    // CLI inputs
    const options = serverless.processedInput.options;
    const commands = serverless.processedInput.commands;

    return new BbPromise((resolve) => {
      const config = configUtils.getConfig();
      const userId = config.frameworkId;
      const trackingDisabled = config.trackingDisabled;
      const invocationId = serverless.invocationId;

      if (trackingDisabled) {
        return resolve();
      }

      let serviceName = '';
      if (service && service.service && service.service.name) {
        serviceName = service.service.name;
      } else if (service && (typeof service.service === 'string')) {
        serviceName = service.service;
      }

      // filter out the whitelisted options
      const whitelistedOptionKeys = ['help', 'disable', 'enable'];
      const optionKeys = Object.keys(options);

      const filteredOptionKeys = optionKeys.filter((key) =>
        whitelistedOptionKeys.indexOf(key) !== -1
      );

      const filteredOptions = {};
      filteredOptionKeys.forEach((key) => {
        filteredOptions[key] = options[key];
      });

      // function related information retrieval
      const numberOfFunctions = _.size(functions);

      const memorySizeAndTimeoutPerFunction = [];
      if (numberOfFunctions) {
        _.forEach(functions, (func) => {
          const memorySize = Number(func.memorySize)
            || Number(this.serverless.service.provider.memorySize)
            || 1024;
          const timeout = Number(func.timeout)
            || Number(this.serverless.service.provider.timeout)
            || 6;

          const memorySizeAndTimeoutObject = {
            memorySize,
            timeout,
          };

          memorySizeAndTimeoutPerFunction.push(memorySizeAndTimeoutObject);
        });
      }

      // event related information retrieval
      const numberOfEventsPerType = [];
      const eventNamesPerFunction = [];
      let hasIAMAuthorizer = false;
      let hasCustomAuthorizer = false;
      let hasCognitoAuthorizer = false;
      if (numberOfFunctions) {
        _.forEach(functions, (func) => {
          if (func.events) {
            const funcEventsArray = [];

            func.events.forEach((event) => {
              const name = Object.keys(event)[0];
              funcEventsArray.push(name);

              const alreadyPresentEvent = _.find(numberOfEventsPerType, { name });
              if (alreadyPresentEvent) {
                alreadyPresentEvent.count++;
              } else {
                numberOfEventsPerType.push({
                  name,
                  count: 1,
                });
              }

              // For HTTP events, see what authorizer types are enabled
              if (event.http && event.http.authorizer) {
                if ((typeof event.http.authorizer === 'string'
                    && event.http.authorizer.toUpperCase() === 'AWS_IAM')
                   || (event.http.authorizer.type
                       && event.http.authorizer.type.toUpperCase() === 'AWS_IAM')) {
                  hasIAMAuthorizer = true;
                }
                // There are three ways a user can specify a Custom authorizer:
                // 1) By listing the name of a function in the same service OR a function ARN for
                //    the authorizer property.
                // 2) By listing the name of a function in the same service for the name property
                //    in the authorizer object.
                // 3) By listing a function's ARN in the arn property of the authorizer object.
                if ((typeof event.http.authorizer === 'string'
                    && event.http.authorizer.toUpperCase() !== 'AWS_IAM'
                    && !event.http.authorizer.includes('arn:aws:cognito-idp'))
                   || event.http.authorizer.name
                   || (event.http.authorizer.arn
                       && event.http.authorizer.arn.includes('arn:aws:lambda'))) {
                  hasCustomAuthorizer = true;
                }
                if ((typeof event.http.authorizer === 'string'
                    && event.http.authorizer.includes('arn:aws:cognito-idp'))
                   || (event.http.authorizer.arn
                   && event.http.authorizer.arn.includes('arn:aws:cognito-idp'))) {
                  hasCognitoAuthorizer = true;
                }
              }
            });

            eventNamesPerFunction.push(funcEventsArray);
          }
        });
      }

      let hasCustomResourcesDefined = false;
      // check if configuration in resources.Resources is defined
      if ((resources && resources.Resources && Object.keys(resources.Resources).length)) {
        hasCustomResourcesDefined = true;
      }
      // check if configuration in resources.Outputs is defined
      if ((resources && resources.Outputs && Object.keys(resources.Outputs).length)) {
        hasCustomResourcesDefined = true;
      }

      let hasCustomVariableSyntaxDefined = false;
      const defaultVariableSyntax = '\\${([ ~:a-zA-Z0-9._\'",\\-\\/\\(\\)]+?)}';

      // check if the variableSyntax in the provider section is defined
      if (provider && provider.variableSyntax
        && provider.variableSyntax !== defaultVariableSyntax) {
        hasCustomVariableSyntaxDefined = true;
      }

      const data = {
        userId,
        event: 'framework_stat',
        properties: {
          version: 2,
          command: {
            name: commands.join(' '),
            filteredOptions,
            isRunInService: (!!serverless.config.servicePath),
          },
          service: {
            numberOfCustomPlugins: _.size(service.plugins),
            hasCustomResourcesDefined,
            hasVariablesInCustomSectionDefined: (!!service.custom),
            hasCustomVariableSyntaxDefined,
            name: serviceName,
          },
          provider: {
            name: provider.name,
            runtime: provider.runtime,
            stage: provider.stage,
            region: provider.region,
          },
          functions: {
            numberOfFunctions,
            memorySizeAndTimeoutPerFunction,
          },
          events: {
            numberOfEvents: numberOfEventsPerType.length,
            numberOfEventsPerType,
            eventNamesPerFunction,
          },
          general: {
            userId,
            context,
            invocationId,
            timestamp: (new Date()).getTime(),
            timezone: (new Date()).toString().match(/([A-Z]+[+-][0-9]+)/)[1],
            operatingSystem: process.platform,
            userAgent: (process.env.SERVERLESS_DASHBOARD) ? 'dashboard' : 'cli',
            serverlessVersion: serverless.version,
            nodeJsVersion: process.version,
            isDockerContainer: isDockerContainer(),
            isCISystem: ci.isCI,
            ciSystem: ci.name,
          },
        },
      };

      if (config.userId && data.properties && data.properties.general) {
        // add platformId to segment call
        data.properties.general.platformId = config.userId;
      }

      if (provider && provider.name && provider.name.toUpperCase() === 'AWS' && data.properties) {
        data.properties.aws = {
          hasIAMAuthorizer,
          hasCustomAuthorizer,
          hasCognitoAuthorizer,
        };
      }

      return resolve(data);
    }).then((data) => {
      if (data) {
        segment.track(data);
      }
    });
  }
}

module.exports = Utils;


/***/ }),
/* 62 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


const path = __webpack_require__(0);
const YAML = __webpack_require__(8);
const fse = __webpack_require__(6);

function writeFileSync(filePath, conts) {
  let contents = conts || '';

  fse.mkdirsSync(path.dirname(filePath));

  if (filePath.indexOf('.json') !== -1 && typeof contents !== 'string') {
    contents = JSON.stringify(contents, null, 2);
  }

  const yamlFileExists = (filePath.indexOf('.yaml') !== -1);
  const ymlFileExists = (filePath.indexOf('.yml') !== -1);

  if ((yamlFileExists || ymlFileExists) && typeof contents !== 'string') {
    contents = YAML.dump(contents);
  }

  return fse.writeFileSync(filePath, contents);
}

module.exports = writeFileSync;


/***/ }),
/* 63 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


const path = __webpack_require__(0);
const fs = __webpack_require__(2);

function walkDirSync(dirPath) {
  let filePaths = [];
  const list = fs.readdirSync(dirPath);
  list.forEach((filePathParam) => {
    let filePath = filePathParam;
    filePath = path.join(dirPath, filePath);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      filePaths = filePaths.concat(walkDirSync(filePath));
    } else {
      filePaths.push(filePath);
    }
  });

  return filePaths;
}

module.exports = walkDirSync;


/***/ }),
/* 64 */
/***/ (function(module, exports) {

module.exports = require("is-docker");

/***/ }),
/* 65 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


const BbPromise = __webpack_require__(3);
const fetch = __webpack_require__(66);
const isTrackingDisabled = __webpack_require__(67);

/* note segment call swallows errors */
function request(url, payload) {
  return fetch(url, {
    headers: {
      'content-type': 'application/json',
    },
    method: 'POST',
    timeout: '1000',
    body: JSON.stringify(payload),
  })
    .then((response) => response.json())
    .then(() => BbPromise.resolve())
    .catch(() => BbPromise.resolve());
}

function track(payload) {
  const TRACKING_IS_DISABLED = isTrackingDisabled();
  // exit early is tracking disabled
  if (TRACKING_IS_DISABLED) {
    return BbPromise.resolve();
  }
  return request('https://tracking.serverlessteam.com/v1/track', payload);
}

module.exports = {
  track,
};


/***/ }),
/* 66 */
/***/ (function(module, exports) {

module.exports = require("node-fetch");

/***/ }),
/* 67 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


const configUtils = __webpack_require__(16);

module.exports = function isTrackingDisabled() {
  return configUtils.get('trackingDisabled');
};


/***/ }),
/* 68 */
/***/ (function(module, exports) {

module.exports = require("write-file-atomic");

/***/ }),
/* 69 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


const path = __webpack_require__(0);
const uuid = __webpack_require__(70);
const readFileSync = __webpack_require__(15);
const removeFileSync = __webpack_require__(71);
const fileExistsSync = __webpack_require__(14);
const getServerlessDir = __webpack_require__(72);

const slsHomePath = getServerlessDir();
const statsEnabledFile = path.join(slsHomePath, 'stats-enabled');
const statsDisabledFile = path.join(slsHomePath, 'stats-disabled');

module.exports.configureTrack = function configureTrack() {
  // to be updated to .serverlessrc
  if (fileExistsSync(path.join(slsHomePath, 'stats-disabled'))) {
    return true;
  }
  return false;
};

/* Reuse existing tracking ID from stat file or generate new one */
module.exports.generateFrameworkId = function generateFrameworkId() {
  if (fileExistsSync(statsEnabledFile)) {
    const idFromStatsEnabled = readFileSync(statsEnabledFile).toString();
    if (idFromStatsEnabled) return idFromStatsEnabled;
  }
  if (fileExistsSync(statsDisabledFile)) {
    const idFromStatsDisabled = readFileSync(statsDisabledFile).toString();
    if (idFromStatsDisabled) return idFromStatsDisabled;
  }
  // no frameworkID, generate a new one
  return uuid.v1();
};

/* Remove old tracking files */
module.exports.removeLegacyFrameworkIdFiles = function cleanUp() {
  /* To be removed in future release */
  if (fileExistsSync(statsEnabledFile)) {
    removeFileSync(statsEnabledFile);
  }
  if (fileExistsSync(statsDisabledFile)) {
    removeFileSync(statsDisabledFile);
  }
};


/***/ }),
/* 70 */
/***/ (function(module, exports) {

module.exports = require("uuid");

/***/ }),
/* 71 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


const fse = __webpack_require__(6);

function removeFileSync(filePath) {
  return fse.removeSync(filePath);
}

module.exports = removeFileSync;


/***/ }),
/* 72 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


const path = __webpack_require__(0);
const os = __webpack_require__(4);

// get .serverless home path
function getServerlessDir() {
  return path.join(os.homedir(), '.serverless');
}

module.exports = getServerlessDir;


/***/ }),
/* 73 */
/***/ (function(module, exports) {

module.exports = require("rc");

/***/ }),
/* 74 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


const ServerlessError = __webpack_require__(17).ServerlessError;
const path = __webpack_require__(0);
const _ = __webpack_require__(5);
const BbPromise = __webpack_require__(3);
const semver = __webpack_require__(79);

class Service {
  constructor(serverless, data) {
    this.serverless = serverless;

    // Default properties
    this.service = null;
    this.serviceObject = null;
    this.provider = {
      stage: 'dev',
      region: 'us-east-1',
      variableSyntax: '\\${([ ~:a-zA-Z0-9._\'",\\-\\/\\(\\)]+?)}',
    };
    this.custom = {};
    this.plugins = [];
    this.functions = {};
    this.resources = {};
    this.package = {};

    if (data) this.update(data);
  }

  load(rawOptions) {
    const that = this;
    const options = rawOptions || {};
    options.stage = options.stage || options.s;
    options.region = options.region || options.r;
    const servicePath = this.serverless.config.servicePath;

    // skip if the service path is not found
    // because the user might be creating a new service
    if (!servicePath) {
      return BbPromise.resolve();
    }

    // List of supported service filename variants.
    // The order defines the precedence.
    const serviceFilenames = [
      'serverless.yaml',
      'serverless.yml',
      'serverless.json',
    ];

    const serviceFilePaths = _.map(serviceFilenames, filename => path.join(servicePath, filename));
    const serviceFileIndex = _.findIndex(serviceFilePaths,
      filename => this.serverless.utils.fileExistsSync(filename)
    );

    // Set the filename if found, otherwise set the preferred variant.
    const serviceFilePath = serviceFileIndex !== -1 ?
      serviceFilePaths[serviceFileIndex] :
      _.first(serviceFilePaths);
    const serviceFilename = serviceFileIndex !== -1 ?
      serviceFilenames[serviceFileIndex] :
      _.first(serviceFilenames);

    return that.serverless.yamlParser
      .parse(serviceFilePath)
      .then((serverlessFileParam) => {
        const serverlessFile = serverlessFileParam;
        // basic service level validation
        const version = this.serverless.utils.getVersion();
        const ymlVersion = serverlessFile.frameworkVersion;
        if (ymlVersion && !semver.satisfies(version, ymlVersion)) {
          const errorMessage = [
            `The Serverless version (${version}) does not satisfy the`,
            ` "frameworkVersion" (${ymlVersion}) in ${serviceFilename}`,
          ].join('');
          throw new ServerlessError(errorMessage);
        }
        if (!serverlessFile.service) {
          throw new ServerlessError(`"service" property is missing in ${serviceFilename}`);
        }
        if (_.isObject(serverlessFile.service) && !serverlessFile.service.name) {
          throw new ServerlessError(`"service" is missing the "name" property in ${serviceFilename}`);   // eslint-disable-line max-len
        }
        if (!serverlessFile.provider) {
          throw new ServerlessError(`"provider" property is missing in ${serviceFilename}`);
        }

        if (typeof serverlessFile.provider !== 'object') {
          const providerName = serverlessFile.provider;
          serverlessFile.provider = {
            name: providerName,
          };
        }

        if (_.isObject(serverlessFile.service)) {
          that.serviceObject = serverlessFile.service;
          that.service = serverlessFile.service.name;
        } else {
          that.serviceObject = { name: serverlessFile.service };
          that.service = serverlessFile.service;
        }

        that.custom = serverlessFile.custom;
        that.plugins = serverlessFile.plugins;
        that.resources = serverlessFile.resources;
        that.functions = serverlessFile.functions || {};

        // merge so that the default settings are still in place and
        // won't be overwritten
        that.provider = _.merge(that.provider, serverlessFile.provider);

        if (serverlessFile.package) {
          that.package.individually = serverlessFile.package.individually;
          that.package.path = serverlessFile.package.path;
          that.package.artifact = serverlessFile.package.artifact;
          that.package.exclude = serverlessFile.package.exclude;
          that.package.include = serverlessFile.package.include;
          that.package.excludeDevDependencies = serverlessFile.package.excludeDevDependencies;
        }

        return this;
      });
  }

  setFunctionNames(rawOptions) {
    const that = this;
    const options = rawOptions || {};
    options.stage = options.stage || options.s;
    options.region = options.region || options.r;

    // setup function.name property
    const stageNameForFunction = options.stage || this.provider.stage;
    _.forEach(that.functions, (functionObj, functionName) => {
      if (!functionObj.events) {
        that.functions[functionName].events = [];
      }

      if (!functionObj.name) {
        that.functions[functionName].name =
          `${that.service}-${stageNameForFunction}-${functionName}`;
      }
    });
  }

  mergeResourceArrays() {
    if (Array.isArray(this.resources)) {
      this.resources = this.resources.reduce((memo, value) => {
        if (value) {
          if (typeof value === 'object') {
            return _.merge(memo, value);
          }
          throw new Error(`Non-object value specified in resources array: ${value}`);
        }

        return memo;
      }, {});
    }
  }

  validate() {
    _.forEach(this.functions, (functionObj, functionName) => {
      if (!_.isArray(functionObj.events)) {
        throw new ServerlessError(`Events for "${functionName}" must be an array,` +
                          ` not an ${typeof functionObj.events}`);
      }
    });

    return this;
  }

  update(data) {
    return _.merge(this, data);
  }

  getServiceName() {
    return this.serviceObject.name;
  }

  getServiceObject() {
    return this.serviceObject;
  }

  getAllFunctions() {
    return Object.keys(this.functions);
  }

  getAllFunctionsNames() {
    return this.getAllFunctions().map((func) => this.getFunction(func).name);
  }

  getFunction(functionName) {
    if (functionName in this.functions) {
      return this.functions[functionName];
    }
    throw new ServerlessError(`Function "${functionName}" doesn't exist in this Service`);
  }

  getEventInFunction(eventName, functionName) {
    const event = this.getFunction(functionName).events
      .find(e => Object.keys(e)[0] === eventName);
    if (event) {
      return event;
    }
    throw new ServerlessError(`Event "${eventName}" doesn't exist in function "${functionName}"`);
  }

  getAllEventsInFunction(functionName) {
    return this.getFunction(functionName).events;
  }
}

module.exports = Service;


/***/ }),
/* 75 */
/***/ (function(module, exports, __webpack_require__) {

const raven = __webpack_require__(76);
const ci = __webpack_require__(26);
const configUtils = __webpack_require__(16);
const pkg = __webpack_require__(7);
const readFileIfExists = __webpack_require__(77);
const getTrackingConfigFileName = __webpack_require__(78);
const path = __webpack_require__(0);
const BbPromise = __webpack_require__(3);
const rootPath = __webpack_require__(13);

const SLS_DISABLE_ERROR_TRACKING = true;
const IS_CI = ci.isCI;

function initializeErrorReporter(invocationId) {
  const trackingConfigFilePath = path.join(rootPath, '..', getTrackingConfigFileName());
  return readFileIfExists(trackingConfigFilePath).then(trackingConfig => {
    const config = configUtils.getConfig();
    const trackingDisabled = config.trackingDisabled;
    // exit if tracking disabled or inside CI system
    if (!trackingConfig || SLS_DISABLE_ERROR_TRACKING || trackingDisabled || IS_CI) {
      return BbPromise.resolve();
    }

    const DSN = trackingConfig.sentryDSN;

    // initialize Error tracking
    raven.config(DSN, {
      environment: 'production',
      autoBreadcrumbs: true,
      release: pkg.version,
      extra: {
        frameworkId: config.frameworkId,
        invocationId,
      },
    });

    if (config.userId) {
      raven.setContext({
        user: {
          id: config.userId,
        },
      });
    }

    raven.disableConsoleAlerts();

    raven.install();

    return BbPromise.resolve();
  });
}

module.exports.initializeErrorReporter = initializeErrorReporter;

module.exports.raven = raven;


/***/ }),
/* 76 */
/***/ (function(module, exports) {

module.exports = require("raven");

/***/ }),
/* 77 */
/***/ (function(module, exports, __webpack_require__) {

const fileExists = __webpack_require__(22);
const readFile = __webpack_require__(23);
const BbPromise = __webpack_require__(3);

const readFileIfExists = function (filePath) {
  return fileExists(filePath)
    .then((exists) => {
      if (!exists) {
        return BbPromise.resolve(false);
      }
      return readFile(filePath);
    });
};

module.exports = readFileIfExists;


/***/ }),
/* 78 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


const getTrackingConfigFileName = function () {
  return 'tracking-config.json';
};

module.exports = getTrackingConfigFileName;


/***/ }),
/* 79 */
/***/ (function(module, exports) {

module.exports = require("semver");

/***/ }),
/* 80 */
/***/ (function(module, exports, __webpack_require__) {

"use strict";


const _ = __webpack_require__(5);
const path = __webpack_require__(0);
const replaceall = __webpack_require__(81);
const logWarning = __webpack_require__(17).logWarning;
const BbPromise = __webpack_require__(3);
const os = __webpack_require__(4);

class Variables {

  constructor(serverless) {
    this.serverless = serverless;
    this.service = this.serverless.service;

    this.overwriteSyntax = RegExp(/,/g);
    this.fileRefSyntax = RegExp(/^file\((~?[a-zA-Z0-9._\-/]+?)\)/g);
    this.envRefSyntax = RegExp(/^env:/g);
    this.optRefSyntax = RegExp(/^opt:/g);
    this.selfRefSyntax = RegExp(/^self:/g);
    this.cfRefSyntax = RegExp(/^cf:/g);
    this.s3RefSyntax = RegExp(/^s3:(.+?)\/(.+)$/);
    this.stringRefSynax = RegExp(/('.*')|(".*")/g);
  }

  loadVariableSyntax() {
    this.variableSyntax = RegExp(this.service.provider.variableSyntax, 'g');
  }

  populateService(processedOptions) {
    this.options = processedOptions || {};

    this.loadVariableSyntax();

    const variableSyntaxProperty = this.service.provider.variableSyntax;

    // temporally remove variable syntax from service otherwise it'll match
    this.service.provider.variableSyntax = true;

    this.serverless.service.serverless = null;

    return this.populateObject(this.service).then(() => {
      this.service.provider.variableSyntax = variableSyntaxProperty;
      this.serverless.service.serverless = this.serverless;
      return BbPromise.resolve(this.service);
    });
  }

  populateObject(objectToPopulate) {
    const populateAll = [];
    const deepMapValues = (object, callback, propertyPath) => {
      const deepMapValuesIteratee =
        (value, key) => deepMapValues(value, callback, propertyPath ? propertyPath
          .concat(key) : [key]);
      if (_.isArray(object)) {
        return _.map(object, deepMapValuesIteratee);
      } else if (_.isObject(object) &&
        !_.isDate(object) &&
        !_.isRegExp(object) &&
        !_.isFunction(object)) {
        return _.extend({}, object, _.mapValues(object, deepMapValuesIteratee));
      }
      return callback(object, propertyPath);
    };

    deepMapValues(objectToPopulate, (property, propertyPath) => {
      if (typeof property === 'string') {
        const populateSingleProperty = this.populateProperty(property, true)
          .then(newProperty => _.set(objectToPopulate, propertyPath, newProperty))
          .return();
        populateAll.push(populateSingleProperty);
      }
    });

    return BbPromise.all(populateAll).then(() => objectToPopulate);
  }

  populateProperty(propertyParam, populateInPlace) {
    let property;
    if (populateInPlace) {
      property = propertyParam;
    } else {
      property = _.cloneDeep(propertyParam);
    }
    const allValuesToPopulate = [];

    if (typeof property === 'string' && property.match(this.variableSyntax)) {
      property.match(this.variableSyntax).forEach((matchedString) => {
        const variableString = matchedString
          .replace(this.variableSyntax, (match, varName) => varName.trim())
          .replace(/\s/g, '');

        let singleValueToPopulate = null;
        if (variableString.match(this.overwriteSyntax)) {
          singleValueToPopulate = this.overwrite(variableString);
        } else {
          singleValueToPopulate = this.getValueFromSource(variableString)
            .then(valueToPopulate => {
              if (typeof valueToPopulate === 'object') {
                return this.populateObject(valueToPopulate);
              }
              return valueToPopulate;
            });
        }

        singleValueToPopulate = singleValueToPopulate.then(valueToPopulate => {
          this.warnIfNotFound(variableString, valueToPopulate);
          return this.populateVariable(property, matchedString, valueToPopulate)
            .then(newProperty => {
              property = newProperty;
              return BbPromise.resolve(property);
            });
        });

        allValuesToPopulate.push(singleValueToPopulate);
      });
      return BbPromise.all(allValuesToPopulate).then(() => {
        if (property !== this.service) {
          return this.populateProperty(property);
        }
        return BbPromise.resolve(property);
      });
    }
    // return property;
    return BbPromise.resolve(property);
  }

  populateVariable(propertyParam, matchedString, valueToPopulate) {
    let property = propertyParam;
    if (typeof valueToPopulate === 'string') {
      property = replaceall(matchedString, valueToPopulate, property);
    } else {
      if (property !== matchedString) {
        if (typeof valueToPopulate === 'number') {
          property = replaceall(matchedString, String(valueToPopulate), property);
        } else {
          const errorMessage = [
            'Trying to populate non string value into',
            ` a string for variable ${matchedString}.`,
            ' Please make sure the value of the property is a string.',
          ].join('');
          throw new this.serverless.classes
            .Error(errorMessage);
        }
        return BbPromise.resolve(property);
      }
      property = valueToPopulate;
    }
    return BbPromise.resolve(property);
  }

  overwrite(variableStringsString) {
    let finalValue;
    const variableStringsArray = variableStringsString.split(',');
    const allValuesFromSource = variableStringsArray
      .map(variableString => this.getValueFromSource(variableString));
    return BbPromise.all(allValuesFromSource).then(valuesFromSources => {
      valuesFromSources.find(valueFromSource => {
        finalValue = valueFromSource;
        return (finalValue !== null && typeof finalValue !== 'undefined') &&
          !(typeof finalValue === 'object' && _.isEmpty(finalValue));
      });
      return BbPromise.resolve(finalValue);
    });
  }

  getValueFromSource(variableString) {
    if (variableString.match(this.envRefSyntax)) {
      return this.getValueFromEnv(variableString);
    } else if (variableString.match(this.optRefSyntax)) {
      return this.getValueFromOptions(variableString);
    } else if (variableString.match(this.selfRefSyntax)) {
      return this.getValueFromSelf(variableString);
    } else if (variableString.match(this.fileRefSyntax)) {
      return this.getValueFromFile(variableString);
    } else if (variableString.match(this.cfRefSyntax)) {
      return this.getValueFromCf(variableString);
    } else if (variableString.match(this.s3RefSyntax)) {
      return this.getValueFromS3(variableString);
    } else if (variableString.match(this.stringRefSynax)) {
      return this.getValueFromString(variableString);
    }
    const errorMessage = [
      `Invalid variable reference syntax for variable ${variableString}.`,
      ' You can only reference env vars, options, & files.',
      ' You can check our docs for more info.',
    ].join('');
    throw new this.serverless.classes.Error(errorMessage);
  }

  getValueFromEnv(variableString) {
    const requestedEnvVar = variableString.split(':')[1];
    let valueToPopulate;
    if (requestedEnvVar !== '' || '' in process.env) {
      valueToPopulate = process.env[requestedEnvVar];
    } else {
      valueToPopulate = process.env;
    }
    return BbPromise.resolve(valueToPopulate);
  }

  getValueFromString(variableString) {
    const valueToPopulate = variableString.replace(/'/g, '');
    return BbPromise.resolve(valueToPopulate);
  }

  getValueFromOptions(variableString) {
    const requestedOption = variableString.split(':')[1];
    let valueToPopulate;
    if (requestedOption !== '' || '' in this.options) {
      valueToPopulate = this.options[requestedOption];
    } else {
      valueToPopulate = this.options;
    }
    return BbPromise.resolve(valueToPopulate);
  }

  getValueFromSelf(variableString) {
    const valueToPopulate = this.service;
    const deepProperties = variableString.split(':')[1].split('.');
    return this.getDeepValue(deepProperties, valueToPopulate);
  }

  getValueFromFile(variableString) {
    const matchedFileRefString = variableString.match(this.fileRefSyntax)[0];
    const referencedFileRelativePath = matchedFileRefString
      .replace(this.fileRefSyntax, (match, varName) => varName.trim())
      .replace('~', os.homedir());

    const referencedFileFullPath = (path.isAbsolute(referencedFileRelativePath) ?
        referencedFileRelativePath :
        path.join(this.serverless.config.servicePath, referencedFileRelativePath));
    let fileExtension = referencedFileRelativePath.split('.');
    fileExtension = fileExtension[fileExtension.length - 1];
    // Validate file exists
    if (!this.serverless.utils.fileExistsSync(referencedFileFullPath)) {
      return BbPromise.resolve(undefined);
    }

    let valueToPopulate;

    // Process JS files
    if (fileExtension === 'js') {
      const jsFile = !(function webpackMissingModule() { var e = new Error("Cannot find module \".\""); e.code = 'MODULE_NOT_FOUND'; throw e; }()); // eslint-disable-line global-require
      const variableArray = variableString.split(':');
      let returnValueFunction;
      if (variableArray[1]) {
        let jsModule = variableArray[1];
        jsModule = jsModule.split('.')[0];
        returnValueFunction = jsFile[jsModule];
      } else {
        returnValueFunction = jsFile;
      }

      if (typeof returnValueFunction !== 'function') {
        throw new this.serverless.classes
          .Error([
            'Invalid variable syntax when referencing',
            ` file "${referencedFileRelativePath}".`,
            ' Check if your javascript is exporting a function that returns a value.',
          ].join(''));
      }
      valueToPopulate = returnValueFunction.call(jsFile);

      return BbPromise.resolve(valueToPopulate).then(valueToPopulateResolved => {
        let deepProperties = variableString.replace(matchedFileRefString, '');
        deepProperties = deepProperties.slice(1).split('.');
        deepProperties.splice(0, 1);
        return this.getDeepValue(deepProperties, valueToPopulateResolved)
          .then(deepValueToPopulateResolved => {
            if (typeof deepValueToPopulateResolved === 'undefined') {
              const errorMessage = [
                'Invalid variable syntax when referencing',
                ` file "${referencedFileRelativePath}".`,
                ' Check if your javascript is returning the correct data.',
              ].join('');
              throw new this.serverless.classes
                .Error(errorMessage);
            }
            return BbPromise.resolve(deepValueToPopulateResolved);
          });
      });
    }

    // Process everything except JS
    if (fileExtension !== 'js') {
      valueToPopulate = this.serverless.utils.readFileSync(referencedFileFullPath);
      if (matchedFileRefString !== variableString) {
        let deepProperties = variableString
          .replace(matchedFileRefString, '');
        if (deepProperties.substring(0, 1) !== ':') {
          const errorMessage = [
            'Invalid variable syntax when referencing',
            ` file "${referencedFileRelativePath}" sub properties`,
            ' Please use ":" to reference sub properties.',
          ].join('');
          throw new this.serverless.classes
            .Error(errorMessage);
        }
        deepProperties = deepProperties.slice(1).split('.');
        return this.getDeepValue(deepProperties, valueToPopulate);
      }
    }
    return BbPromise.resolve(valueToPopulate);
  }

  getValueFromCf(variableString) {
    const variableStringWithoutSource = variableString.split(':')[1].split('.');
    const stackName = variableStringWithoutSource[0];
    const outputLogicalId = variableStringWithoutSource[1];
    return this.serverless.getProvider('aws')
      .request('CloudFormation',
        'describeStacks',
        { StackName: stackName },
        this.options.stage,
        this.options.region)
      .then(result => {
        const outputs = result.Stacks[0].Outputs;
        const output = outputs.find(x => x.OutputKey === outputLogicalId);

        if (output === undefined) {
          const errorMessage = [
            'Trying to request a non exported variable from CloudFormation.',
            ` Stack name: "${stackName}"`,
            ` Requested variable: "${outputLogicalId}".`,
          ].join('');
          throw new this.serverless.classes
            .Error(errorMessage);
        }

        return output.OutputValue;
      });
  }

  getValueFromS3(variableString) {
    const groups = variableString.match(this.s3RefSyntax);
    const bucket = groups[1];
    const key = groups[2];
    return this.serverless.getProvider('aws')
    .request('S3',
      'getObject',
      {
        Bucket: bucket,
        Key: key,
      },
      this.options.stage,
      this.options.region)
    .then(
      response => response.Body.toString(),
      err => {
        const errorMessage = `Error getting value for ${variableString}. ${err.message}`;
        throw new this.serverless.classes.Error(errorMessage);
      }
    );
  }

  getDeepValue(deepProperties, valueToPopulate) {
    return BbPromise.reduce(deepProperties, (computedValueToPopulateParam, subProperty) => {
      let computedValueToPopulate = computedValueToPopulateParam;
      if (typeof computedValueToPopulate === 'undefined') {
        computedValueToPopulate = {};
      } else if (subProperty !== '' || '' in computedValueToPopulate) {
        computedValueToPopulate = computedValueToPopulate[subProperty];
      }
      if (typeof computedValueToPopulate === 'string' &&
        computedValueToPopulate.match(this.variableSyntax)) {
        return this.populateProperty(computedValueToPopulate);
      }
      return BbPromise.resolve(computedValueToPopulate);
    }, valueToPopulate);
  }

  warnIfNotFound(variableString, valueToPopulate) {
    if (
      valueToPopulate === null ||
      typeof valueToPopulate === 'undefined' ||
      (typeof valueToPopulate === 'object' && _.isEmpty(valueToPopulate))
    ) {
      let varType;
      if (variableString.match(this.envRefSyntax)) {
        varType = 'environment variable';
      } else if (variableString.match(this.optRefSyntax)) {
        varType = 'option';
      } else if (variableString.match(this.selfRefSyntax)) {
        varType = 'service attribute';
      } else if (variableString.match(this.fileRefSyntax)) {
        varType = 'file';
      }
      logWarning(
        `A valid ${varType} to satisfy the declaration '${variableString}' could not be found.`
      );
    }
  }
}

module.exports = Variables;


/***/ }),
/* 81 */
/***/ (function(module, exports) {

module.exports = require("replaceall");

/***/ })
/******/ ]);