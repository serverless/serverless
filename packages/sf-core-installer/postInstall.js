#!/usr/bin/env node

const { install: maybeInstall } = require('./binary')
maybeInstall().then(() => {})
