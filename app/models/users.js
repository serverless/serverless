/**
 * Users Data Model
 */

var dynamoDB = require('../other/aws').dynamoDB,
    dynamoDBConverter = require('../other/dynamodb_converter'),
    crypto = require('crypto');

var Users = {

    /**
     * Create or Update User
     */
    
    saveUser: function(user, callback) {

        var params = {
            'TableName': 'etsysync_users',
            'ReturnValues': 'NONE',
            'Key': {
                'servant_user_id': {
                    'S': user.servant_user_id
                }
            },
            'UpdateExpression': 'SET #b = :full_name_val, #c = :nick_name_val, #d = :email_val, #e = :servant_access_token_val, #f = :servant_access_token_limited_val, #g = :servant_refresh_token_val, #h = :last_signed_in_val',
            'ExpressionAttributeNames': {
                '#b': 'full_name',
                '#c': 'nick_name',
                '#d': 'email',
                '#e': 'servant_access_token',
                '#f': 'servant_access_token_limited',
                '#g': 'servant_refresh_token',
                '#h': 'last_signed_in'
            },
            'ExpressionAttributeValues': {
                ':full_name_val': {
                    'S': user.full_name
                },
                ':nick_name_val': {
                    'S': user.nick_name
                },
                ':email_val': {
                    'S': user.email
                },
                ':servant_access_token_val': {
                    'S': user.servant_access_token
                },
                ':servant_access_token_limited_val': {
                    'S': user.servant_access_token_limited
                },
                ':servant_refresh_token_val': {
                    'S': user.servant_refresh_token
                },
                ':last_signed_in_val': {
                    'N': user.last_signed_in
                }
            }
        };

        // Save DynamoDB Document
        dynamoDB.updateItem(params, function(error, response) {
            return callback(error, user);
        });
    },

    showUser: function(servantUserID, callback) {
        // Create DynamoDB Document
        var params = {
            'TableName': 'etsysync_users',
            'Key': {
                'servant_user_id': {
                    'S': servantUserID
                }
            }
        };
        // Save DynamoDB Document
        dynamoDB.getItem(params, function(error, response) {
            return callback(error, dynamoDBConverter.convertToJson(response.Item));
        });
    }
};


module.exports = Users;