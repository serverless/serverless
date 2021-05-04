'use strict';

module.exports.hello = (event, context, callback) => {
    callback(null, {statusCode: 200, body: JSON.stringify({message: 'Go Serverless! Your function executed successfully!',
        input: event}, null, 2)})
}