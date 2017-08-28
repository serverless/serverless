/*
 *
 * Implement your function here.
 * The function will get the request as a parameter with query/body properties:
 *    var queryparams = req.query;
 *    var body = req.body;
 *
 * The function should return a Promise that resolves with the following structure:
 *  resolve({
 *    statusCode: 200,
 *    body: '{"hello":"from NodeJS4.8 function"}',
 *    headers: {"Content-Type": "application/json"}
 *  })
 *
 */

exports.main = function main (req, res) {
  // The function should return a Promise.
  return new Promise(function(resolve, reject){
    return resolve({
      statusCode: 200,
      body: `hello ${req.query.name || "world"}!`
    });
  });
};
