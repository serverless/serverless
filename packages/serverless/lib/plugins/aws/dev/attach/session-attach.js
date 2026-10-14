/**
 * The part of a Dev Mode session that changes AWS, after the plan was approved: the live
 * configuration it classifies, the interpreters this machine has for it, the account setup (the
 * broker role, the missing layer versions) and the attach of every function that can run here.
 */
import pLimit from 'p-limit'
import { ServerlessError } from '@serverless/util'
import { isDevModeLayerArn, layerName } from './naming.js'
import { layerArnsOf, variablesOf } from './undo-record.js'
import { ensureLayerVersion } from './layer.js'
import {
  brokerPolicyNeedsRepair,
  createBroker,
  putBrokerPolicy,
} from './broker.js'
import { CONTROL_PLANE_PARALLELISM, attachFunction } from './attach.js'
import * as out from './output.js'
import { adapterFor } from '../local/adapters/index.js'
import { cliCommand } from '../commands/cli-names.js'

/** The live configuration of every selected function, by key (null for the others). */
export const readLiveFunctions = async ({
  keys,
  selection,
  clients,
  deployedName,
}) => {
  const readLimit = pLimit(CONTROL_PLANE_PARALLELISM)
  return new Map(
    await Promise.all(
      keys.map((key) =>
        readLimit(async () => [
          key,
          selection.get(key).selected
            ? await clients.lambda.getFunction(deployedName(key))
            : null,
        ]),
      ),
    ),
  )
}

/**
 * The interpreters this machine has for the live runtimes. `localRuntimes` is null for a stage
 * that was deployed before the session: every live runtime is detected now. After a first
 * deployment it holds what the resolved runtimes predicted, and a live runtime they did not (a
 * plugin can change one while packaging) is detected now, so every attached function has one.
 */
export const detectRuntimes = async ({
  lives,
  localRuntimes,
  detectLocal,
  serviceDir,
}) => {
  const liveRuntimes = [...lives.values()]
    .filter(Boolean)
    .map((live) => live.Runtime)
  if (localRuntimes === null) {
    return detectLocal({ runtimes: liveRuntimes, serviceDir })
  }
  const undetected = liveRuntimes.filter((runtime) => {
    const adapter = adapterFor(runtime)
    return adapter && !localRuntimes[adapter.name]
  })
  if (!undetected.length) return localRuntimes
  return {
    ...localRuntimes,
    ...(await detectLocal({ runtimes: undetected, serviceDir })),
  }
}

/**
 * Creates the broker role when it does not exist (`session.broker` then holds it) and puts back
 * its permission policy when the plan said it was missing or from an earlier version. Returns the
 * broker (`created: true` when it was created now).
 */
export const ensureAccountSetup = async ({
  broker,
  brokerPolicy,
  brokerName,
  identity,
  region,
  clients,
  main,
  session,
}) => {
  if (!broker) {
    main.notice(`Creating IAM role ${brokerName}`)
    broker = await createBroker({
      iam: clients.iam,
      name: brokerName,
      identity,
      region,
    })
    if (!broker) {
      throw new ServerlessError(
        `The IAM role "${brokerName}" was being created by someone else at the same time. Run "${cliCommand('dev')}" again.`,
        'DEV_MODE_BROKER_UNAVAILABLE',
        { stack: false },
      )
    }
    session.broker = broker
  }
  if (brokerPolicyNeedsRepair(brokerPolicy)) {
    // Its creation stopped before the permission policy was written, or an earlier version wrote
    // one that grants more; the plan said so.
    main.notice(`Repairing IAM role ${brokerName}`)
    await putBrokerPolicy({
      iam: clients.iam,
      name: brokerName,
      arn: broker.arn,
      identity,
      region,
    })
  }
  return { broker }
}

/**
 * Publishes the layer versions the plan listed as missing; `layerArns` is filled in place.
 * Returns the names of the layers it published.
 */
export const publishMissingLayers = async ({
  artifacts,
  layerArns,
  layerLambda,
  main,
}) => {
  const published = []
  for (const artifact of artifacts) {
    if (layerArns[artifact.arch]) continue
    main.notice(`Publishing Lambda layer ${layerName(artifact.arch)}`)
    layerArns[artifact.arch] = (
      await ensureLayerVersion({ lambda: layerLambda, artifact })
    ).arn
    published.push(layerName(artifact.arch))
  }
  return published
}

/**
 * Attaches every `dev` row, CONTROL_PLANE_PARALLELISM at a time; a stop that came first leaves the
 * rest `not_started`. Each function is classified again from the configuration read for its write
 * (`classify`), so a change since the plan is honoured: its layer follows the architecture read
 * then, and an `attached` outcome carries that configuration (`live`) and its row. `attached` and `touched` (by deployed name)
 * are kept up to date as outcomes arrive. Returns the outcome of each row, by function key.
 */
export const attachAll = async ({
  devRows,
  deployedName,
  tracked,
  layerArns,
  sleep,
  now,
  liveness,
  classify,
  attachVariables,
  stops,
  attached,
  touched,
  main,
}) => {
  const outcomes = new Map()
  const attachLimit = pLimit(CONTROL_PLANE_PARALLELISM)
  let done = 0
  await Promise.all(
    devRows.map((row) =>
      attachLimit(async () => {
        const name = deployedName(row.function)
        if (stops.signal()) {
          outcomes.set(row.function, { status: 'not_started' })
          return
        }
        let outcome
        try {
          outcome = await attachFunction({
            lambda: tracked,
            name,
            layerArn: layerArns[row.arch],
            sleep,
            now,
            prepare: async (live) => {
              await liveness.coverFunction(live)
              const fresh = classify(row.function, live)
              if (fresh.mode !== 'dev') return { skip: fresh }
              // The layer for the architecture of the revision written against, which a
              // deployment since the plan may have changed.
              const layerArn = layerArns[fresh.arch]
              if (!layerArn) {
                return {
                  skip: {
                    function: row.function,
                    mode: 'deployed',
                    reason: 'not_attached',
                    why: `not attached: its architecture changed while the session started (run ${cliCommand('dev')} again)`,
                    notes: [],
                  },
                }
              }
              return {
                layerArn,
                row: fresh,
                variables: attachVariables(
                  variablesOf(live),
                  layerArnsOf(live).filter(
                    (arn) =>
                      !isDevModeLayerArn(arn, { scope: live.FunctionArn }),
                  ),
                ),
              }
            },
          })
        } catch (error) {
          outcome = { status: 'failed', message: error.message }
        }
        if (outcome.status === 'attached') attached.add(name)
        // Refused by Lambda, or left alone: nothing was changed.
        if (['rejected', 'skipped'].includes(outcome.status)) {
          touched.delete(name)
        }
        outcomes.set(row.function, outcome)
        done += 1
        main.notice(
          `Attaching ${out.functionsWord(devRows.length)} (${done}/${devRows.length})`,
        )
      }),
    ),
  )
  return outcomes
}
