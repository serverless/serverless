'use strict';

const BbPromise = require('bluebird');
const _ = require('lodash');

module.exports = {
  compileListeners() {
    this.validated.events.forEach((event, idx) => {
      const targetGroupLogicalId = this.provider.naming
        .getAlbTargetGroupLogicalId(event.name);
      const listenerLogicalId = this.provider.naming
        .getAlbListenerLogicalId(event.functionName, idx);

      const listener = event.listener;
      const Protocol = listener.split(':')[0].toUpperCase();
      const Port = listener.split(':')[1];
      const LoadBalancerArn = event.loadBalancerArn;
      const CertificateArn = event.certificateArn || null;

      let Certificates = [];
      if (CertificateArn) {
        Certificates = [
          {
            CertificateArn,
          },
        ];
      }

      _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
        [listenerLogicalId]: {
          Type: 'AWS::ElasticLoadBalancingV2::Listener',
          Properties: {
            DefaultActions: [
              {
                TargetGroupArn: {
                  Ref: targetGroupLogicalId,
                },
                Type: 'forward',
              },
            ],
            LoadBalancerArn,
            Certificates,
            Protocol,
            Port,
          },
        },
      });
    });

    return BbPromise.resolve();
  },
};
