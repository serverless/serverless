"use strict";
var assert = require("assert");
var expect = require("chai").expect;
var datatypes = require("../lib/datatypes").DynamoDBDatatype;
var t = new datatypes();

describe("Testing DataTypes", function() {
     describe("Testing Bin to Str Conversion", function() {

         it("with some alphanumeric string in Buffer", function() {
             var bin = new Buffer("q1w2e3r4");
             assert.equal("q1w2e3r4", t.binToStr(bin), "Did not convert Bin to Str properly.");
         });

         it("with some special characters in Buffer", function() {
             var bin = new Buffer("q1-w2-e3.mp4");
             assert.equal("q1-w2-e3.mp4", t.binToStr(bin), "Did not convert Bin to Str properly.");
         });
     });

     describe("Testing Str to Bin Conversion", function() {

         it("with some alphanumeric string", function() {
             var str = "1q2w3e4r";
             assert.deepEqual(new Buffer(str), t.strToBin(str), "Did not convert Str to Bin properly.");
         });

         it("with some special characters in Buffer", function() {
             var str = "q1-w2-e3.mp4";
             assert.deepEqual(new Buffer(str), t.strToBin(str), "Did not convert Str to Bin properly.");
         });
     });

     describe("Testing createSet", function() {
        var testStrSet;
        var testNumSet;
        var testBinSet;

        it("with an invalid type.", function() {
            assert.throws(function() { t.createSet([], "INVALID")}, Error);
        });

        it("as a StrSet.", function() {
            testStrSet = t.createSet(["a", "b", "c"], "S");
            assert(testStrSet, "Did not successfully create a StrSet.");
        });

        it("as a NumSet.", function() {
            testNumSet = t.createSet([1, 2, 3], "N");
            assert(testNumSet, "Did not successfully create a NumSet.");
        });

        it("as a BinSet.", function() {
            testBinSet = t.createSet([new Buffer("10"), new Buffer("01")], "B");
            assert(testBinSet, "Did not successfully create a BinSet.");
        });

        it("with inconsistent Attribute.", function() {
            assert.throws(function() { t.createSet([2], "S"); }, Error);
        });

        describe("with the methods of the Set", function() {
            describe("test add", function() {
                it ("with duplicate value.", function() {
                    var initial_length = testStrSet.toArray().length;
                    testStrSet.add("a");
                    var modified_length = testStrSet.toArray().length;
                    assert.equal(initial_length, modified_length);
                });

                it("with unique value.", function() {
                    var initial_length = testStrSet.toArray().length;
                    testStrSet.add("d");
                    var modified_length = testStrSet.toArray().length;
                    assert.equal(initial_length+1, modified_length);

                });
            });

            it("test contains.", function() {
                assert.equal(true, testBinSet.contains(new Buffer("10")));
                assert.equal(false, testNumSet.contains(4));
            });

            it("toArray().", function() {
                var expectedSet = [1,2,3];
                assert.deepEqual(expectedSet, testNumSet.toArray());
            });

            it("remove.", function() {
                var expectedSet = [new Buffer("10")];
                testBinSet.remove(new Buffer("01"));
                assert.deepEqual(expectedSet, testBinSet.toArray());
            });
        });

    });

    describe('Testing createSet #format', function () {
        it("as a StringSet.", function() {
            var stringSet = t.createSet(["a", "b", "c"], "S");
            // nodejs built in assert deep equals does not do strict equality
            expect(stringSet.format()).to.eql({SS : ["a", "b", "c"]});
        });

        it("as a NumSet.", function() {
            var numberSet = t.createSet([1, 2, 3], "N");
            // nodejs built in assert deep equals does not do strict equality
            expect(numberSet.format()).to.eql({NS : ["1", "2", "3"]});
        });

        it("as a BinSet.", function() {
            var binSet = t.createSet([new Buffer("hello"), new Buffer("world")], "B");
            expect(binSet.format()).to.eql({BS : [new Buffer("hello"), new Buffer("world")]});
        });
    });
});
