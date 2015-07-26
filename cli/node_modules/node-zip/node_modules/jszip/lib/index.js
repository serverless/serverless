'use strict';

var base64 = require('./base64');

/**
Usage:
   zip = new JSZip();
   zip.file("hello.txt", "Hello, World!").file("tempfile", "nothing");
   zip.folder("images").file("smile.gif", base64Data, {base64: true});
   zip.file("Xmas.txt", "Ho ho ho !", {date : new Date("December 25, 2007 00:00:01")});
   zip.remove("tempfile");

   base64zip = zip.generate();

**/

/**
 * Representation a of zip file in js
 * @constructor
 * @param {String=|ArrayBuffer=|Uint8Array=} data the data to load, if any (optional).
 * @param {Object=} options the options for creating this objects (optional).
 */
function JSZip(data, options) {
    // if this constructor is used without `new`, it adds `new` before itself:
    if(!(this instanceof JSZip)) return new JSZip(data, options);

    // object containing the files :
    // {
    //   "folder/" : {...},
    //   "folder/data.txt" : {...}
    // }
    this.files = {};

    this.comment = null;

    // Where we are in the hierarchy
    this.root = "";
    if (data) {
        this.load(data, options);
    }
    this.clone = function() {
        var newObj = new JSZip();
        for (var i in this) {
            if (typeof this[i] !== "function") {
                newObj[i] = this[i];
            }
        }
        return newObj;
    };
}
JSZip.prototype = require('./object');
JSZip.prototype.load = require('./load');
JSZip.support = require('./support');
JSZip.defaults = require('./defaults');

/**
 * @deprecated
 * This namespace will be removed in a future version without replacement.
 */
JSZip.utils = require('./deprecatedPublicUtils');

JSZip.base64 = {
    /**
     * @deprecated
     * This method will be removed in a future version without replacement.
     */
    encode : function(input) {
        return base64.encode(input);
    },
    /**
     * @deprecated
     * This method will be removed in a future version without replacement.
     */
    decode : function(input) {
        return base64.decode(input);
    }
};
JSZip.compressions = require('./compressions');
module.exports = JSZip;
