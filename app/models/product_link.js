// Module dependencies.
var mongoose = require('mongoose'),
    moment = require('moment'),
    Schema = mongoose.Schema;

/**
 * ProductLink
 * - Links Etsy Listing ID to a Product ID on Servant 
 */
var ProductLinkSchema = new Schema({
    etsy_listing_id: {
        type: String,
        required: true,
        trim: true
    },
    servant_product_id: {
        type: String,
        required: true,
        trim: true
    },
    etsy_user_id: {
        type: String,
        required: true,
        trim: true,
        unique: true
    },
    servant_id: {
        type: String,
        required: true,
        trim: true,
        unique: true
    },
    synced: {
        type: Date,
        default: Date.now
    }
});


/**
 * Statics
 */
ProductLinkSchema.statics = {

    /**
     * Create Product Sync
     * - Creates a Product Link record in the database
     */

    createProductLink: function(etsy_product, servant_product, callback) {
        var _this = this;

        // First, check if a ProductLink record exists for either product
        
        
    }
};



mongoose.model('ProductLink', ProductLinkSchema);