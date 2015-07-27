"use strict";

/**
 * @class Creates a DynamoDBDatatype that takes care of all datatype handling.
 *
 * @name DynamoDBDatatype
 */
function DynamoDBDatatype() {
    var AWS = typeof(window) === "undefined" ? require("aws-sdk") : window.AWS;
    var Uint8ArrayError = "Uint8Array can only be used for Binary in Browser.";
    var ScalarDatatypeError = "Unrecognized Scalar Datatype to be formatted.";
    var GeneralDatatypeError = "Unrecognized Datatype to be formatted.";
    var BinConversionError = "Need to pass in Buffer or Uint8Array. ";
    var StrConversionError = "Need to pass in string primitive to be converted to binary.";

    function isScalarType(dataType) {

        var type = typeof(dataType);
        return  type === "number"  ||
                type === "string"  ||
                type === "boolean" ||
                (dataType instanceof(Uint8Array) && AWS.util.isBrowser()) ||
                dataType instanceof(AWS.util.Buffer) ||
                dataType === null;
    }

    function isSetType(dataType) {
        return dataType.datatype === "SS" ||
                dataType.datatype === "NS" ||
                dataType.datatype === "BS";
    }

    function isRecursiveType(dataType) {

        return Array.isArray(dataType) ||
                typeof(dataType) === "object";
    }

    function formatSetValues(datatype, values) {
        if(datatype === "NS") {
            return values.map(function (n) {
                return n.toString();
            });
        } else {
          return values;
        }
    };

    function formatRecursiveType(dataType) {

        var recursiveDoc = {};

        var value = {};
        var type = "M";
        if (Array.isArray(dataType)) {
            value = [];
            type = "L";
        }

        for (var key in dataType) {
            value[key] = this.formatDataType(dataType[key]);
        }

        recursiveDoc[type] = value;
        return recursiveDoc;
    }

    /** @throws Uint8ArrayError, ScalarDatatypeError
     *  @private */
    function formatScalarType(dataType) {

        if (dataType == null) {
            return { "NULL" : true };
        }

        var type = typeof(dataType);
        if (type === "string") {
            return { "S" : dataType };
        } else if (type === "number") {
            return { "N" : String(dataType) };
        } else if (type === "boolean") {
            return { "BOOL" : dataType };
        } else if (dataType instanceof(AWS.util.Buffer)) {
            return { "B" : dataType };
        } else if (dataType instanceof(Uint8Array)) {
            if (AWS.util.isBrowser()) {
                return { "B" : dataType };
            } else {
                throw new Error(Uint8ArrayError);
            }
        } else {
            throw new Error(ScalarDatatypeError);
        }
    }

    /**
     * Formats Javascript datatypes into DynamoDB wire format.
     *
     * @name formatDataType
     * @function
     * @memberOf DynamoDBDatatype#
     * @param dataType Javascript datatype (i.e. string, number. For full information, check out the README).
     * @return {object} DynamoDB JSON-like wire format.
     * @throws GeneralDatatypeError
     */
    this.formatDataType = function(dataType) {

        if (isScalarType(dataType)) {
            return formatScalarType(dataType);
        } else if (isSetType(dataType)) {
            return dataType.format();
        } else if (isRecursiveType(dataType)) {
            return formatRecursiveType.call(this, dataType);
        }  else {
            throw new Error(GeneralDatatypeError);
        }

    };

    function str2Bin(value) {
        if (typeof(value) !== "string") {
            throw new Error(StrConversionError);
        }

        if (AWS.util.isBrowser()) {
            var len = value.length;
            var bin = new Uint8Array(new ArrayBuffer(len));
            for (var i = 0; i < len; i++) {
                bin[i] = value.charCodeAt(i);
            }
            return bin;
        } else {
            return AWS.util.Buffer(value);
        }
    }

    /**
     * Utility to convert a String to a Binary object.
     *
     * @function strToBin
     * @memberOf DynamoDBDatatype#
     * @param {string} value String value to converted to Binary object.
     * @return {object} (Buffer | Uint8Array) depending on Node or browser.
     * @throws StrConversionError
     */
    this.strToBin = function(value) {
        return str2Bin.call(this, value);
    };

    function bin2Str(value) {
        if (!(value instanceof(AWS.util.Buffer)) && !(value instanceof(Uint8Array))) {
            throw new Error(BinConversionError);
        }

        if (AWS.util.isBrowser()) {
            return String.fromCharCode.apply(null, value);
        } else {
            return value.toString("utf-8").valueOf();
        }
    }

    /**
     * Utility to convert a Binary object into a decoded String.
     *
     * @function binToStr
     * @memberOf DynamoDBDatatype#
     * @param {object} value Binary value (Buffer | Uint8Array) depending on Node or browser.
     * @return {string} decoded String in UTF-8
     * @throws BinConversionError
     */
    this.binToStr = function(value) {
        return bin2Str.call(this, value);
    };

    /**
     * Utility to create the DynamoDB Set Datatype.
     *
     * @function createSet
     * @memberOf DynamoDBDatatype#
     * @param {array} set An array that contains elements of the same typed as defined by {type}.
     * @param {string} type Can only be a [S]tring, [N]umber, or [B]inary type.
     * @return {Set} Custom Set object that follow {type}.
     * @throws InvalidSetType, InconsistentType
     */
    this.createSet = function(set, type) {
        if (type !== "N" && type !== "S" && type !== "B") {
            throw new Error(type + " is an invalid type for Set");
        }

        var setObj = function Set(set, type) {
            this.datatype = type + "S";
            this.contents = {};

            this.add = function(value) {
                if (this.datatype === "SS" && typeof(value) === "string") {
                    this.contents[value] = value;
                } else if (this.datatype === "NS" && typeof(value) === "number") {
                    this.contents[value] = value;
                } else if (this.datatype === "BS" && value instanceof(AWS.util.Buffer)) {
                    this.contents[bin2Str(value)] = value;
                } else if (this.datatype === "BS" && value instanceof(Uint8Array)) {
                    if (AWS.util.isBrowser()) {
                        this.contents[bin2Str(value)] = value;
                    } else {
                        throw new Error(Uint8ArrayError);
                    }
                } else {
                    throw new Error("Inconsistent in this " + type + " Set");
                }
            };

            this.contains = function(content) {
                var value = content;
                if (content instanceof AWS.util.Buffer || content instanceof(Uint8Array)) {
                    value = bin2Str(content);
                }
                if (this.contents[value] === undefined) {
                    return false;
                }
                return true;
            };

            this.remove = function(content) {
                var value = content;
                if (content instanceof AWS.util.Buffer || content instanceof(Uint8Array)) {
                    value = bin2Str(content);
                }
                delete this.contents[value];
            };

            this.toArray = function() {
                var keys = Object.keys(this.contents);
                var arr = [];

                for (var keyIndex in keys) {
                    var key = keys[keyIndex];
                    if (this.contents.hasOwnProperty(key)) {
                        arr.push(this.contents[key]);
                    }
                }

                return arr;
            };

            this.format = function() {
                var values = this.toArray();
                var result = {};
                result[this.datatype] = formatSetValues(this.datatype, values);
                return result;
            };

            if (set) {
                for (var index in set) {
                    this.add(set[index]);
                }
            }
        };

        return new setObj(set, type);
    };

    /**
     * Formats DynamoDB wire format into javascript datatypes.
     *
     * @name formatWireType
     * @function
     * @memberOf DynamoDBDatatype#
     * @param {string} key Key that represents the type of the attribute value
     * @param value Javascript datatype of the attribute value produced by DynamoDB
     * @throws GeneralDatatypeError
     */
    this.formatWireType = function(key, value) {
        switch (key) {
            case "S":
            case "B":
            case "BOOL":
                return value;
            case "N":
                return Number(value);
            case "NULL":
                return null;
            case "L":
                for (var lIndex = 0; lIndex < value.length; lIndex++) {
                    var lValue = value[lIndex];
                    var lKey = Object.keys(lValue)[0];
                    value[lIndex] = this.formatWireType(lKey, lValue[lKey]);
                }
                return value;
            case "M":
                for (var mIndex in value) {
                    var mValue = value[mIndex];
                    var mKey = Object.keys(mValue)[0];
                    value[mIndex] = this.formatWireType(mKey, mValue[mKey]);
                }
                return value;
            case "SS":
                return new this.createSet(value, "S");
            case "NS":
                value = value.map(function(each) { return Number(each);});
                return new this.createSet(value, "N");
            case "BS":
                return new this.createSet(value, "B");
            default:
                throw "Service returned unrecognized datatype " + key;
        }
    }
}

if (typeof(module) !== "undefined") {
    var exports = module.exports = {};
    exports.DynamoDBDatatype = DynamoDBDatatype;
}
