'use strict';

// Your function handler
module.exports.staticHtml = function (event, context, callback) {
  var defaultEmptyHTML = ''
  var dynamicHtml = defaultEmptyHTML
  /* check for GET params and use if available */
  if(event.query && event.query.name) {
    // yourendpoint.com/dev/landing-page?name=bob
    dynamicHtml = `<p>Hey ${event.query.name}</p>`
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
    <script>
      console.log('Hi there!')
    </script>
  </html>`;
  // callback will send message object back
  callback(null, html);
};
