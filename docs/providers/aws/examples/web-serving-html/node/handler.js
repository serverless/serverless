'use strict';

// Your function handler
module.exports.html = function (event, context, callback) {
  let dynamicHtml;
  /* check for GET params and use if available */
  if (event.queryStringParameters && event.queryStringParameters.name) {
    // yourendpoint.com/dev/landing-page?name=bob
    dynamicHtml = `<p>Hey ${event.queryStringParameters.name}</p>`;
  } else {
    dynamicHtml = '';
  }

  const html = `
  <html>
    <style>
      h1 { color: blue; }
    </style>
    <body>
      <h1>Landing Page</h1>
      ${dynamicHtml}
    </body>
  </html>`;

  const response = {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/html',
    },
    body: html,
  };
  // callback will send HTML back
  callback(null, response);
};
