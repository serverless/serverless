'use strict';

module.exports = {

  convertRegionName(name) {
    if (name.includes('aws_useast1')) return 'us-east-1';
    if (name.includes('aws_uswest2')) return 'us-west-2';
    if (name.includes('aws_euwest1')) return 'eu-west-1';
    if (name.includes('aws_eucentral1')) return 'eu-central-1';
    if (name.includes('aws_apnortheast1')) return 'ap-northeast-1';

    if (name.includes('us-east-1')) return 'aws_useast1';
    if (name.includes('us-west-2')) return 'aws_uswest2';
    if (name.includes('eu-west-1')) return 'aws_euwest1';
    if (name.includes('eu-central-1')) return 'aws_eucentral1';
    if (name.includes('ap-northeast-1')) return 'aws_apnortheast1';
  },
};
