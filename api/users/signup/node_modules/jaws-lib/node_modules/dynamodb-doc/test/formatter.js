var assert = require("assert");
var datatypes = require("../lib/datatypes").DynamoDBDatatype;
var t = new datatypes();
var formatter = require("../lib/formatter").DynamoDBFormatter;
var f = new formatter();
var c = require("../lib/condition");


describe("Testing Format Input", function() {
    "use strict";

    describe("on BatchGetItem Input", function() {
        var request = {};
        request.operation = "batchGetItem";
        request.params = {};
        request.params.ReturnConsumedCapacity = "NONE";

        var gameTable = "Games";
        var gameKeys = [{"GameId": 1}, {"GameId": 2}];

        var userTable = "Users";
        var userKeys = [{"UserId": "raymolin", "Age": 21}];


        it("with hash and hash-range keys", function() {
            request.params.RequestItems = {};
            request.params.RequestItems[gameTable] = {"ConsistentRead": "false",
                                                      "ProjectionExpression": "#a",
                                                      "ExpressionAttributeNames": {"#a": "GameId"},
                                                     "Keys": gameKeys};
            request.params.RequestItems[userTable] = {"AttributesToGet": ["UserId", "Friends"],
                                                     "Keys": userKeys};

            var llRequestParams = {"RequestItems":
                                     {"Games":
                                        {"ConsistentRead": "false",
                                         "ProjectionExpression": "#a",
                                         "ExpressionAttributeNames": {"#a": "GameId"},
                                         "Keys": [{"GameId": {"N": "1"}},
                                                  {"GameId": {"N": "2"}}]},
                                      "Users":
                                        {"AttributesToGet": ["UserId", "Friends"],
                                         "Keys": [{"UserId": {"S": "raymolin"},
                                                   "Age": {"N": "21"}}] }},
                                   "ReturnConsumedCapacity": "NONE"};

            f.formatInput(request);
            assert.deepEqual(request.params, llRequestParams);
        });

    });
    describe("on GetItem Input", function() {
        var request = {};

        var hashKey = {"UserId": "raymolin"};

        var hashRangeKey = {"UserId": "raymolin",
                            "HighScore" : 200};

        beforeEach(function() {
            request.params = {};
            request.params.TableName = "Users";
            request.operation = "getItem";
        });

        it("formatInput on simple Hash Key", function() {
            request.params.Key = hashKey;
            var llRequestParams = {"Key": 
                                    {"UserId":
                                      {"S": "raymolin"}},
                                   "TableName":
                                       "Users"};
            f.formatInput(request);
            assert.deepEqual(request.params, llRequestParams,
                "Didn't meet expected params.");
        });

        it("formatInput on Hash-Range Key", function() {
            request.params.Key = hashRangeKey;
            var llRequestParams = {"Key":
                                    {"UserId":
                                      {"S": "raymolin"},
                                     "HighScore":
                                      {"N": "200"}},
                                   "TableName": "Users"};
            f.formatInput(request);
            assert.deepEqual(request.params, llRequestParams,
                "Didn't meet expected params.");
        });
    });

    describe("on PutItem Input", function() {
        var request = {};
        
        var basicItem = {"UserId"  : "raymolin",
                         "Age"     : 21,
                         "Coworkers" : new t.createSet(["vijayra", "hulisa"], "S") };

        var jsonItem = {"UserId"   : "raymolin",
                        "ProfilePic": new Buffer("0101"), 
                        "Spouse"    : null,
                        "isMarried" : false,
                        "Relationships" : {"Father": "John",
                                           "Mother": "Jane"},
                        "Pets"      : ["Dog", "Cat"]};

        beforeEach(function() {
            request.params = {};
            request.params.TableName = "Users";
            request.operation = "putItem";
        });

       it("on basic item", function() {
            request.params.Item = basicItem;
            var llRequestParams = {"Item":
                                          {"UserId":
                                            {"S": "raymolin"},
                                           "Age":
                                            {"N": "21"},
                                           "Coworkers":
                                            {"SS": ["vijayra", "hulisa"]}},
                                   "TableName": "Users"};
            f.formatInput(request);

            assert.deepEqual(request.params, llRequestParams,
              "Didn't meet expected params.");
       });

       it("on json item", function() {
           request.params.Item = jsonItem;
           var llRequestParams = {"Item":
                                    {"UserId":
                                        {"S": "raymolin"},
                                     "ProfilePic":
                                        {"B": new Buffer("0101")},
                                     "isMarried":
                                        {"BOOL": false},
                                     "Spouse":
                                        {"NULL": true},
                                     "Relationships":
                                        {"M": {"Father" :
                                                {"S" : "John"},
                                                "Mother" :
                                                {"S" : "Jane"}}},
                                     "Pets":
                                        {"L": [{"S": "Dog"},
                                               {"S": "Cat"}] }},
                                  "TableName": "Users"};
            f.formatInput(request);

            assert.deepEqual(request.params, llRequestParams,
              "Didn't meet expected params.");
       });

       it("with conditions on basic item", function() {
            request.params.Item = basicItem;
            request.params.Expected = new c.DynamoDBCondition("UserId", "NOT_NULL");
            var llRequestParams = {"Item":
                                          {"UserId":
                                            {"S": "raymolin"},
                                           "Age":
                                            {"N": "21"},
                                           "Coworkers":
                                            {"SS": ["vijayra", "hulisa"]}},
                                   "TableName": "Users",
                                   "Expected" :
                                      {"UserId":
                                        {"ComparisonOperator": "NOT_NULL"}}};
            f.formatInput(request);
            assert.deepEqual(request.params, llRequestParams,
              "Didn't meet expected params.");
       });
    });

    describe("on DelItem Input", function() {
        var request = {};
        
        var hashKey = {"UserId" : "raymolin"};
        var hashRangeKey = {"UserId" : "raymolin",
                            "HighScore" : 200};
        
        beforeEach(function () {
            request.params = {};
            request.params.TableName = "Users";
            request.operation = "deleteItem";
        });

        it("with a simple hash key", function() {
            request.params.Key = hashKey;
            var llRequestParams = {"Key":
                                    {"UserId":
                                      {"S" : "raymolin"}},
                                   "TableName": "Users"};
            f.formatInput(request);
            assert.deepEqual(request.params, llRequestParams,
              "Didn't meet expected params.");
        });

        it("with a hash-range key", function() {
            request.params.Key = hashRangeKey;
            var llRequestParams = {"Key":
                                    {"UserId":
                                      {"S": "raymolin"},
                                     "HighScore":
                                      {"N": "200" }},
                                   "TableName": "Users"};
            f.formatInput(request);
            assert.deepEqual(request.params, llRequestParams,
              "Didn't meet expected params.");
        });

        it("with a condition and hash key", function() {
            request.params.Key = hashKey;
            request.params.Expected = new c.DynamoDBCondition("Age", "NOT_NULL");
            var llRequestParams = {"Key":
                                    {"UserId":
                                      {"S": "raymolin"}},
                                   "Expected":
                                      {"Age":
                                        {"ComparisonOperator": "NOT_NULL"}},
                                   "TableName": "Users"};
            f.formatInput(request);
            assert.deepEqual(request.params, llRequestParams,
              "Didn't meet expected params.");
        });

    });

    describe("on UpdateItem Input", function() {
        var request = {};
        
        var hashKey = {"GameNum" : 1};
        var update = {"Players": {
                        "Action": "PUT",
                        "Value": ["P1", "P2"]}};
        var llRequestParams = {"Key":
                                {"GameNum":
                                  {"N": "1"}},
                               "AttributeUpdates":
                                {"Players": 
                                  {"Action": "PUT",
                                    "Value": 
                                     {"L" : [
                                       {"S": "P1"},
                                       {"S": "P2"}]}}},
                               "TableName": "Games"};

        beforeEach(function () {
            request.params = {};
            request.params.TableName = "Games";
            request.params.Key = hashKey;
            request.params.AttributeUpdates = update;
            request.operation = "updateItem";
        });

        it("with simple JSON datatype", function() {
            f.formatInput(request);
            assert.deepEqual(request.params, llRequestParams);
        });

        it("with simple condition", function() {
            request.params.Expected = new c.DynamoDBCondition("Players", "NULL");
            llRequestParams.Expected = {"Players":
                                           {"ComparisonOperator": "NULL"}};
            f.formatInput(request);
            assert.deepEqual(request.params, llRequestParams);
        });
    });

    

    describe("on BatchWriteItem Input", function() {
        var request = {};
        request.operation = "batchWriteItem";
        request.params = {};
        request.params.ReturnConsumedCapacity = "NONE";

        var gameTable = "Games";
       
        it("with Delete and Put Requests", function() {
            var delRequest = {"DeleteRequest": 
                               {"Key":
                                {"GameId": 1}}};
            var putRequest = {"PutRequest": 
                                {"Item":
                                  {"GameId": 2, 
                                   "Players": ["P1", "P2"]}}};

            request.params.RequestItems = {};
            request.params.RequestItems[gameTable] = [delRequest, putRequest];

            var llRequestParams = {"RequestItems":
                                    {"Games":
                                       [{"DeleteRequest":
                                          {"Key":
                                           {"GameId": {"N": "1"}}}},
                                        {"PutRequest":
                                          {"Item":
                                           {"GameId": {"N": "2"},
                                            "Players": {"L": [{"S": "P1"},
                                                              {"S": "P2"}]}}}} ]},
                                   "ReturnConsumedCapacity": "NONE"};

            f.formatInput(request);
            assert.deepEqual(request.params, llRequestParams);
        });

    });

    describe("on Query Input", function() {
        var request = {};
        request.operation = "query";
        request.params = {};
        request.params.TableName = "Users";
        request.params.IndexName = "Age-index";


        it("with an Index and QueryFilter", function() {
            request.params.KeyConditions = [new c.DynamoDBCondition("Age", "EQ", 21), new c.DynamoDBCondition("Occupation", "EQ", "Driver")];
            request.params.QueryFilter = new c.DynamoDBCondition("DriverLicense", "NOT_NULL");

            var llRequestParams = {"KeyConditions": 
                                     {"Age":
                                      {"AttributeValueList": [{"N": "21"}],
                                       "ComparisonOperator": "EQ"},
                                      "Occupation":
                                      {"AttributeValueList": [{"S": "Driver"}],
                                       "ComparisonOperator": "EQ"}},
                                   "QueryFilter":
                                     {"DriverLicense":
                                       {"ComparisonOperator": "NOT_NULL"}},
                                   "TableName": "Users",
                                   "IndexName": "Age-index"};
            
            f.formatInput(request);
            assert.deepEqual(request.params, llRequestParams);
        });
    });

    describe("on Scan Input", function() {
        var request = {};
        request.operation = "scan";
        request.params = {};
        request.params.TableName = "Users";

        var startKey = {"UserId": "raymolin"};
        var cop = "OR";
        var scanFilter = [new c.DynamoDBCondition("Age", "GT", 21),
                          new c.DynamoDBCondition("DriversLicense", "NOT_NULL")];

        it("with an ExclusiveStartKey, Conditional Operator and Scan Filter", function() {
            request.params.ExclusiveStartKey = startKey;
            request.params.ConditionalOperator = cop;
            request.params.ScanFilter = scanFilter;

            var llRequestParams = {"ExclusiveStartKey":
                                    {"UserId":
                                        {"S": "raymolin"}},
                                   "ScanFilter":
                                    {"Age":
                                        {"AttributeValueList": [{"N": "21"}],
                                         "ComparisonOperator": "GT"},
                                     "DriversLicense":
                                         {"ComparisonOperator": "NOT_NULL"}},
                                   "ConditionalOperator": "OR",
                                   "TableName": "Users"};

            f.formatInput(request);
            assert.deepEqual(request.params, llRequestParams);
        });
    });

    describe("on general JSON expression attribute value map", function() {
        var request = {};
        request.params = {};
        request.params.ExpressionAttributeValues = {"maxFirstAttributeValue": 1000,
                                                    "interestingAttributeValue": "very interesting"};

        var llRequestParams = {"ExpressionAttributeValues":
                                    {"maxFirstAttributeValue":
                                        {"N": "1000"},
                                     "interestingAttributeValue":
                                        {"S": "very interesting"}}};

        it("with a simple example", function() {
            f.formatInput(request);
            assert.deepEqual(request.params, llRequestParams);
        });
    });

});

describe("Testing Format Output", function() {
    "use strict";

    describe("on GetItem Output", function() {
        var response = {};
        var mlResponseData = {};

        beforeEach(function() {
            mlResponseData.Item = {"UserId":
                                      "raymolin",
                                   "Age":
                                       21};

            response.data = {};
            response.data.Item = {"UserId": 
                                    {"S": "raymolin"},
                                  "Age":
                                    {"N": "21"}};

            Array.prototype.notAnElement = function() {};
        });

        afterEach(function() {
            if (mlResponseData.ConsumedCapacity) {
                delete mlResponseData.ConsumedCapacity;
            }
            delete Array.prototype.notAnElement;
        });

        it("with a simple response", function() {
            f.formatOutput(response);
            assert.deepEqual(response.data, mlResponseData);
        });

        it("with consumed capacity", function() {
            response.data.ConsumedCapacity = {};
            response.data.ConsumedCapacity.TableName = "Users";
            response.data.ConsumedCapacity.CapacityUnits = "10";

            mlResponseData.ConsumedCapacity = {};
            mlResponseData.ConsumedCapacity.TableName = "Users";
            mlResponseData.ConsumedCapacity.CapacityUnits = "10";
           
            f.formatOutput(response);
            assert.deepEqual(response.data, mlResponseData);
        });

        it("with Array prototype chain pollution", function() {
            mlResponseData.Item.Friends = {Gaming: 
                                            ["Abe", "Ally"]};
            response.data.Item.Friends = {M: {
                                            Gaming:
                                                {L: [
                                                    {S: "Abe"}, {S: "Ally"}]}}};

            f.formatOutput(response);
            assert.deepEqual(response.data, mlResponseData);
        });
    });


    describe("on Put/Delete/Update Item Output", function() {
        var response = {};
        var mlResponseData = {};
        mlResponseData.Attributes = {"UserId":
                                        "raymolin",
                                     "Certified":
                                        true,
                                     "Coworkers":
                                        ["joz", "vijayra"],
                                     "Project":
                                        null};
        
        beforeEach(function() {
            response.data = {};
            response.data.Attributes = {"UserId":
                                         {"S": "raymolin"},
                                        "Certified":
                                         {"BOOL": true},
                                        "Coworkers":
                                         {"L": [{"S": "joz"},
                                                {"S": "vijayra"}]},
                                        "Project":
                                         {"NULL": true}};
        });

        it("with just attributes", function() {
            f.formatOutput(response);
            assert.deepEqual(response.data, mlResponseData);
        });

        it("with Item Collection Metrics", function() {
            response.data.ItemCollectionMetrics = {"ItemCollectionKey":
                                                    {"UserId":
                                                     {"S": "raymolin"}},
                                                   "SizeEstimateRangeGB":
                                                     ["10"]};
            mlResponseData.ItemCollectionMetrics = {"ItemCollectionKey":
                                                    {"UserId": "raymolin"},
                                                    "SizeEstimateRangeGB":
                                                     ["10"]};
            f.formatOutput(response);
            assert.deepEqual(response.data, mlResponseData);
        });
    });

    describe("on BatchGetItem Output", function() {
        var response = {};
        var mlResponseData = {};
        mlResponseData.Responses = {"Users":
                                    [{"UserId": "raymolin",
                                        "Age": 21},
                                     {"UserId": "joz",
                                        "Age": 21}],
                                "Games":
                                    [{"GameId": 1,
                                        "Players": ["raymolin", "joz"]}]};
        beforeEach(function() {
            response.data = {};
            response.data.Responses = {"Users":
                                        [{"UserId": 
                                             {"S": "raymolin"},
                                          "Age": 
                                             {"N": "21"}},
                                         {"UserId":
                                             {"S": "joz"},
                                          "Age":
                                             {"N": "21"}}],
                                       "Games":
                                         [{"GameId": 
                                               {"N": "1"},
                                           "Players":
                                               {"L": [{"S": "raymolin"},
                                                      {"S": "joz"}]}}]};

        });

        it("with simple Responses", function() {
            f.formatOutput(response);
            assert.deepEqual(response.data, mlResponseData);
        });

        it("with UnprocessedKeys", function() {
            response.data.UnprocessedKeys = {"Users":
                                                {"Keys":
                                                    [{"UserId":
                                                        {"S": "vijayra"}}]}};
            mlResponseData.UnprocessedKeys = {"Users":
                                             {"Keys":
                                                [{"UserId": "vijayra"}]}};

            f.formatOutput(response);
            assert.deepEqual(response.data, mlResponseData);
        });
    });

    describe("on BatchWriteItem Output", function() {
        var response = {};
        var mlResponseData = {};

        var raymolin = {"ItemCollectionKey":
                            {"UserId": "raymolin"},
                        "SizeEstimateRangeGB": ["10"]};
        var vinitra = {"ItemCollectionKey":
                            {"UserId": "vinitra"},
                       "SizeEstimateRangeGB": ["5"]};

        mlResponseData.ItemCollectionMetrics = {"Users":
                                                    [raymolin, vinitra]};


        beforeEach(function() {
            response.data = {};
            var llraymolin = {"ItemCollectionKey":
                                {"UserId": {"S": "raymolin"}},
                              "SizeEstimateRangeGB": ["10"]};
            var llvinitra = {"ItemCollectionKey":
                                {"UserId": {"S": "vinitra"}},
                              "SizeEstimateRangeGB": ["5"]};
            response.data.ItemCollectionMetrics = {"Users":
                                                    [llraymolin, llvinitra]};
        });

        it("with Item Collection Metrics", function() {
            f.formatOutput(response);
            assert.deepEqual(response.data, mlResponseData);
        });

        it("with UnprocessedItems", function() {
            response.data.UnprocessedItems = {"Users":
                                                [{"DeleteRequest":
                                                   {"Key":
                                                    {"UserId":
                                                        {"S": "raymolin"}}}},
                                                 {"PutRequest":
                                                   {"Item":
                                                    {"UserId":
                                                        {"S": "raymolin"}}}}]};

            mlResponseData.UnprocessedItems = {"Users":
                                                [{"DeleteRequest":
                                                   {"Key":
                                                    {"UserId": "raymolin"}}},
                                                 {"PutRequest":
                                                   {"Item":
                                                    {"UserId": "raymolin"}}}]};

            f.formatOutput(response);
            assert.deepEqual(response.data, mlResponseData);                       
        });
    });

    describe("on Scan/Query", function() {
        var response = {};
        var mlResponseData = {"Items":
                                [{"UserId": "raymolin"},
                                 {"UserId": "martin"},
                                 {"UserId": "john"}],
                              "Count": "3"};

        beforeEach(function() {
            response.data = {};
            response.data.Items = [{"UserId":
                                    {"S": "raymolin"}},
                                  {"UserId":
                                    {"S": "martin"}},
                                  {"UserId": 
                                    {"S": "john"}}];
            response.data.Count = "3";
        });

        it("with count and items", function() {
            f.formatOutput(response);
            assert.deepEqual(response.data, mlResponseData);
        });

        it("with lastEvaluatedKey", function() {
            response.data.LastEvaluatedKey = {"UserId":
                                                {"S": "john"}};

            mlResponseData.LastEvaluatedKey = {"UserId": "john"};

            f.formatOutput(response);
            assert.deepEqual(response.data, mlResponseData);
        });

    });
});
