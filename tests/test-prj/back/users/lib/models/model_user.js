/**
 * Model: Users
 * - Users of your application
 */


// Dependencies
var Config           = require('../config');
var Utilities        = require('../utilities/utilities');
var ModelDynamoDBDoc = require('./aws').getDynamoDBDoc();

var moment   = require('moment');
var bcryptjs = require('bcryptjs');
var _        = require('lodash');
var jwt      = require('jsonwebtoken');
var Joi      = require('joi');

var USER_CLASSES = ['free'];

var dynamoMetadata = {
    tableName: Config.dataModelPrefix + '-jaws-users',
    hashKey: '_id',
    schema: {
        _id: Joi.string(),
        email: Joi.string().email(),
        password: Joi.string(),
        salt: Joi.string(),
        plan: Joi.any().valid(USER_CLASSES),
        sign_in_count: Joi.number(),    //TODO: use camelCase
        created: Joi.number(),  //TODO: should we change this to .date() and use date.toISOString()
        updated: Joi.number()   //TODO: should we change this to modified and to .date() and use date.toISOString()
    },
    indexes: {
        "email-index": {
            name: "email-index",
            hashKey: 'email',
            type: 'global'
        }
    },
    serialVersionUID: 1
};

// DynamoDB Table Name for this Model
var dynamodb_table = Config.dataModelPrefix + '-jaws-users';

// Export
module.exports                = new User();
module.exports.dynamoMetadata = dynamoMetadata;

function User() {
}

/**
 * SignUp
 */

User.prototype.signUp = function (data, callback) {

    // Defaults
    var _this = this;


    /**
     * Validate
     */

    if (!data.email) return callback({
        status: 400,
        message: 'Bad Request: Email is required'
    }, null);

    if (!data.password) return callback({
        status: 400,
        message: 'Bad Request: Password is required'
    }, null);

    if (data.password && data.password.length < 8) return callback({
        status: 400,
        message: 'Bad Request: Password must be at least 8 characters long'
    }, null);


    // Check if email is already in use
    _this.showByEmail(data.email, function (error, user) {


        if (error) return callback(error, null);

        if (user) return callback({
            status: 409,
            message: 'Email is already in use'
        }, null);


        /**
         * Instantiate
         */

        var user = {
            _id: Utilities.generateID('user'),
            email: data.email ? data.email : null,
            password: data.password ? data.password : null,
            created: moment().unix(),
            updated: moment().unix(),
            plan: 'free',
            sign_in_count: 0
        };


        // Hash Password
        user = _this.hashPassword(user);


        /**
         * Save
         */

        _this.save(user, function (error, user) {


            if (error) return callback(error, null);


            /**
             * Create JSON Web Token & Return
             */

            var token = jwt.sign({
                uid: user._id
            }, Config.jwt.secret, {
                issuer: Config.jwt.issuer,
                expiresInSeconds: Config.jwt.expires_in_seconds
            });

            return callback(null, {
                jwt: token
            });
        });
    });
};


/**
 * SignIn
 */

User.prototype.signIn = function (data, callback) {

    // Defaults
    var _this = this;


    /**
     * Validate
     */

    if (!data.email) return callback({
        status: 400,
        message: 'Bad Request: Email is required'
    }, null);

    if (!data.password) return callback({
        status: 400,
        message: 'Bad Request: Password is required'
    }, null);


    // Check if email is already in use
    _this.showByEmail(data.email, function (error, user) {

        if (error) return callback(error, null);

        if (!user) return callback({
            status: 404,
            message: 'User not found'
        }, null);


        // Check Password
        if (!bcryptjs.compareSync(data.password, user.password)) return callback({
            status: 401,
            message: 'Invalid login credentials'
        }, null);


        // Update User
        user.sign_in_count++;


        /**
         * Save
         */

        _this.save(user, function (error, user) {

            if (error) return (error, null);


            /**
             * Create JSON Web Token & Return
             */

            var token = jwt.sign({
                uid: user._id
            }, Config.jwt.secret, {
                issuer: Config.jwt.issuer,
                expiresInSeconds: Config.jwt.expires_in_seconds
            });


            return callback(null, {
                jwt: token
            });
        });
    });
};


/**
 * ShowByEmail
 */

User.prototype.showByEmail = function (email, callback) {


    /**
     * Validate
     */

    if (!email) return callback({
        status: 400,
        message: 'Bad Request: Email is required'
    }, null);


    /**
     * Find User
     */

    var params           = {};
    params.TableName     = dynamoMetadata.tableName;
    params.IndexName     = dynamoMetadata.indexes['email-index'].name;
    params.KeyConditions = [
        ModelDynamoDBDoc.Condition("email", "EQ", email)
    ];

    ModelDynamoDBDoc.query(params, function (error, response) {

        if (error || !response) return callback({
            status: 500,
            message: 'Sorry, something went wrong.',
            raw: error
        }, null);

        return callback(null, response.Items && response.Items[0] ? response.Items[0] : null);

    });
};


/**
 * ShowByID
 */

User.prototype.showByID = function (user_id, callback) {


    /**
     * Validate
     */

    if (!user_id) return callback({
        status: 400,
        message: 'Bad Request: User ID is required'
    }, null);


    /**
     * Find User
     */

    var params           = {};
    params.TableName     = dynamodb_table;
    params.KeyConditions = [
        ModelDynamoDBDoc.Condition("_id", "EQ", user_id)
    ];

    ModelDynamoDBDoc.query(params, function (error, response) {

        if (error || !response) return callback({
            status: 500,
            message: 'Sorry, something went wrong.',
            raw: error
        }, null);

        return callback(null, response.Items && response.Items[0] ? response.Items[0] : null);

    });
};


/**
 * Save
 * - Updates existing record or creates a record if one does not already exist
 */

User.prototype.save = function (user, callback) {


    /**
     * Validate
     */

    if (!user.email) return callback({
        status: 400,
        message: 'Bad Request: Email is required'
    }, null);

    if (!user.password) return callback({
        status: 400,
        message: 'Bad Request: Password is required'
    }, null);

    /**
     * Perform Save
     */

    var params = {
        TableName: dynamoMetadata.tableName,
        ReturnValues: 'ALL_NEW',
        Key: {
            '_id': user._id
        },
        UpdateExpression: 'SET ',
        ExpressionAttributeNames: {},
        ExpressionAttributeValues: {}
    };


    /**
     * Basic Information
     */

        // email
    params.UpdateExpression                        = params.UpdateExpression + '#a0 = :email_val, ';
    params.ExpressionAttributeNames['#a0']         = 'email';
    params.ExpressionAttributeValues[':email_val'] = user.email;

    // password
    params.UpdateExpression                           = params.UpdateExpression + '#a1 = :password_val, ';
    params.ExpressionAttributeNames['#a1']            = 'password';
    params.ExpressionAttributeValues[':password_val'] = user.password;

    // salt
    params.UpdateExpression                       = params.UpdateExpression + '#a2 = :salt_val, ';
    params.ExpressionAttributeNames['#a2']        = 'salt';
    params.ExpressionAttributeValues[':salt_val'] = user.salt;

    // plan
    params.UpdateExpression                       = params.UpdateExpression + '#a3 = :plan_val, ';
    params.ExpressionAttributeNames['#a3']        = 'plan';
    params.ExpressionAttributeValues[':plan_val'] = user.plan;

    // sign_in_count
    params.UpdateExpression                                = params.UpdateExpression + '#a4 = :sign_in_count_val, ';
    params.ExpressionAttributeNames['#a4']                 = 'sign_in_count';
    params.ExpressionAttributeValues[':sign_in_count_val'] = user.sign_in_count;

    // created
    if (isNaN(user.created)) user.created = moment(user.created).unix();
    params.UpdateExpression                          = params.UpdateExpression + '#b0 = :created_val, ';
    params.ExpressionAttributeNames['#b0']           = 'created';
    params.ExpressionAttributeValues[':created_val'] = user.created;

    // updated
    params.UpdateExpression                          = params.UpdateExpression + '#b1 = :updated_val, ';
    params.ExpressionAttributeNames['#b1']           = 'updated';
    params.ExpressionAttributeValues[':updated_val'] = moment().unix();


    /**
     * Save
     */

        // Remove Any Trailing Commas & Space In Update Expression
    params.UpdateExpression = params.UpdateExpression.trim();
    if (params.UpdateExpression[params.UpdateExpression.length - 1] === ',') params.UpdateExpression = params.UpdateExpression.substring(0, params.UpdateExpression.length - 1);


    ModelDynamoDBDoc.updateItem(params, function (error, response) {

        if (error || !response) return callback({
            status: 500,
            raw: error
        }, null);

        return callback(null, response.Attributes);

    });
};


/**
 * Hash Password
 */

User.prototype.hashPassword = function (user) {

    user.salt     = bcryptjs.genSaltSync(10);
    user.password = bcryptjs.hashSync(user.password, user.salt);

    return user;

};
