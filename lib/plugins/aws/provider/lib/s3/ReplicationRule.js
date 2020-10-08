'use strict';

module.exports = {
  type: 'object',
  properties: {
    DeleteMarkerReplication: require('./DeleteMarkerReplication'),
    Destination: require('./ReplicationDestination'),
    Filter: require('./ReplicationRuleFilter'),
    Id: {
      type: 'string',
      maxLength: 255,
    },
    Prefix: {
      type: 'string',
    },
    Priority: {
      type: 'integer',
    },
    SourceSelectionCriteria: require('./SourceSelectionCriteria'),
    Status: {
      enum: ['Disabled', 'Enabled'],
    },
  },
  required: ['Destination', 'Status'],
  additionalProperties: false,
};
