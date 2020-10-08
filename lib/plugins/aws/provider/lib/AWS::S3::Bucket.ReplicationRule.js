'use strict';

module.exports = {
  type: 'object',
  properties: {
    DeleteMarkerReplication: {
      type: 'DeleteMarkerReplication',
    },
    Destination: {
      type: 'ReplicationDestination',
    },
    Filter: {
      type: 'ReplicationRuleFilter',
    },
    Id: {
      type: 'string',
    },
    Prefix: {
      type: 'string',
    },
    Priority: {
      type: 'integer',
    },
    SourceSelectionCriteria: {
      type: 'SourceSelectionCriteria',
    },
    Status: {
      type: 'string',
    },
  },
  required: ['Destination', 'Status'],
  additionalProperties: false,
};
