'use strict';

module.exports = {
  type: 'object',
  properties: {
    DeleteMarkerReplication: require('./DeleteMarkerReplication'),
    Destination: require('./ReplicationDestination'),
    Filter: require('./ReplicationRuleFilter'),
    Id: {
      type: 'string',
    },
    Prefix: {
      type: 'string',
    },
    Priority: {
      type: 'integer',
    },
    SourceSelectionCriteria: require('./SourceSelectionCriteria'),
    Status: {
      type: 'string',
    },
  },
  required: ['Destination', 'Status'],
  additionalProperties: false,
};
