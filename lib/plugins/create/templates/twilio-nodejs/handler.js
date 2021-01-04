const logo = require('asciiart-logo');

exports.handler = function (context, event, callback) {
  callback(
    null,
    logo({
      name: 'Twilio Runtime',
      version: '1.0.0',
    }).render()
  );
};
