// Copyright (c) 2017 Sami Jaktholm <sjakthol@outlook.com>
'use strict'
const chalk = require('chalk');
const analysis = require('./analysis');
const renderers = require('./analysisRenderers');

/**
 * @param {Function} logger
 * @param {KeyValueChanges} changes
 */
function printKeyValueChanges(logger, changes, title) {
  if (!changes.added.length && !changes.removed.length && !changes.modified.length) {
    // No tag changes!
    return
  }

  logger.log() // Print empty line to separate this from previous section
  logger.log(chalk.bold(title))
  /**
   * @param {String} action
   * @param {KeyValueChange[]} valueChanges
   */
  function doPrintKeyValueChanges(action, valueChanges) {
    for (const change of valueChanges) {
      const type = renderers.renderAction({ Action: action })
      const summary = renderers.renderKeyValueChange(change)
      logger.log(`${type} ${summary}`)
    }
  }

  doPrintKeyValueChanges('Add', changes.added)
  doPrintKeyValueChanges('Remove', changes.removed)
  doPrintKeyValueChanges('Modify', changes.modified)
}

/**
 * @param {Function} logger
 * @param {Object} changes
 * @param {AWS.CloudFormation.ResourceChange[]} changes.added
 * @param {AWS.CloudFormation.ResourceChange[]} changes.removed
 * @param {AWS.CloudFormation.ResourceChange[]} changes.modified
 */
function printResourceChanges(logger, changes) {
  /**
   * @param {AWS.CloudFormation.ResourceChange[]} resourceChanges
   */
  function doPrintResources(resourceChanges) {
    for (const change of resourceChanges) {
      const type = renderers.renderAction(change)
      const resource = renderers.renderResourceSummary(change)
      const replacement = renderers.renderReplacement(change)
      logger.log(`${type} ${resource}${replacement}`)

      for (const detail of change.Details) {
        const recreation = renderers.renderRecreation(detail)
        logger.log(`    - ${detail.Summary}${recreation}`)
        for (const cause of (detail.Causes || [])) {
          logger.log(`        caused by ${cause}`)
        }
      }
    }
  }

  logger.log(chalk.bold('Resource Changes'))
  doPrintResources(changes.added)
  doPrintResources(changes.removed)
  doPrintResources(changes.modified)
}

function print(logger, stack, changeSet) {
  const resourceChanges = analysis.analyzeResourceChanges(changeSet)
  printResourceChanges(logger, resourceChanges)

  const tagChanges = analysis.analyzeTagChanges(changeSet, stack)
  printKeyValueChanges(logger, tagChanges, 'Tag Changes')

  const parameterChanges = analysis.analyzeParameterChanges(changeSet, stack)
  printKeyValueChanges(logger, parameterChanges, 'Parameter Changes')
}


module.exports = {
  print
}