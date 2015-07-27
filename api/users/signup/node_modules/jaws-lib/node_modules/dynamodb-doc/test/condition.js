var assert = require("assert");
var cond = require("../lib/condition");

describe("Testing Condition", function() {
    "use strict";
    var existCond = new cond.DynamoDBCondition("Name", "NOT_NULL");
    var binOpCond = new cond.DynamoDBCondition("Age", "GE", 18);
    var btwnCond = new cond.DynamoDBCondition("Weight", "BETWEEN", 150, 170);

    describe("Testing Condition.[key, operator, val1, val2]", function () {
        var key = "Weight";
        var op = "BETWEEN";
        var val1 = 150;
        var val2 = 170;

        it("Testing on btwnCond", function() {
            assert.equal(key, btwnCond.key, "Did not find correct btwnCond.key value");
            assert.equal(op, btwnCond.operator, "Did not find correct btwnCond.operator value");
            assert.equal(val1, btwnCond.val1, "Did not find correct btwnCond.val1 value");
            assert.equal(val2, btwnCond.val2, "Did not find correct btwnCond.val2 value");
        });
    });

    describe("Testing existCond", function() {
        var formatExist = {"ComparisonOperator" : "NOT_NULL"};
        it("Testing format()", function() {
            assert.deepEqual(formatExist, existCond.format(), "Format of existCond is incorrect.");
        });
    });

    describe("Testing binOpCond", function() {
        var formatBinOp = {"AttributeValueList" : [{"N": "18"}],
                           "ComparisonOperator" : "GE"};
        it("Testing format()", function() {
            assert.deepEqual(formatBinOp, binOpCond.format(), "Format of binOpCond is incorrect.");
        });
    });

    describe("Testing btwnCond", function() {
        var formatBtwn = {"AttributeValueList" : [{"N": "150"}, {"N": "170"}],
                          "ComparisonOperator" : "BETWEEN"};
        it("Testing format()", function() {
            assert.deepEqual(formatBtwn, btwnCond.format(), "Format of btwnCond is incorrect.");
        });
    });
});
