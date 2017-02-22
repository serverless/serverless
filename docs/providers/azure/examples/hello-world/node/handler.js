'use strict';

module.exports.hello = (context, req) => {
  context.log('JavaScript HTTP trigger function processed a request.');
  const res = {};
  if (req.query.name || (req.body && req.body.name)) {
    // status: 200, /* Defaults to 200 */
    const name = req.query.name || req.body.name;
    res.body = `Hello ${name}`;
  } else {
    res.status = 400;
    res.body = 'Please pass a name on the query string or in the request body';
  }
  context.done(null, res);
};
