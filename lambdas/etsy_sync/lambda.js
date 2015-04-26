/**
 * Lambda Function Dependencies
 * - Define your lambda funciton dependencies here
 */

var async = require('async');
var request = require('request');
var moment = require('moment');
var doc = require('dynamodb-doc');
var dynamo = new doc.DynamoDB();


/**
 * Lambda Function
 * - Etsy allows 10,000 requests per 24 hours, 10 queries per second
 * - Etsy has headers that tell you how many requests you've made
 * - The strategy here to reduce API Requests is to have each endpoint (Servant, Etsy) interact with SyncLink records saved in this app's database, instead of interacting with themselves.   
 * - Also do everything synchronously, to not send too many API Requests too fast
 */

module.exports.lambda_function = function(event, context) {

    /**
     * Validate Event
     */

    // if (!event.etsy ||
    //     !event.etsy.keystring ||
    //     !event.etsy.shared_secret ||
    //     !event.etsy.user_id ||
    //     !event.etsy.user_shop_id ||
    //     !event.etsy.user_access_token ||
    //     !event.servant ||
    //     !event.servant.access_token ||
    //     !event.servant.servant_id) {
    //     return context.done("Error: Missing required event data", null);
    // }


    /**
     * Defaults
     */

    var Sync = {

        /**
         * Variables
         */

        date: moment(),
        api_request_delay: 300, // Adjust to slow or speed up API Request Rates to Resources
        etsy: {
            base_url: 'https://openapi.etsy.com/v2'
        },
        servant: {},

        /**
         * Functions
         */

        functions: {

            errorHandler: function(error) {
                // Save Sync As Failed

                // Return
                return context.done({
                    message: error
                }, null);
            },

            callAPI: function(url, method, body, callback) {

                var options = {
                    url: url,
                    method: method,
                    json: true
                };

                setTimeout(function() {

                    request(options, function(error, response, body) {
                        return callback(error, response, body);
                    });

                }, Sync.api_request_delay);

            },

            getEtsyProducts: function(offset, callback) {

                Sync.functions.callAPI(Sync.etsy.base_url + '/shops/' + event.etsy.user_shop_id + '/listings/active?api_key=' + event.etsy.keystring + '&limit=100&sort_on=created&sort_order=up&offset=' + offset, 'GET', null, function(error, response, body) {
                    return callback(error, response, body);
                });

            },

            processEtsyProduct: function(etsy_product, callback) {

                // Defaults
                image_stats = {
                    more: true,
                    total: 0,
                    current: 0,
                    offset: 0
                };

                // Fetch SyncLink

                // if (!synclink) Create Servant Product
                // if (etsy_product.last_modified_tsz > synclink.updated) // Update Servant Product

                // Update SyncLink with the Sync.date

                // Fetch Images
                Sync.callAPI(Sync.etsy.base_url + '/listings/' + etsy_product.listing_id + '/images?api_key=' + event.etsy.keystring + '&limit=100&sort_on=created&sort_order=up', 'GET', null, function(error, response, body) {

                    async.eachSeries(body.results, function(image, imageCallback) {

                    }, function(error) {


                        /**
                         * TODO: Check For Deleted Images
                         * - You could do this by saving the Sync.date to every Image SyncLink each time you process them.
                         * - Then in this area, call in all Images for this product with processing dates less than the current Sync.date
                         * - These are the deleted images
                         * - Make a setting for the user that let's them turn on/off deleting data
                         */


                    });

                });
            },

            processEtsyProductImage: function(etsy_product_image, callback) {

                // Fetch SyncLink

                // if (!synclink) Create Servant Product Image
                // if (etsy_product.last_modified_tsz > synclink.updated) // Update Servant Product Image

            },

            processEtsyShop: function(callback) {

                // Defaults
                var product_stats: {
                    more: true,
                    total: 0,
                    current: 0,
                    offset: 0
                };

                async.whilst(
                    function() {
                        return product_stats.more;
                    },
                    function(productCallback) {

                        // Get Etsy products
                        Sync.functions.getEtsyProducts(function(error, response, body) {

                            // Update product_stats

                            // Process Products
                            async.eachSeries(etsy_product_batch, function(product, productCallback) {

                                //  Process Etsy Product

                                // Return productCallback

                            }, function(error) {

                                // Save Sync Record for progress keeping

                                // If Etsy returned less than the total batch number, there are no more products, set product_stats.more to false

                                // Return callback

                            });

                        });

                    },
                    function(error) {

                        /**
                         * TODO: Check For Deleted Products
                         * - You could do this by saving the Sync.date to every Product SyncLink each time you process them.
                         * - Then in this area, call in all Product SyncLinks for this Etsy Store with processing dates less than the current Sync.date
                         * - These reveal the deleted products
                         * - Make a setting for the user that let's them turn on/off deleting data
                         */

                    }
                );
            }
        }
    };



    /**
     * Fire Functions Here
     */

    // Create a new Sync record

};