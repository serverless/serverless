/**
 * ServantMeta Data Model
 */

var dynamoDB = require('../other/aws').dynamoDB,
    moment = require('moment'),
    dynamoDBConverter = require('../other/dynamodb_converter'),
    crypto = require('crypto');

var ServantMeta = {

    listServantMetasByUser: function(servant_user_id, callback) {
        // Create DynamoDB Document
        var params = {
            'TableName': 'etsysync_servantmetas',
            'FilterExpression': '#a = :servant_user_id_val',
            'ExpressionAttributeNames': {
                '#a': 'servant_user_id'
            },
            'ExpressionAttributeValues': {
                ':servant_user_id_val': {
                    'S': servant_user_id
                }
            }
        };
        // Save DynamoDB Document
        dynamoDB.scan(params, function(error, response) {
            return callback(error, dynamoDBConverter.convertToJson(response.Items));
        });
    },

    saveServantMeta: function(servant_meta, callback) {

        // Create DynamoDB Update Params
        var params = {
            'TableName': 'etsysync_servantmetas',
            'ReturnValues': 'NONE',
            'Key': {
                'servant_id': {
                    'S': servant_meta.servant_id
                }
            },
            'UpdateExpression': 'SET #a = :servant_user_id_val',
            'ExpressionAttributeNames': {
                '#a': 'servant_user_id'
            },
            'ExpressionAttributeValues': {
                ':servant_user_id_val': {
                    'S': servant_meta.servant_user_id
                }
            }
        };

        // Add in conditional params
        if (servant_meta.last_sync) {
            params['ExpressionAttributeNames']['#b'] = 'last_sync';
            params['ExpressionAttributeValues'][':last_sync_val'] = {
                'N': servant_meta.last_sync
            };
            params['UpdateExpression'] = params['UpdateExpression'] + ', #b = :last_sync';
        }

        // Save DynamoDB Document
        dynamoDB.updateItem(params, function(error, response) {
            return callback(error, servant_meta);
        });
    },

    showServantMeta: function(servantID, callback) {
        // Create DynamoDB Document
        var params = {
            'TableName': 'etsysync_servantmetas',
            'Key': {
                'servant_id': {
                    'S': servantID
                }
            }
        };
        // Save DynamoDB Document
        dynamoDB.getItem(params, function(error, response) {
            return callback(error, dynamoDBConverter.convertToJson(response.Item));
        });
    }
};


module.exports = ServantMeta;