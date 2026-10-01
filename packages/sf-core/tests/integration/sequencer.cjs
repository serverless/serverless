// Splits the live integration suites into one CI job per AWS account and
// starts the slowest suites first. tests/integration/shards.json assigns every
// suite to a shard and records its measured duration; see "CI Test Accounts"
// in TESTING.md for how to add a suite or rebalance.
const path = require('path')
const Sequencer = require('@jest/test-sequencer').default
const shards = require('./shards.json')

// test-1 holds every prerequisite, so a suite missing from the map is safe
// there; the unit guard test still fails until the map lists it.
const DEFAULT_SHARD = 1

const entryOf = (test) =>
  shards.suites[
    path
      .relative(test.context.config.rootDir, test.path)
      .split(path.sep)
      .join('/')
  ]

class IntegrationSequencer extends Sequencer {
  shard(tests, { shardIndex, shardCount }) {
    if (shardCount !== shards.shardCount) {
      throw new Error(
        `tests/integration/shards.json defines ${shards.shardCount} shards, ` +
          `but jest was run with --shard=${shardIndex}/${shardCount}`,
      )
    }
    return tests.filter(
      (test) => (entryOf(test)?.shard ?? DEFAULT_SHARD) === shardIndex,
    )
  }

  // Longest first, so the slowest suite never starts last. Unlisted suites
  // have no recorded duration and go first.
  sort(tests) {
    const seconds = (test) => entryOf(test)?.seconds ?? Infinity
    return [...tests].sort(
      (a, b) => seconds(b) - seconds(a) || a.path.localeCompare(b.path),
    )
  }
}

module.exports = IntegrationSequencer
