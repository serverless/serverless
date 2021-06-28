'use strict';

module.exports = Boolean(process.pkg && /^(?:\/snapshot\/|[A-Z]+:\\snapshot\\)/.test(__dirname));
