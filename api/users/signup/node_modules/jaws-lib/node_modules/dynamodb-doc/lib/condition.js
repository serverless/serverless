"use strict";

/**
 * Creates an instance of Condition that is used by the DynamoDB Document client.
 *
 * @param {string} key The attribute name being conditioned on.
 * @param {string} operator The operator in the conditional clause. (See aws sdk docs for full list of operators)
 * @param val1 Potential first element in what would be the AttributeValueList
 * @param val2 Potential second element in what would be the AttributeValueList
 * @return {Condition} Condition for your DynamoDB request.
 */
function DynamoDBCondition(key, operator, val1, val2) {
    var datatypes = typeof(window) === "undefined" ? require("./datatypes").DynamoDBDatatype
                : window.DynamoDBDatatype;

    var t = new datatypes();

    var CondObj = function Condition(key, operator, val1, val2) {
            this.key = key;
            this.operator = operator;
            this.val1 = val1;
            this.val2 = val2;
        
            this.format = function() {
                var formatted = {};
        
                var attrValueList = [];
                if (this.val1 !== undefined) {
                    attrValueList.push(t.formatDataType(this.val1)); 
                }
                if (this.val2 !== undefined) {
                    attrValueList.push(t.formatDataType(this.val2));
                }
                if (attrValueList.length > 0) {
                    formatted.AttributeValueList = attrValueList;
                }
                formatted.ComparisonOperator = this.operator;
        
                return formatted;
            };
    };

    var cond = new CondObj(key, operator, val1, val2);
    cond.prototype = Object.create(Object.prototype);
    cond.prototype.instanceOf  = "DynamoDBConditionObject";

    return cond;
}

if (typeof(module) !== "undefined") {
    var exports = module.exports = {};
    exports.DynamoDBCondition = DynamoDBCondition;
}
