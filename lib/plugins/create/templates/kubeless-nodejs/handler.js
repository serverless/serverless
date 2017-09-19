'use strict';

const _ = require('lodash');

module.exports = {
  capitalize(req, res) {
    let body = [];
    req.on('error', (err) => {
      console.error(err);
    }).on('data', (chunk) => {
      body.push(chunk);
    }).on('end', () => {
      body = Buffer.concat(body).toString();
      res.end(_.capitalize(body));
    });
  },
};
