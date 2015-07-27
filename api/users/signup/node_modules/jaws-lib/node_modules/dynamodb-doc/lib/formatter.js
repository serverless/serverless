"use strict";

/**
 *  Create an instance of the DynamoDBFormatter.
 *  @constructor
 *  @return {DynamoDBFormatter} A Formatter object that provides methods for formatting DynamoDB requests and responses.
 */
function DynamoDBFormatter() {    
    var datatypes = typeof(window) === "undefined" ? require("./datatypes").DynamoDBDatatype : window.DynamoDBDatatype;
    var t = new datatypes();
    var EmptyConditionArray = "Need to pass in an array with 1 or more Condition Objects.";
    var BadElementInConditionArray = "Only Condition objects are allowed as members of the array.";
    var InvalidCondition = "Need to pass in a valid Condition Object.";

    function formatAttrValInput(attrValueMap) {
        var attributeValueMap = {};
        for (var attr in attrValueMap) {
            var value = attrValueMap[attr];
            attributeValueMap[attr] = t.formatDataType(value);
        }
        return attributeValueMap;
    }
    
    function formatConditions(conditions) {
        if (conditions.prototype && conditions.prototype.instanceOf === "DynamoDBConditionObject") {
            conditions = [conditions];
        } else {
            if (Array.isArray(conditions)) {
                if (conditions.length === 0) {
                    throw new Error(EmptyConditionArray);
                }
                for (var index in conditions) {
                    var condition = conditions[index];
                    if (!(condition.prototype) || !(condition.prototype.instanceOf === "DynamoDBConditionObject")) {
                        throw new Error(BadElementInConditionArray);
                    }
                }
            } else {
                throw new Error(InvalidCondition);
            }
        }
    
        var expected = {};
        for (var index in conditions) {
            var condition = conditions[index];
            expected[condition.key] = condition.format();
        }
        return expected;
    }
    
    function formatUpdates(updates) {
        var attrUpdates = {};
        for (var attr in updates) {
            if (updates.hasOwnProperty(attr)) {
                var actionValue = {};
                var value = updates[attr].Value;
                var action = updates[attr].Action;
    
                actionValue.Action = action;
                actionValue.Value = t.formatDataType(value);
    
                attrUpdates[attr] = actionValue;
            }
        }
        
         return attrUpdates;
    }
    
    function handleWriteRequest(request) {
        var requestCopy = {};
    
        if (request.DeleteRequest) {
            var key = request.DeleteRequest.Key;
            requestCopy.DeleteRequest = {};
            requestCopy.DeleteRequest.Key = formatAttrValInput(key);
        } else {
            var item = request.PutRequest.Item;
            requestCopy.PutRequest = {};
            requestCopy.PutRequest.Item = formatAttrValInput(item);
        }
    
        return requestCopy;
    }
    
    function formatRequestItems(requests) {
        var requestItems = {};
    
        for (var table in requests) {
            if (requests.hasOwnProperty(table)) {
                requestItems[table] = {};
    
                var request = requests[table];
                if (Array.isArray(request)) {
                    var writeRequests = [];
                    for (var wIndex in request) {
                        writeRequests.push(handleWriteRequest(request[wIndex]));
                    }
                    requestItems[table] = writeRequests;
                } else {
                    if (request.AttributesToGet) {
                        requestItems[table].AttributesToGet = request.AttributesToGet;
                    }
                    if (request.ConsistentRead) {
                        requestItems[table].ConsistentRead = request.ConsistentRead;
                    }
                    if (request.ProjectionExpression) {
                        requestItems[table].ProjectionExpression = request.ProjectionExpression;
                    }
                    if (request.ExpressionAttributeNames) {
                        requestItems[table].ExpressionAttributeNames = request.ExpressionAttributeNames;
                    }
                    if (request.Keys) {
                        var keys = [];
                        for (var gIndex in request.Keys) {
                            var key = request.Keys[gIndex];
                            keys.push(formatAttrValInput(key));
                        }
                        requestItems[table].Keys = keys;
                    }
                }
            }
        }
    
        return requestItems;
    }
    
    var inputMap = { "AttributeUpdates": formatUpdates,
                     "ExclusiveStartKey": formatAttrValInput,
                     "Expected": formatConditions,
                     "ExpressionAttributeValues": formatAttrValInput,
                     "Item": formatAttrValInput,
                     "Key": formatAttrValInput,
                     "KeyConditions": formatConditions,
                     "RequestItems": formatRequestItems,
                     "ScanFilter": formatConditions,
                     "QueryFilter": formatConditions};
    
    
    function formatAttrValOutput(item) {
        var attrList = {};
        for (var attribute in item) {
            var keys = Object.keys(item[attribute]);
            var key = keys[0];
            var value = item[attribute][key];
        
            value = t.formatWireType(key, value); 
            attrList[attribute] = value;
        }
    
        return attrList;
    }
    
    function formatItems(items) {
        for (var index in items) {
            items[index] = formatAttrValOutput(items[index]);
        }
        return items;
    }
    
    function handleCollectionKey(metrics) {
        var collectionKey = metrics.ItemCollectionKey;
        metrics.ItemCollectionKey = formatAttrValOutput(collectionKey);
        return metrics;
    }
    
    function handleBatchMetrics(metrics) {
        for (var table in metrics) {
            if (metrics.hasOwnProperty(table)) {
                var listOfKeys = metrics[table];
                for (var index in listOfKeys) {
                    listOfKeys[index] = handleCollectionKey(listOfKeys[index]);
                }
            }
        }
        return metrics;
    }
    
    function formatMetrics(metrics) {
        var collectionKey = metrics.ItemCollectionKey;
        if (collectionKey) {
            metrics = handleCollectionKey(metrics);
        } else {
            metrics = handleBatchMetrics(metrics);
        }
        return metrics;
    }
    
    function formatResponses(responses) {
        for (var table in responses) {
            if (responses.hasOwnProperty(table)) {
                var listOfItems = responses[table];
                for (var index in listOfItems) {
                    listOfItems[index] = formatAttrValOutput(listOfItems[index]);
                }
            }
        }
    
        return responses;
    }
    
    function formatUnprocessedItems(unprocessedItems) {
        for(var table in unprocessedItems) {
            if (unprocessedItems.hasOwnProperty(table)) {
                var tableInfo = unprocessedItems[table];
                for (var index in tableInfo) {
                    var request = tableInfo[index];
                    if (request.DeleteRequest) {
                        tableInfo[index].DeleteRequest.Key = formatAttrValOutput(request.DeleteRequest.Key);
                    } else {
                        tableInfo[index].PutRequest.Item = formatAttrValOutput(request.PutRequest.Item);
                    }
                }
            }
        }
        return unprocessedItems;
    }
    
    function formatUnprocessedKeys(unprocessedKeys) {
        for (var table in unprocessedKeys) {
            if (unprocessedKeys.hasOwnProperty(table)) {
                var tableInfo = unprocessedKeys[table];
                var listOfKeys = tableInfo.Keys;
                for (var index in listOfKeys) {
                    tableInfo.Keys[index] = formatAttrValOutput(listOfKeys[index]);
                }
            }
        }
    
        return unprocessedKeys;
    }
    
    /**
     * DynamoDBFormatter specifically for wrapping DynamoDB response objects.
     *
     * @function formatOutput
     * @memberOf DynamoDBFormatter#
     * @params {object} response Response object directly passed out by the service.
     * @returns {object} Wrapped up response object.
     */
    this.formatOutput = function(response) {
        var outputMap = {"Attributes": formatAttrValOutput,
                         "Item": formatAttrValOutput,
                         "Items": formatItems,
                         "ItemCollectionMetrics": formatMetrics,
                         "LastEvaluatedKey": formatAttrValOutput,
                         "Responses": formatResponses,
                         "UnprocessedKeys": formatUnprocessedKeys,
                         "UnprocessedItems": formatUnprocessedItems};
    
    
        var data = response.data;
        if (data) {
            for (var key in data) {
                if (data.hasOwnProperty(key)) {
                    var formatFunc = outputMap[key];
                    if (formatFunc) {
                        response.data[key] = formatFunc(data[key]);
                    } 
                }
            }
        }
    };
    
    /**
     * DynamoDBFormatter specifically for unwrapping DynamoDB request objects.
     *
     * @function formatInput
     * @memberOf DynamoDBFormatter#
     * @params {object} request Request object created by the service.
     * @return {object} Returns aws sdk version of the request.
     */
    this.formatInput = function (request) {
        var paramsCopy = {};
        var params = request.params;
    
        for (var key in params) {
            if (params.hasOwnProperty(key)) {
                var param = params[key];
                var formatFunc = inputMap[key];
                if (formatFunc) {
                    param = formatFunc(param);
                }
                paramsCopy[key] = param;
            }
        }
    
        request.params = paramsCopy;
    };
}

if (typeof(module) !== "undefined") {
    var exports = module.exports = {};
    exports.DynamoDBFormatter = DynamoDBFormatter;
}
