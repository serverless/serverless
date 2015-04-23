/** 
 * AWS Lambda Task
 * - Put tasks in here that take a while to process
 * - Then will be uploaded to AWS Lambda and executed there
 */

var async = require('async');
var moment = require('moment');
var etsyjs = require('etsy-js');
var etsyClient = etsyjs.client({
    key: 'key',
    secret: 'secret',
    callbackURL: 'http://localhost:3000/authorise'
});
var doc = require('dynamodb-doc');
var dynamo = new doc.DynamoDB();

module.exports = function(event, context) {

    /**
     * Validate Event
     */

    if (!event.sync_days_preference || !event.servant_access_token || !event.servant_id || !event.etsy_user_id || !event.etsy_shop_id || !event.etsy_access_token) return context.done("Missing required event data", null);

    /**
     * Set Defaults
     */

    var _this = this;

    // Create new sync record
    var sync = {};
    sync.status = 'not_finished';
    sync.servant_id = event.servant_id;
    sync.etsy_user_id = event.etsy_user_id;
    sync.etsy_shop_id = event.etsy_shop_id;
    sync.date_started = moment().format('X'); // Unix timestamp
    sync.date_completed = null; // Update after
    sync.etsy_products_updated = 0;
    sync.etsy_products_created = 0;
    sync.servant_products_updated = 0;
    sync.servant_products_created = 0;
    sync.etsy_page = 1;
    sync.servant_page = 1;
    sync.etsy_more_products = true;

    /**
     * Function: Error Handler
     * - Clean-up and handle erros
     */

    _this.errorHandler = function(error) {
        // Save Sync As Failed

        // Return
        return context.done({
            message: error
        }, null);
    }

    /**
     * Function: Load Etsy Products
     * - Load 25 listings of Etsy Products
     */

    _this.loadEtsyProducts = function(page, callback) {

        // Load 25 Products From Etsy

    };

    /**
     * Function: Process Etsy Product
     * - Process Batch of 25 Etsy Products
     */

    _this.processEtsyProductBatch = function(etsy_product_batch, callback) {

        // Collect IDs of products in array

        // DynamoDB find all ProductLinks in ID array

        async.eachLimit(etsy_product_batch, 10, function(product, productCallback) {

            // Loop through DynamoDB ProductLinks and find matching ProductLink, if any

            // If ProductLink exists, check date against listing last_modified, if ProductLink date exceeds last_modified, return callback

            // If ProductLink doesn't exist or needs an update, do it

            // Perform Servant Update from Etsy

            // On update complete, update the ProductLink

            // Update the sync object

            // Return productCallback

        }, function(error) {

            // Save Sync Record for progress keeping

            // If Etsy returned less than the total batch number, there are no more products, set sync.etsy_more_products to false

            // Return callback

        });
    };

    /**
     * Function: Update Servant From Etsy
     */

    _this.updateServantFromEtsy = function(product_link, etsy_product, callback) {

        // Create Servant Product from Etsy Product

        var servant_product = {};

        // If product_link, update existing Servant product

        // If no product_link, create new Servant product

        // Handle Images separately

        // Return callback

    };


    /**
     * Run Control Flow Here
     */

    // Synchronous loop that pulls in Etsy products

    async.whilst(
        function() {
            return sync.etsy_more_products;
        },
        function(callback) {
            count++;
            setTimeout(callback, 1000);
        },
        function(err) {
            // 5 seconds have passed
        }
    );




    /**
     * Example Code
     */


    var params = {};
    params.TableName = "etsysync_users";
    params.KeyConditions = [dynamo.Condition("servant_user_id", "EQ", "5452b89c09bb400b00d9f71d")];

    dynamo.query(params, function(error, result) {
        if (error) return context.done(error, null);
        return context.done(null, result);
    });

};