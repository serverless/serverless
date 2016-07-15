const openwhisk = require('openwhisk');
const Credentials = require('./credentials');
const SError = require('../../../classes/Error');

const WskProps = ['apihost', 'auth', 'namespace'];

function FromWskProps() {
  const validate = (wskProps) => {
    WskProps.forEach(prop => {
      if (!wskProps[prop]) {
        throw new SError.SError(
          `Missing mandatory openwhisk configuration property: ${prop.toUpperCase()}.` +
            ' Check .wskprops file or set environment variable?'
        );
      }
    });
    return wskProps;
  };

  return Credentials.getWskProps().then(validate).then(wskProps =>
    openwhisk({ api: wskProps.apihost, api_key: wskProps.auth, namespace: wskProps.namespace })
  );
}

module.exports = {
  fromWskProps: FromWskProps,
};
