'use strict';

module.exports = async (modPath) => import(`file:///${modPath}`);
