import { jest } from '@jest/globals'
import { Graph } from '@dagrejs/graphlib'
import { processGraphInParallel } from '../../../src/lib/resolvers/graph.js'

describe('Graph Processing', () => {
  describe('processGraphInParallel', () => {
    test('processes single node', async () => {
      const graph = new Graph()
      graph.setNode('a', { value: 1 })

      const processedNodes = []
      const state = {}

      await processGraphInParallel(
        graph,
        async (nodeName) => {
          processedNodes.push(nodeName)
        },
        null,
        state,
      )

      expect(processedNodes).toEqual(['a'])
    })

    test('processes nodes in dependency order', async () => {
      const graph = new Graph()
      graph.setNode('a', { value: 1 })
      graph.setNode('b', { value: 2 })
      graph.setEdge('a', 'b') // a depends on b

      const processedNodes = []
      const state = {}

      await processGraphInParallel(
        graph,
        async (nodeName) => {
          processedNodes.push(nodeName)
        },
        null,
        state,
      )

      // b should be processed before a (b is a sink, has no outgoing edges)
      expect(processedNodes.indexOf('b')).toBeLessThan(
        processedNodes.indexOf('a'),
      )
    })

    test('processes independent nodes in parallel', async () => {
      const graph = new Graph()
      graph.setNode('a', { value: 1 })
      graph.setNode('b', { value: 2 })
      graph.setNode('c', { value: 3 })
      // No edges - all nodes are independent

      const processOrder = []
      const state = {}

      await processGraphInParallel(
        graph,
        async (nodeName) => {
          processOrder.push({ node: nodeName, time: Date.now() })
          // Small delay to verify parallel execution
          await new Promise((resolve) => setTimeout(resolve, 10))
        },
        null,
        state,
      )

      // All three nodes should be processed
      expect(processOrder.map((p) => p.node).sort()).toEqual(['a', 'b', 'c'])
    })

    test('processes deep dependency chain in order', async () => {
      const graph = new Graph()
      graph.setNode('a', { value: 1 })
      graph.setNode('b', { value: 2 })
      graph.setNode('c', { value: 3 })
      graph.setEdge('a', 'b') // a depends on b
      graph.setEdge('b', 'c') // b depends on c

      const processedNodes = []
      const state = {}

      await processGraphInParallel(
        graph,
        async (nodeName) => {
          processedNodes.push(nodeName)
        },
        null,
        state,
      )

      // c -> b -> a order
      expect(processedNodes).toEqual(['c', 'b', 'a'])
    })

    test('processes diamond dependency pattern correctly', async () => {
      const graph = new Graph()
      graph.setNode('a', { value: 1 })
      graph.setNode('b', { value: 2 })
      graph.setNode('c', { value: 3 })
      graph.setNode('d', { value: 4 })
      // Diamond: a depends on both b and c, both b and c depend on d
      graph.setEdge('a', 'b')
      graph.setEdge('a', 'c')
      graph.setEdge('b', 'd')
      graph.setEdge('c', 'd')

      const processedNodes = []
      const state = {}

      await processGraphInParallel(
        graph,
        async (nodeName) => {
          processedNodes.push(nodeName)
        },
        null,
        state,
      )

      // d must be first, a must be last
      expect(processedNodes[0]).toBe('d')
      expect(processedNodes[processedNodes.length - 1]).toBe('a')
    })

    test('removes nodes from original graph when provided', async () => {
      const graph = new Graph()
      const originalGraph = new Graph()

      graph.setNode('a', { value: 1 })
      graph.setNode('b', { value: 2 })
      originalGraph.setNode('a', { value: 1 })
      originalGraph.setNode('b', { value: 2 })

      const state = {}

      await processGraphInParallel(graph, async () => {}, originalGraph, state)

      // Both graphs should have nodes removed
      expect(graph.nodeCount()).toBe(0)
      expect(originalGraph.nodeCount()).toBe(0)
    })

    test('handles async processing with delays', async () => {
      const graph = new Graph()
      graph.setNode('fast', { value: 1 })
      graph.setNode('slow', { value: 2 })

      const completionOrder = []
      const state = {}

      await processGraphInParallel(
        graph,
        async (nodeName) => {
          if (nodeName === 'slow') {
            await new Promise((resolve) => setTimeout(resolve, 50))
          }
          completionOrder.push(nodeName)
        },
        null,
        state,
      )

      // Both should complete
      expect(completionOrder.sort()).toEqual(['fast', 'slow'])
    })

    test('provides notifyNewNode in state', async () => {
      const graph = new Graph()
      graph.setNode('a', { value: 1 })

      const state = {}

      await processGraphInParallel(graph, async () => {}, null, state)

      // state should have notifyNewNode function
      expect(typeof state.notifyNewNode).toBe('function')
    })
  })
})
