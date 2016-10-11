'use strict'

module.exports.run = (event, context, callback) => {
  const time = new Date()
  console.log(`Your cron ran ${time}`)
}