var getType = require('should-type');
var util = require('./util');

function genKeysFunc(f) {
  return function(value) {
    var k = f(value);
    k.sort();
    return k;
  };
}


function Formatter(opts) {
  opts = opts || {};

  this.seen = [];
  this.keys = genKeysFunc(opts.keys === false ? Object.getOwnPropertyNames : Object.keys);

  this.maxLineLength = typeof opts.maxLineLength === 'number' ? opts.maxLineLength : 60;
  this.propSep = opts.propSep || ',';

  this.isUTCdate = !!opts.isUTCdate;
}

Formatter.prototype = {
  constructor: Formatter,

  format: function(value) {
    var t = getType(value);
    var name1 = t.type, name2 = t.type;
    if(t.cls) {
      name1 += '_' + t.cls;
      name2 += '_' + t.cls;
    }
    if(t.sub) {
      name2 += '_' + t.sub;
    }
    var f = this['_format_' + name2] || this['_format_' + name1] || this['_format_' + t.type] || this.defaultFormat;
    return f.call(this, value).trim();
  },

  _formatObject: function(value, opts) {
    opts = opts || {};
    var mainKeys = opts.keys || this.keys(value);

    var len = 0;

    var formatPropertyValue = opts.formatPropertyValue || this.formatPropertyValue;
    var formatPropertyName = opts.formatPropertyName || this.formatPropertyName;
    var keyValueSep = opts.keyValueSep || ': ';
    var keyFilter = opts.keyFilter || function() { return true; };

    this.seen.push(value);
    var keys = [];

    mainKeys.forEach(function(key) {
      if(!keyFilter(key)) return;

      var fName = formatPropertyName.call(this, key);

      var f = (fName ? fName + keyValueSep : '') + formatPropertyValue.call(this, value, key);
      len += f.length;
      keys.push(f);
    }, this);
    this.seen.pop();

    (opts.additionalProperties || []).forEach(function(keyValue) {
      var f = keyValue[0] + keyValueSep + this.format(keyValue[1]);
      len += f.length;
      keys.push(f);
    }, this);

    var prefix = opts.prefix || Formatter.constructorName(value) || '';
    if(prefix.length > 0) prefix += ' ';

    var lbracket, rbracket;
    if(Array.isArray(opts.brackets)) {
      lbracket = opts.brackets && opts.brackets[0];
      rbracket = opts.brackets && opts.brackets[1];
    } else {
      lbracket = '{';
      rbracket = '}';
    }

    var rootValue = opts.value || '';

    if(keys.length === 0)
      return rootValue || (prefix + lbracket + rbracket);

    if(len <= this.maxLineLength) {
      return prefix + lbracket + ' ' + (rootValue ? rootValue + ' ' : '') + keys.join(this.propSep + ' ') + ' ' + rbracket;
    } else {
      return prefix + lbracket + '\n' + (rootValue ? '  ' + rootValue + '\n' : '') + keys.map(util.addSpaces).join(this.propSep + '\n') + '\n' + rbracket;
    }
  },

  formatObject: function(value, prefix, props) {
    props = props || this.keys(value);

    var len = 0;

    this.seen.push(value);
    props = props.map(function(prop) {
      var f = this.formatProperty(value, prop);
      len += f.length;
      return f;
    }, this);
    this.seen.pop();

    if(props.length === 0) return '{}';

    if(len <= this.maxLineLength) {
      return '{ ' + (prefix ? prefix + ' ' : '') + props.join(this.propSep + ' ') + ' }';
    } else {
      return '{' + '\n' + (prefix ? '  ' + prefix + '\n' : '') + props.map(util.addSpaces).join(this.propSep + '\n') + '\n' + '}';
    }
  },

  formatPropertyName: function(name) {
    return name.match(/^[a-zA-Z_$][a-zA-Z_$0-9]*$/) ? name : this.format(name);
  },

  formatProperty: function(value, prop) {
    var desc = Formatter.getPropertyDescriptor(value, prop);

    var propName = this.formatPropertyName(prop);

    var propValue = desc.get && desc.set ?
      '[Getter/Setter]' : desc.get ?
      '[Getter]' : desc.set ?
      '[Setter]' : this.seen.indexOf(desc.value) >= 0 ?
      '[Circular]' :
      this.format(desc.value);

    return propName + ': ' + propValue;
  },

  formatPropertyValue: function(value, prop) {
    var desc = Formatter.getPropertyDescriptor(value, prop);

    var propValue = desc.get && desc.set ?
      '[Getter/Setter]' : desc.get ?
      '[Getter]' : desc.set ?
      '[Setter]' : this.seen.indexOf(desc.value) >= 0 ?
      '[Circular]' :
      this.format(desc.value);

    return propValue;
  }
};

Formatter.add = function add(type, cls, sub, f) {
  var args = Array.prototype.slice.call(arguments);
  f = args.pop();
  Formatter.prototype['_format_' + args.join('_')] = f;
};

Formatter.formatObjectWithPrefix = function formatObjectWithPrefix(f) {
  return function(value) {
    var prefix = f.call(this, value);
    var props = this.keys(value);
    if(props.length == 0) return prefix;
    else return this.formatObject(value, prefix, props);
  };
};

var functionNameRE = /^\s*function\s*(\S*)\s*\(/;

Formatter.functionName = function functionName(f) {
  if(f.name) {
    return f.name;
  }
  var name = f.toString().match(functionNameRE)[1];
  return name;
};

Formatter.constructorName = function(obj) {
  while (obj) {
    var descriptor = Object.getOwnPropertyDescriptor(obj, 'constructor');
    if (descriptor !== undefined &&
        typeof descriptor.value === 'function') {

        var name = Formatter.functionName(descriptor.value);
        if(name !== '') {
          return name;
        }
    }

    obj = Object.getPrototypeOf(obj);
  }
};

Formatter.getPropertyDescriptor = function(obj, value) {
  var desc;
  try {
    desc = Object.getOwnPropertyDescriptor(obj, value) || {value: obj[value]};
  } catch(e) {
    desc = {value: e};
  }
  return desc;
};

Formatter.generateFunctionForIndexedArray = function generateFunctionForIndexedArray(lengthProp, name, padding) {
  return function(value) {
    var max = this.byteArrayMaxLength || 50;
    var length = value[lengthProp];
    var formattedValues = [];
    var len = 0;
    for(var i = 0; i < max && i < length; i++) {
      var b = value[i] || 0;
      var v = util.pad0(b.toString(16), padding);
      len += v.length;
      formattedValues.push(v);
    }
    var prefix = value.constructor.name || name || '';
    if(prefix) prefix += ' ';

    if(formattedValues.length === 0)
      return prefix + '[]';

    if(len <= this.maxLineLength) {
      return prefix + '[ ' + formattedValues.join(this.propSep + ' ') + ' ' + ']';
    } else {
      return prefix + '[\n' + formattedValues.map(util.addSpaces).join(this.propSep + '\n') + '\n' + ']';
    }
  };
};

['undefined', 'boolean', 'null', 'symbol'].forEach(function(name) {
  Formatter.add(name, String);
});

['number', 'boolean'].forEach(function(name) {
  Formatter.add('object', name, function(value) {
    return this._formatObject(value, {
      additionalProperties: [['[[PrimitiveValue]]', value.valueOf()]]
    });
  });
});

Formatter.add('object', 'string', function(value) {
  var realValue = value.valueOf();

  return this._formatObject(value, {
    keyFilter: function(key) {
      //skip useless indexed properties
      return !(key.match(/\d+/) && parseInt(key, 10) < realValue.length);
    },
    additionalProperties: [['[[PrimitiveValue]]', realValue]]
  });
});

Formatter.add('object', 'regexp', function(value) {
  return this._formatObject(value, {
    value: String(value)
  });
});

Formatter.add('number', function(value) {
  if(value === 0 && 1 / value < 0) return '-0';
  return String(value);
});

Formatter.add('string', function(value) {
  return '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
      .replace(/'/g, "\\'")
      .replace(/\\"/g, '"') + '\'';
});

Formatter.add('object', function(value) {
  return this._formatObject(value);
});

Formatter.add('object', 'arguments', function(value) {
  return this._formatObject(value, {
    prefix: 'Arguments',
    formatPropertyName: function(key) {
      if(!key.match(/\d+/)) {
        return this.formatPropertyName(key);
      }
    },
    brackets: ['[', ']']
  });
});

Formatter.add('object', 'array', function(value) {
  return this._formatObject(value, {
    formatPropertyName: function(key) {
      if(!key.match(/\d+/)) {
        return this.formatPropertyName(key);
      }
    },
    brackets: ['[', ']']
  });
});


function formatDate(value, isUTC) {
  var prefix = isUTC ? 'UTC' : '';

  var date = value['get' + prefix + 'FullYear']() +
    '-' +
    util.pad0(value['get' + prefix + 'Month']() + 1, 2) +
    '-' +
    util.pad0(value['get' + prefix + 'Date'](), 2);

  var time = util.pad0(value['get' + prefix + 'Hours'](), 2) +
    ':' +
    util.pad0(value['get' + prefix + 'Minutes'](), 2) +
    ':' +
    util.pad0(value['get' + prefix + 'Seconds'](), 2) +
    '.' +
    util.pad0(value['get' + prefix + 'Milliseconds'](), 3);

  var to = value.getTimezoneOffset();
  var absTo = Math.abs(to);
  var hours = Math.floor(absTo / 60);
  var minutes = absTo - hours * 60;
  var tzFormat = (to < 0 ? '+' : '-') + util.pad0(hours, 2) + util.pad0(minutes, 2);

  return date + ' ' + time + (isUTC ? '' : ' ' + tzFormat);
}

Formatter.add('object', 'date', function(value) {
  return this._formatObject(value, { value: formatDate(value, this.isUTCdate) });
});

Formatter.add('function', function(value) {
  return this._formatObject(value, {
    additionalProperties: [['name', Formatter.functionName(value)]]
  });
});

Formatter.add('object', 'error', function(value) {
  return this._formatObject(value, {
    prefix: value.name,
    additionalProperties: [['message', value.message]]
  });
});

Formatter.add('object', 'buffer', Formatter.generateFunctionForIndexedArray('length', 'Buffer', 2));

Formatter.add('object', 'array-buffer', Formatter.generateFunctionForIndexedArray('byteLength', 'ArrayBuffer', 2));

Formatter.add('object', 'typed-array', 'int8', Formatter.generateFunctionForIndexedArray('length', 'Int8Array', 2));
Formatter.add('object', 'typed-array', 'uint8', Formatter.generateFunctionForIndexedArray('length', 'Uint8Array', 2));
Formatter.add('object', 'typed-array', 'uint8clamped', Formatter.generateFunctionForIndexedArray('length', 'Uint8ClampedArray', 2));

Formatter.add('object', 'typed-array', 'int16', Formatter.generateFunctionForIndexedArray('length', 'Int16Array', 4));
Formatter.add('object', 'typed-array', 'uint16', Formatter.generateFunctionForIndexedArray('length', 'Uint16Array', 4));

Formatter.add('object', 'typed-array', 'int32', Formatter.generateFunctionForIndexedArray('length', 'Int32Array', 8));
Formatter.add('object', 'typed-array', 'uint32', Formatter.generateFunctionForIndexedArray('length', 'Uint32Array', 8));

//TODO add float32 and float64

Formatter.add('object', 'promise', function() {
  return '[Promise]';//TODO it could be nice to inspect its state and value
});

Formatter.add('object', 'xhr', function() {
  return '[XMLHttpRequest]';//TODO it could be nice to inspect its state
});

Formatter.add('object', 'html-element', function(value) {
  return value.outerHTML;
});

Formatter.add('object', 'html-element', '#text', function(value) {
  return value.nodeValue;
});

Formatter.add('object', 'html-element', '#document', function(value) {
  return value.documentElement.outerHTML;
});

Formatter.add('object', 'host', function() {
  return '[Host]';
});

Formatter.add('object', 'set', function(value) {
  var iter = value.values();
  var len = 0;

  this.seen.push(value);

  var props = [];

  var next = iter.next();
  while(!next.done) {
    var val = next.value;
    var f = this.format(val);
    len += f.length;
    props.push(f);

    next = iter.next();
  }

  this.seen.pop();

  if(props.length === 0) return 'Set {}';

  if(len <= this.maxLineLength) {
    return 'Set { ' + props.join(this.propSep + ' ') + ' }';
  } else {
    return 'Set {\n' + props.map(util.addSpaces).join(this.propSep + '\n') + '\n' + '}';
  }
});

Formatter.add('object', 'map', function(value) {
  var iter = value.entries();
  var len = 0;

  this.seen.push(value);

  var props = [];

  var next = iter.next();
  while(!next.done) {
    var val = next.value;
    var fK = this.format(val[0]);
    var fV = this.format(val[1]);

    var f;
    if((fK.length + fV.length + 4) <= this.maxLineLength) {
      f = fK + ' => ' + fV;
    } else {
      f = fK + ' =>\n' + fV;
    }

    len += fK.length + fV.length + 4;
    props.push(f);

    next = iter.next();
  }

  this.seen.pop();

  if(props.length === 0) return 'Map {}';

  if(len <= this.maxLineLength) {
    return 'Map { ' + props.join(this.propSep + ' ') + ' }';
  } else {
    return 'Map {\n' + props.map(util.addSpaces).join(this.propSep + '\n') + '\n' + '}';
  }
});

Formatter.prototype.defaultFormat = Formatter.prototype._format_object;

function defaultFormat(value, opts) {
  return new Formatter(opts).format(value);
}

defaultFormat.Formatter = Formatter;
module.exports = defaultFormat;
