/*
 * EJS Embedded JavaScript templates
 * Copyright 2112 Matthew Eernisse (mde@fleegix.org)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *         http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
*/

'use strict';

/**
 * @file Embedded JavaScript templating engine.
 * @author Matthew Eernisse <mde@fleegix.org>
 * @author Tiancheng "Timothy" Gu <timothygu99@gmail.com>
 * @project EJS
 * @license {@link http://www.apache.org/licenses/LICENSE-2.0 Apache License, Version 2.0}
 */

/**
 * EJS internal functions.
 *
 * Technically this "module" lies in the same file as {@link module:ejs}, for
 * the sake of organization all the private functions re grouped into this
 * module.
 *
 * @module ejs-internal
 * @private
 */

/**
 * Embedded JavaScript templating engine.
 *
 * @module ejs
 * @public
 */

var fs = require('fs')
  , utils = require('./utils')
  , scopeOptionWarned = false
  , _VERSION_STRING = require('../package.json').version
  , _DEFAULT_DELIMITER = '%'
  , _DEFAULT_LOCALS_NAME = 'locals'
  , _REGEX_STRING = '(<%%|<%=|<%-|<%#|<%|%>|-%>)'
  , _OPTS = [ 'cache', 'filename', 'delimiter', 'scope', 'context'
            , 'debug', 'compileDebug', 'client', '_with'
            ]
  , _TRAILING_SEMCOL = /;\s*$/
  , _BOM = /^\uFEFF/;

/**
 * EJS template function cache. This can be a LRU object from lru-cache NPM
 * module. By default, it is {@link module:utils.cache}, a simple in-process
 * cache that grows continuously.
 *
 * @type {Cache}
 */

exports.cache = utils.cache;

/**
 * Name of the object containing the locals.
 *
 * This variable is overriden by {@link Options}`.localsName` if it is not
 * `undefined`.
 *
 * @type {String}
 * @public
 */

exports.localsName = _DEFAULT_LOCALS_NAME;

/**
 * Get the path to the included file from the parent file path and the
 * specified path.
 *
 * @param {String} name     specified path
 * @param {String} filename parent file path
 * @return {String}
 */

exports.resolveInclude = function(name, filename) {
  var path = require('path')
    , dirname = path.dirname
    , extname = path.extname
    , resolve = path.resolve
    , includePath = resolve(dirname(filename), name)
    , ext = extname(name);
  if (!ext) {
    includePath += '.ejs';
  }
  return includePath;
};

/**
 * Get the template from a string or a file, either compiled on-the-fly or
 * read from cache (if enabled), and cache the template if needed.
 *
 * If `template` is not set, the file specified in `options.filename` will be
 * read.
 *
 * If `options.cache` is true, this function reads the file from
 * `options.filename` so it must be set prior to calling this function.
 *
 * @memberof module:ejs-internal
 * @param {Options} options   compilation options
 * @param {String} [template] template source
 * @return {(TemplateFunction|ClientFunction)}
 * Depending on the value of `options.client`, either type might be returned.
 * @static
 */

function handleCache(options, template) {
  var fn
    , path = options.filename
    , hasTemplate = arguments.length > 1;

  if (options.cache) {
    if (!path) {
      throw new Error('cache option requires a filename');
    }
    fn = exports.cache.get(path);
    if (fn) {
      return fn;
    }
    if (!hasTemplate) {
      template = fs.readFileSync(path).toString().replace(_BOM, '');
    }
  }
  else if (!hasTemplate) {
    // istanbul ignore if: should not happen at all
    if (!path) {
      throw new Error('Internal EJS error: no file name or template '
                    + 'provided');
    }
    template = fs.readFileSync(path).toString().replace(_BOM, '');
  }
  fn = exports.compile(template, options);
  if (options.cache) {
    exports.cache.set(path, fn);
  }
  return fn;
}

/**
 * Get the template function.
 *
 * If `options.cache` is `true`, then the template is cached.
 *
 * @memberof module:ejs-internal
 * @param {String}  path    path for the specified file
 * @param {Options} options compilation options
 * @return {(TemplateFunction|ClientFunction)}
 * Depending on the value of `options.client`, either type might be returned
 * @static
 */

function includeFile(path, options) {
  var opts = utils.shallowCopy({}, options);
  if (!opts.filename) {
    throw new Error('`include` requires the \'filename\' option.');
  }
  opts.filename = exports.resolveInclude(path, opts.filename);
  return handleCache(opts);
}

/**
 * Get the JavaScript source of an included file.
 *
 * @memberof module:ejs-internal
 * @param {String}  path    path for the specified file
 * @param {Options} options compilation options
 * @return {String}
 * @static
 */

function includeSource(path, options) {
  var opts = utils.shallowCopy({}, options)
    , includePath
    , template;
  if (!opts.filename) {
    throw new Error('`include` requires the \'filename\' option.');
  }
  includePath = exports.resolveInclude(path, opts.filename);
  template = fs.readFileSync(includePath).toString().replace(_BOM, '');

  opts.filename = includePath;
  var templ = new Template(template, opts);
  templ.generateSource();
  return templ.source;
}

/**
 * Re-throw the given `err` in context to the `str` of ejs, `filename`, and
 * `lineno`.
 *
 * @implements RethrowCallback
 * @memberof module:ejs-internal
 * @param {Error}  err      Error object
 * @param {String} str      EJS source
 * @param {String} filename file name of the EJS file
 * @param {String} lineno   line number of the error
 * @static
 */

function rethrow(err, str, filename, lineno){
  var lines = str.split('\n')
    , start = Math.max(lineno - 3, 0)
    , end = Math.min(lines.length, lineno + 3);

  // Error context
  var context = lines.slice(start, end).map(function (line, i){
    var curr = i + start + 1;
    return (curr == lineno ? ' >> ' : '    ')
      + curr
      + '| '
      + line;
  }).join('\n');

  // Alter exception message
  err.path = filename;
  err.message = (filename || 'ejs') + ':'
    + lineno + '\n'
    + context + '\n\n'
    + err.message;

  throw err;
}

/**
 * Copy properties in data object that are recognized as options to an
 * options object.
 *
 * This is used for compatibility with earlier versions of EJS and Express.js.
 *
 * @memberof module:ejs-internal
 * @param {Object}  data data object
 * @param {Options} opts options object
 * @static
 */

function cpOptsInData(data, opts) {
  _OPTS.forEach(function (p) {
    if (typeof data[p] != 'undefined') {
      opts[p] = data[p];
    }
  });
}

/**
 * Compile the given `str` of ejs into a template function.
 *
 * @param {String}  template EJS template
 *
 * @param {Options} opts     compilation options
 *
 * @return {(TemplateFunction|ClientFunction)}
 * Depending on the value of `opts.client`, either type might be returned.
 * @public
 */

exports.compile = function compile(template, opts) {
  var templ;

  // v1 compat
  // 'scope' is 'context'
  // FIXME: Remove this in a future version
  if (opts && opts.scope) {
    if (!scopeOptionWarned){
      console.warn('`scope` option is deprecated and will be removed in EJS 3');
      scopeOptionWarned = true;
    }
    if (!opts.context) {
      opts.context = opts.scope;
    }
    delete opts.scope;
  }
  templ = new Template(template, opts);
  return templ.compile();
};

/**
 * Render the given `template` of ejs.
 *
 * If you would like to include options but not data, you need to explicitly
 * call this function with `data` being an empty object or `null`.
 *
 * @param {String}   template EJS template
 * @param {Object}  [data={}] template data
 * @param {Options} [opts={}] compilation and rendering options
 * @return {String}
 * @public
 */

exports.render = function (template, data, opts) {
  data = data || {};
  opts = opts || {};
  var fn;

  // No options object -- if there are optiony names
  // in the data, copy them to options
  if (arguments.length == 2) {
    cpOptsInData(data, opts);
  }

  return handleCache(opts, template)(data);
};

/**
 * Render an EJS file at the given `path` and callback `cb(err, str)`.
 *
 * If you would like to include options but not data, you need to explicitly
 * call this function with `data` being an empty object or `null`.
 *
 * @param {String}             path     path to the EJS file
 * @param {Object}            [data={}] template data
 * @param {Options}           [opts={}] compilation and rendering options
 * @param {RenderFileCallback} cb callback
 * @public
 */

exports.renderFile = function () {
  var args = Array.prototype.slice.call(arguments)
    , path = args.shift()
    , cb = args.pop()
    , data = args.shift() || {}
    , opts = args.pop() || {}
    , result;

  // Don't pollute passed in opts obj with new vals
  opts = utils.shallowCopy({}, opts);

  // No options object -- if there are optiony names
  // in the data, copy them to options
  if (arguments.length == 3) {
    cpOptsInData(data, opts);
  }
  opts.filename = path;

  try {
    result = handleCache(opts)(data);
  }
  catch(err) {
    return cb(err);
  }
  return cb(null, result);
};

/**
 * Clear intermediate JavaScript cache. Calls {@link Cache#reset}.
 * @public
 */

exports.clearCache = function () {
  exports.cache.reset();
};

function Template(text, opts) {
  opts = opts || {};
  var options = {};
  this.templateText = text;
  this.mode = null;
  this.truncate = false;
  this.currentLine = 1;
  this.source = '';
  this.dependencies = [];
  options.client = opts.client || false;
  options.escapeFunction = opts.escape || utils.escapeXML;
  options.compileDebug = opts.compileDebug !== false;
  options.debug = !!opts.debug;
  options.filename = opts.filename;
  options.delimiter = opts.delimiter || exports.delimiter || _DEFAULT_DELIMITER;
  options._with = typeof opts._with != 'undefined' ? opts._with : true;
  options.context = opts.context;
  options.cache = opts.cache || false;
  options.rmWhitespace = opts.rmWhitespace;
  this.opts = options;

  this.regex = this.createRegex();
}

Template.modes = {
  EVAL: 'eval'
, ESCAPED: 'escaped'
, RAW: 'raw'
, COMMENT: 'comment'
, LITERAL: 'literal'
};

Template.prototype = {
  createRegex: function () {
    var str = _REGEX_STRING
      , delim = utils.escapeRegExpChars(this.opts.delimiter);
    str = str.replace(/%/g, delim);
    return new RegExp(str);
  }

, compile: function () {
    var src
      , fn
      , opts = this.opts
      , prepended = ''
      , appended = ''
      , escape = opts.escapeFunction;

    if (opts.rmWhitespace) {
      // Have to use two separate replace here as `^` and `$` operators don't
      // work well with `\r`.
      this.templateText =
        this.templateText.replace(/\r/g, '').replace(/^\s+|\s+$/gm, '');
    }

    if (!this.source) {
      this.generateSource();
      prepended += '  var __output = [], __append = __output.push.bind(__output);' + '\n';
      if (opts._with !== false) {
        prepended +=  '  with (' + exports.localsName + ' || {}) {' + '\n';
        appended += '  }' + '\n';
      }
      appended += '  return __output.join("");' + '\n';
      this.source = prepended + this.source + appended;
    }

    if (opts.compileDebug) {
      src = 'var __line = 1' + '\n'
          + '  , __lines = ' + JSON.stringify(this.templateText) + '\n'
          + '  , __filename = ' + (opts.filename ?
                JSON.stringify(opts.filename) : 'undefined') + ';' + '\n'
          + 'try {' + '\n'
          + this.source
          + '} catch (e) {' + '\n'
          + '  rethrow(e, __lines, __filename, __line);' + '\n'
          + '}' + '\n';
    }
    else {
      src = this.source;
    }

    if (opts.debug) {
      console.log(src);
    }

    if (opts.client) {
      src = 'escape = escape || ' + escape.toString() + ';' + '\n' + src;
      if (opts.compileDebug) {
        src = 'rethrow = rethrow || ' + rethrow.toString() + ';' + '\n' + src;
      }
    }

    try {
      fn = new Function(exports.localsName + ', escape, include, rethrow', src);
    }
    catch(e) {
      // istanbul ignore else
      if (e instanceof SyntaxError) {
        if (opts.filename) {
          e.message += ' in ' + opts.filename;
        }
        e.message += ' while compiling ejs';
      }
      throw e;
    }

    if (opts.client) {
      fn.dependencies = this.dependencies;
      return fn;
    }

    // Return a callable function which will execute the function
    // created by the source-code, with the passed data as locals
    // Adds a local `include` function which allows full recursive include
    var returnedFn = function (data) {
      var include = function (path, includeData) {
        var d = utils.shallowCopy({}, data);
        if (includeData) {
          d = utils.shallowCopy(d, includeData);
        }
        return includeFile(path, opts)(d);
      };
      return fn.apply(opts.context, [data || {}, escape, include, rethrow]);
    };
    returnedFn.dependencies = this.dependencies;
    return returnedFn;
  }

, generateSource: function () {
    var self = this
      , matches = this.parseTemplateText()
      , d = this.opts.delimiter;

    if (matches && matches.length) {
      matches.forEach(function (line, index) {
        var opening
          , closing
          , include
          , includeOpts
          , includeSrc;
        // If this is an opening tag, check for closing tags
        // FIXME: May end up with some false positives here
        // Better to store modes as k/v with '<' + delimiter as key
        // Then this can simply check against the map
        if ( line.indexOf('<' + d) === 0        // If it is a tag
          && line.indexOf('<' + d + d) !== 0) { // and is not escaped
          closing = matches[index + 2];
          if (!(closing == d + '>' || closing == '-' + d + '>')) {
            throw new Error('Could not find matching close tag for "' + line + '".');
          }
        }
        // HACK: backward-compat `include` preprocessor directives
        if ((include = line.match(/^\s*include\s+(\S+)/))) {
          opening = matches[index - 1];
          // Must be in EVAL or RAW mode
          if (opening && (opening == '<' + d || opening == '<' + d + '-')) {
            includeOpts = utils.shallowCopy({}, self.opts);
            includeSrc = includeSource(include[1], includeOpts);
            includeSrc = '    ; (function(){' + '\n' + includeSrc +
                '    ; })()' + '\n';
            self.source += includeSrc;
            self.dependencies.push(exports.resolveInclude(include[1],
                includeOpts.filename));
            return;
          }
        }
        self.scanLine(line);
      });
    }

  }

, parseTemplateText: function () {
    var str = this.templateText
      , pat = this.regex
      , result = pat.exec(str)
      , arr = []
      , firstPos
      , lastPos;

    while (result) {
      firstPos = result.index;
      lastPos = pat.lastIndex;

      if (firstPos !== 0) {
        arr.push(str.substring(0, firstPos));
        str = str.slice(firstPos);
      }

      arr.push(result[0]);
      str = str.slice(result[0].length);
      result = pat.exec(str);
    }

    if (str) {
      arr.push(str);
    }

    return arr;
  }

, scanLine: function (line) {
    var self = this
      , d = this.opts.delimiter
      , newLineCount = 0;

    function _addOutput() {
      if (self.truncate) {
        line = line.replace('\n', '');
        self.truncate = false;
      }
      else if (self.opts.rmWhitespace) {
        // Gotta me more careful here.
        // .replace(/^(\s*)\n/, '$1') might be more appropriate here but as
        // rmWhitespace already removes trailing spaces anyway so meh.
        line = line.replace(/^\n/, '');
      }
      if (!line) {
        return;
      }

      // Preserve literal slashes
      line = line.replace(/\\/g, '\\\\');

      // Convert linebreaks
      line = line.replace(/\n/g, '\\n');
      line = line.replace(/\r/g, '\\r');

      // Escape double-quotes
      // - this will be the delimiter during execution
      line = line.replace(/"/g, '\\"');
      self.source += '    ; __append("' + line + '")' + '\n';
    }

    newLineCount = (line.split('\n').length - 1);

    switch (line) {
      case '<' + d:
        this.mode = Template.modes.EVAL;
        break;
      case '<' + d + '=':
        this.mode = Template.modes.ESCAPED;
        break;
      case '<' + d + '-':
        this.mode = Template.modes.RAW;
        break;
      case '<' + d + '#':
        this.mode = Template.modes.COMMENT;
        break;
      case '<' + d + d:
        this.mode = Template.modes.LITERAL;
        this.source += '    ; __append("' + line.replace('<' + d + d, '<' + d) + '")' + '\n';
        break;
      case d + '>':
      case '-' + d + '>':
        if (this.mode == Template.modes.LITERAL) {
          _addOutput();
        }

        this.mode = null;
        this.truncate = line.indexOf('-') === 0;
        break;
      default:
        // In script mode, depends on type of tag
        if (this.mode) {
          // If '//' is found without a line break, add a line break.
          switch (this.mode) {
            case Template.modes.EVAL:
            case Template.modes.ESCAPED:
            case Template.modes.RAW:
              if (line.lastIndexOf('//') > line.lastIndexOf('\n')) {
                line += '\n';
              }
          }
          switch (this.mode) {
            // Just executing code
            case Template.modes.EVAL:
              this.source += '    ; ' + line + '\n';
              break;
            // Exec, esc, and output
            case Template.modes.ESCAPED:
              this.source += '    ; __append(escape(' +
                line.replace(_TRAILING_SEMCOL, '').trim() + '))' + '\n';
              break;
            // Exec and output
            case Template.modes.RAW:
              this.source += '    ; __append(' +
                line.replace(_TRAILING_SEMCOL, '').trim() + ')' + '\n';
              break;
            case Template.modes.COMMENT:
              // Do nothing
              break;
            // Literal <%% mode, append as raw output
            case Template.modes.LITERAL:
              _addOutput();
              break;
          }
        }
        // In string mode, just add the output
        else {
          _addOutput();
        }
    }

    if (self.opts.compileDebug && newLineCount) {
      this.currentLine += newLineCount;
      this.source += '    ; __line = ' + this.currentLine + '\n';
    }
  }
};

/**
 * Express.js support.
 *
 * This is an alias for {@link module:ejs.renderFile}, in order to support
 * Express.js out-of-the-box.
 *
 * @func
 */

exports.__express = exports.renderFile;

// Add require support
/* istanbul ignore else */
if (require.extensions) {
  require.extensions['.ejs'] = function (module, filename) {
    filename = filename || /* istanbul ignore next */ module.filename;
    var options = {
          filename: filename
        , client: true
        }
      , template = fs.readFileSync(filename).toString()
      , fn = exports.compile(template, options);
    module._compile('module.exports = ' + fn.toString() + ';', filename);
  };
}

/**
 * Version of EJS.
 *
 * @readonly
 * @type {String}
 * @public
 */

exports.VERSION = _VERSION_STRING;

/* istanbul ignore if */
if (typeof window != 'undefined') {
  window.ejs = exports;
}
