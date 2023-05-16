// TODO: Remove after dropping support for Node.js v12

'use strict';

module.exports = async (modPath) => import(`file://${modPath}`);
