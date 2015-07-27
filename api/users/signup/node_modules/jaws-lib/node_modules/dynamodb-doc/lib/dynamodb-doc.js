"use strict";

/**
 * Create an instance of the DynamoDB Document client.
 *
 * @constructor
 * @class DynamoDB
 * @param {AWS.DynamoDB} dynamoDB An instance of the service provided AWS SDK (optional).
 * @returns {DynamoDB} Modified version of the service for Document support.
 */
function DynamoDB(dynamoDB) {
    var isBrowser = typeof(window) === "undefined";
    var AWS = isBrowser ? require("aws-sdk") : window.AWS;

    var condition = isBrowser ? require("./condition").DynamoDBCondition : window.DynamoDBCondition;

    var datatypes = isBrowser ? require("./datatypes").DynamoDBDatatype : window.DynamoDBDatatype;
    var t = new datatypes();

    var formatter = isBrowser ? require("./formatter").DynamoDBFormatter : window.DynamoDBFormatter;
    var f = new formatter();

    var service = dynamoDB || new AWS.DynamoDB();

    var setupLowLevelRequestListeners = service.setupRequestListeners;
    service.setupRequestListeners = function(request) {
        setupLowLevelRequestListeners.call(this, request);

        request._events.validate.unshift(f.formatInput);
        request.on("extractData", f.formatOutput);
    };
    
    /**
     * Utility to create Set Object for requests.
     *
     * @function Set
     * @memberOf DynamoDB#
     * @param {array} set An array that contains elements of the same typed as defined by {type}.
     * @param {string} type Can only be a [S]tring, [N]umber, or [B]inary type.
     * @return {Set} Custom Set object that follow {type}.
     * @throws InvalidSetType, InconsistentType
     */
    service.__proto__.Set = function(set, type) {
        return t.createSet(set, type); 
    };

    /**
    * Creates an instance of Condition and should be used with the DynamoDB client.
    *
    * @function Condition
    * @memberOf DynamoDB#
    * @param {string} key The attribute name being conditioned.
    * @param {string} operator The operator in the conditional clause. (See lower level docs for full list of operators)
    * @param val1 Potential first element in what would be the AttributeValueList
    * @param val2 Potential second element in what would be the AttributeValueList
    * @return {Condition} Condition for your DynamoDB request.
    */
    service.__proto__.Condition = function(key, operator, val1, val2) {
        return condition(key, operator, val1, val2);
    };

    /**
     * Utility to convert a String to the necessary Binary object.
     *
     * @function StrToBin
     * @memberOf DynamoDB#
     * @param {string} value String value to converted to Binary object.
     * @return {object} Return value will be a Buffer or Uint8Array in the browser.
     * @throws StrConversionError
     */
    service.__proto__.StrToBin = function(value) {
        return t.strToBin(value);
    };
    /**
     * Utility to convert a Binary object into its String equivalent.
     *
     * @function BinToStr
     * @memberOf DynamoDB#
     * @param {object} value Binary value (Buffer | Uint8Array) depending on environment.
     * @return {string} Return value will be the string representation of the Binary object.
     * @throws BinConversionError
     */
    service.__proto__.BinToStr = function(value) {
        return t.binToStr(value);
    };

    return service;
}

if (typeof(module) !== "undefined") {
    var exports = module.exports = {};
    exports.DynamoDB = DynamoDB;
}
 
