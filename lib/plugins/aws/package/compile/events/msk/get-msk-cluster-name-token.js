'use strict';

const getMskClusterNameToken = (eventSourceArn) => {
  if (eventSourceArn['Fn::ImportValue']) {
    return eventSourceArn['Fn::ImportValue'];
  } else if (eventSourceArn.Ref) {
    return eventSourceArn.Ref;
  }

  return eventSourceArn.split('/')[1];
};

module.exports = getMskClusterNameToken;
