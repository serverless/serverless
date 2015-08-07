var DynamoDBDatatype = require("dynamodb-doc/lib/datatypes").DynamoDBDatatype,
    Config           = require('../config'),
    extend           = require('util')._extend,
    Q                = require("q"),
    ModelDynamoDBDoc = require('../models/model_aws').DynamoDBDoc,
    ModelDynamoDB    = require('../models/model_aws').DynamoDB,
    dt               = new DynamoDBDatatype(),
    dbClient         = new ModelDynamoDB(),
    docClient        = new ModelDynamoDBDoc();

/**
 * Wrapper for updateItem that sets last modified (modified) attr
 *
 * @param tableName
 * @param key
 * @param updateExpression
 * @param expressionAttributeValues
 * @param additionalParams
 * @returns {Promise} no return data
 */
module.exports.updateWithMod = function (tableName, key, updateExpression, expressionAttributeValues, additionalParams) {
    if (updateExpression.indexOf('modified') != -1) {
        throw new Error("Can not specify modified", 400);
    }

    if (-1 == updateExpression.toUpperCase().indexOf('SET')) {
        updateExpression = "SET modified = :m " + updateExpression;
    }
    else {
        updateExpression = updateExpression.replace(/set/i, 'SET modified = :m, ');
    }

    expressionAttributeValues[':m'] = new Date().toISOString();

    var params = {
        TableName: tableName,
        Key: key,
        UpdateExpression: updateExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnConsumedCapacity: "NONE",
        ReturnItemCollectionMetrics: 'NONE'
    };

    if (additionalParams) {
        extend(params, additionalParams);
    }
    return Q.ninvoke(docClient, "updateItem", params);
};

/**
 * De-serializes based on model schema. Handles Item and Items
 *
 * @param data dynamoDb object that has .Item or .Items attribute
 * @param schema
 */
module.exports.parse = function (data, schema) {
    if (data.Item) {
        data.Item = this.parseItem(data.Item, schema);
    }
    else if (data.Items) {
        data.Items = this.parseItems(data.Items, schema);
    }
};

module.exports.parseItems = function (items, schema) {
    for (var index in items) {
        items[index] = this.parseItem(items[index], schema);
    }
    return items;
};

/**
 * Formats {key: {N: "1"},expires: {S: "2015-03-11T20:17:58.799Z"}} to {key: 1,expires:Date()}
 *
 * @param item
 * @param schema
 * @returns {{}}
 */
module.exports.parseItem = function (item, schema) {
    var attrList = {};
    for (var attribute in item) {
        var keys  = Object.keys(item[attribute]),
            key   = keys[0],
            value = item[attribute][key];

        value = dt.formatWireType(key, value);

        if (schema[attribute] && schema[attribute]._type && 'date' == schema[attribute]._type) {
            value = new Date(value);
        }

        attrList[attribute] = value;
    }

    return attrList;
};

module.exports.buildDelRequestsList = function (itemsFromQuery, hashKey, rangeKey) {
    var deleteRequests = [];

    itemsFromQuery.forEach(function (item) {
        var t = {
            DeleteRequest: {
                Key: {}
            }
        };

        t.DeleteRequest.Key[hash] = item[hash];

        if (rangeKey) {
            t.DeleteRequest.Key[rangeKey] = item[rangeKey];
        }

        deleteRequests.push(t);
    });
};

/**
 * Only to be used for testing as it does not correctly create ProjectionType (always ALL)
 *
 * Will by default delete the table before creating
 *
 * @param metadata
 * @param deleteFirst default true
 * @returns {Promise.String} table name
 */
module.exports.createTableFromModelSchema = function (metadata, deleteFirst) {
    if (-1 != metadata.tableName.indexOf('prod')) {
        throw new Error("Cant run createTable on prod!!");
    }

    //allows running of tests against real dynamo tables vs local. If true, expects tables to be created and empty
    if ("true" === global.process.env.JAWS_IGNORE_TEST_DYNAMO_TABLE_CREATES) {
        return Q.fcall(function () {
            return true;
        });
    }
    deleteFirst = (false !== deleteFirst);

    var template = {
        TableName: '',
        KeySchema: [ // The type of of schema.  Must start with a HASH type, with an optional second RANGE.
            {
                AttributeName: '',
                KeyType: 'HASH'
            },
            {
                AttributeName: '',
                KeyType: 'RANGE'
            }
        ],
        AttributeDefinitions: [],
        ProvisionedThroughput: { // required provisioned throughput for the table
            ReadCapacityUnits: 1,
            WriteCapacityUnits: 1
        },
        GlobalSecondaryIndexes: [],
        LocalSecondaryIndexes: []
    };

    var params   = extend(template, {TableName: metadata.tableName}),
        hashName = metadata.hashKey;

    params.KeySchema[0].AttributeName = hashName;
    addAttributeDefinition(params, hashName, metadata);
    if (metadata.rangeKey) {
        params.KeySchema[1].AttributeName = metadata.rangeKey;
        addAttributeDefinition(params, metadata.rangeKey, metadata);
    }
    else {
        params.KeySchema.splice(1, 1);
    }

    var hasGlobal         = false,
        hasLocalSecondary = false;

    for (var key in metadata.indexes) {
        if (metadata.indexes.hasOwnProperty(key)) {
            var d = setupSecondaryIdxDefn(metadata.indexes[key]);

            if ('global' == metadata.indexes[key].type) {
                params.GlobalSecondaryIndexes.push(d);
                hasGlobal = true;
            }
            else {
                params.LocalSecondaryIndexes.push(d);
                hasLocalSecondary = true;
            }

            addAttributeDefinition(params, metadata.indexes[key].hashKey, metadata);

            if (!!metadata.indexes[key].rangeKey) {
                addAttributeDefinition(params, metadata.indexes[key].rangeKey, metadata);
            }
        }
    }

    if (!hasGlobal) delete params.GlobalSecondaryIndexes;
    if (!hasLocalSecondary) delete params.LocalSecondaryIndexes;

    if (!deleteFirst) {
        return Q.ninvoke(dbClient, "createTable", params)
            .then(function () {
                return metadata.tableName;
            })
            .catch(function (err) {
                console.log("Sent JSON:", JSON.stringify(params));
                console.log("Error creating table", params.TableName, "error:", err);
                throw err;
            });
    }
    else {
        return Q.ninvoke(dbClient, "deleteTable", {TableName: metadata.tableName})
            .catch(function (err) {
                if ('ResourceNotFoundException' != err.name) {
                    throw err;
                }
            })
            .then(function () {
                return Q.ninvoke(dbClient, "createTable", params);
            })
            .then(function () {
                return metadata.tableName;
            })
            .catch(function (err) {
                console.log("Sent JSON:", JSON.stringify(params));
                console.log("Error deleting/creating table", params.TableName, "error:", err);
                throw err;
            });
    }
};

function addAttributeDefinition(params, attr, metadata) {
    var alreadyHas = params.AttributeDefinitions.some(function (e) {
        return e.AttributeName == attr;
    });
    if (alreadyHas) return;

    params.AttributeDefinitions.push({
        AttributeName: attr,
        AttributeType: joiTypeToDynamoIndexType(metadata.schema[attr]._type)
    });
}

function joiTypeToDynamoIndexType(joiType) {
    switch (joiType) {
        case 'number':
            return 'N';
            break;
        case 'binary':
            return 'B';
            break;
        default:
            return 'S';
            break;
    }
}

function setupSecondaryIdxDefn(metadata) {
    var d = {
        IndexName: metadata.name,
        KeySchema: [
            { // Required HASH type attribute
                AttributeName: metadata.hashKey,
                KeyType: 'HASH'
            },
            { // Optional RANGE key type for HASH + RANGE secondary indexes
                AttributeName: '',
                KeyType: 'RANGE'
            }
        ],
        Projection: { // attributes to project into the index
            ProjectionType: 'ALL'
        },
        ProvisionedThroughput: { // throughput to provision to the index
            ReadCapacityUnits: 1,
            WriteCapacityUnits: 1
        }
    };

    if (metadata.rangeKey) {
        d.KeySchema[1].AttributeName = metadata.rangeKey;
    }
    else {
        d.KeySchema.splice(1, 1);
    }

    if ('global' != metadata.type) {
        delete d.ProvisionedThroughput;
    }

    return d;
}