const apollo = require('apollo-client');

module.exports = (endpoint, auth0IdToken) => {
  const networkInterface = apollo.createNetworkInterface({ uri: endpoint });

  if (auth0IdToken) {
    networkInterface.use([{
      applyMiddleware(req, next) {
        if (!req.options.headers) {
          // eslint-disable-next-line no-param-reassign
          req.options.headers = {};
        }
        const token = auth0IdToken;
        // eslint-disable-next-line no-param-reassign
        req.options.headers.authorization = token ? `Bearer ${token}` : null;
        next();
      },
    }]);
  }

  return new apollo.ApolloClient({
    networkInterface,
  });
};
