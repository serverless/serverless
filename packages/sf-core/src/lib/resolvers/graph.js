/**
 * This function processes a graph dynamically.
 *
 * @param {Graph} graph - The graph to process.
 * @param {ProcessNode} processNode - The function to process a node.
 * @param {Graph} originalGraph -
 * Optional graph to remove nodes from, based on changes in graph.
 */
export const processGraphInParallel = async (
  graph,
  processNode,
  originalGraph,
  state,
) => {
  const activePromises = new Set() // Tracks active processing promises

  let notifyResolve
  let notify = new Promise((resolve) => {
    notifyResolve = resolve
  })
  // Expose a method in `state` to notify of new nodes to process
  state.notifyNewNode = () => {
    notifyResolve() // Wake up the loop
    notify = new Promise((resolve) => {
      notifyResolve = resolve
    }) // Reset the promise
  }

  // Helper function to mark a node as in progress,
  // process it, and handle its completion by removing it from the graph and returning its predecessors
  const processNodeAndHandleCompletion = async (nodeName) => {
    graph.node(nodeName).inProgress = true // Mark the node as in progress
    await processNode(nodeName) // Process the node
    graph.removeNode(nodeName) // Remove the node from the graph once processed
    if (originalGraph) originalGraph.removeNode(nodeName)
  }

  // Start processing for sinks (nodes without outgoing edges (no dependencies))
  processSinks(graph, processNodeAndHandleCompletion, activePromises)

  // Wait for all node processing to complete
  while (activePromises.size > 0) {
    await Promise.race([...activePromises].map((p) => p.promise).concat(notify))
    // Process the sinks to check if any new nodes are ready to be processed
    processSinks(graph, processNodeAndHandleCompletion, activePromises)
  }
}

/**
 * Process dependent nodes in the graph.
 * @param {Graph} graph - The graph.
 * @param {Function} processNodeAndHandleCompletion - The function to process a node and handle its completion.
 * @param {Set} activePromises - The set of active promises.
 */
function processSinks(graph, processNodeAndHandleCompletion, activePromises) {
  graph.sinks()?.forEach((node) => {
    if (!graph.node(node)?.inProgress) {
      processNodeAndManagePromise(
        node,
        processNodeAndHandleCompletion,
        activePromises,
      )
    }
  })
}

/**
 * Process a node and handle its completion.
 * @param {string} node - The dependent node.
 * @param {Function} processNodeAndHandleCompletion - The function to process a node and handle its completion.
 * @param {Set} activePromises - The set of active promises.
 */
function processNodeAndManagePromise(
  node,
  processNodeAndHandleCompletion,
  activePromises,
) {
  const promise = processNodeAndHandleCompletion(node)
  const promiseAndNodeNameObj = { promise, node }
  activePromises.add(promiseAndNodeNameObj) // Track the active promise (and the node it's processing)
  promise
    // Remove the promise from the active set once it resolves
    .then(() => activePromises.delete(promiseAndNodeNameObj))
    // Rejections are handled by the caller
    .catch(() => {})
}
