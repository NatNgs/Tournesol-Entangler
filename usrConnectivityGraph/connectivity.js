let showNextSuggestion = null
function computeUserConnectivities(dataset, user) {
	const nodeDegrees = {} // Tracks undirected degree (cmps)
	const adjacencyList = {} // Tracks undirected connections for existence checks if needed
	const directedEdges = [] // Stores { source, target, score }

	// Helper to ensure node initialization
	const initNode = (node) => {
		if (!nodeDegrees.hasOwnProperty(node)) {
			nodeDegrees[node] = 0
			adjacencyList[node] = new Set()
		}
	}

	const connectivitiesList = []

	// Build comparisons data
	const sortedDates = Object.keys(dataset.comparisons[user]['largely_recommended'])
	sortedDates.sort((a,b) => a>b ? 1 : -1)

	let ascdsc = {ascending: {}, descending: {}, equals: {}}

	return async () => {
		if(!sortedDates.length) return
		const date = sortedDates.shift()

		for(const cmp of dataset.comparisons[user]['largely_recommended'][date]) {
			const { pos, neg, score } = cmp

			// Initialize nodes if not present
			initNode(pos)
			initNode(neg)

			// Undirected logic (mergeUndirectedEdge equivalent)
			// Increment degree only if this specific pair hasn't been counted for this user/session
			// Note: Original code used mergeUndirectedEdge which handles multi-edges implicitly by degree count.
			// Assuming dataset comparisons are unique per iteration, we increment.
			nodeDegrees[pos]++
			nodeDegrees[neg]++
			adjacencyList[pos].add(neg)
			adjacencyList[neg].add(pos)

			// Directed logic (mergeDirectedEdge equivalent)
			if(score >= 0) {
				directedEdges.push({ source: pos, target: neg, score: +score })
			} else if(score <= 0) {
				directedEdges.push({ source: neg, target: pos, score: -score })
			}
		}
		await sleep(0) // Wait a bit to prevent freezing the view

		// Prepare graph object for ascendingDescendingNodes
		const graphData = {
			nodes: Object.keys(nodeDegrees),
			edges: directedEdges
		}
		ascdsc = await ascendingDescendingNodes(graphData, ascdsc)
		const connectivity = []
		for(const node of graphData.nodes) {
			connectivity.push(ascdsc.ascending[node].size + ascdsc.descending[node].size + ascdsc.equals[node].size)
		}

		// Compute user connectivity score
		// -> Each video get a score from 0 (has no ascendant, descendant or equals) to 1 (every other video is in ascendant, descendant or equal)
		// -> Then sum all these connectivity scores
		connectivity.sort((a,b) => a-b)
		const averageConn = connectivity.reduce((a,b) => a+b, 0) / connectivity.length
		return {
			week: date,
			avg: averageConn,
			max: graphData.nodes.length-1,
			pct: (averageConn-1)/(graphData.nodes.length-2), // Min possible value is 1 => 0%, max is (graphData.nodes.length -1) => 100%
		}
	}
}

/**
 * Computes ascending/descending/equal nodes from a plain graph data object.
 * @param {Object} graphData - { nodes: string[], edges: [{ source, target, attributes: { score } }] }
 */
async function ascendingDescendingNodes(graphData, previous) {
	const ascending = previous.ascending // node -> Map(ascendant, distance)
	const descending = previous.descending // node -> Map(descendant, distance)
	const equals = previous.equals // node -> Map(equal, distance)

	// Init
	for(const node of graphData.nodes) {
		if(ascending.hasOwnProperty(node)) continue
		ascending[node] = new Map()
		descending[node] = new Map()
		equals[node] = new Map()
	}

	let total = -1
	let newTotal = 0

	// Loop until no new connections (or shorter paths) are found
	while(newTotal > total) {
		total = newTotal
		let it = 0

		// Iterate over plain edge array instead of digraph.edgeEntries()
		for(const edge of graphData.edges) {
			const { source, target, attributes } = edge
			const edgeDist = 1 // Direct neighbor distance

			// Handle case where attributes might be missing or score undefined
			const score = (attributes && attributes.score !== undefined) ? attributes.score : edge.score || 0;

			if(score === 0) {
				// --- EQUALS LOGIC ---

				// Propagate equals from source to target
				for(const [node, dist] of equals[source].entries()) {
					if(!ascending[target].has(node) && !descending[target].has(node)) {
						// Only add if not already strictly ascending/descending
						if(!equals[target].has(node) || equals[target].get(node) > dist + edgeDist) {
							equals[target].set(node, dist + edgeDist)
							equals[node].set(target, dist + edgeDist)
						}
					}
				}
				// Propagate equals from target to source
				for(const [node, dist] of equals[target].entries()) {
					if(!ascending[source].has(node) && !descending[source].has(node)) {
						if(!equals[source].has(node) || equals[source].get(node) > dist + edgeDist) {
							equals[source].set(node, dist + edgeDist)
							equals[node].set(source, dist + edgeDist)
						}
					}
				}

				// Direct edge relation
				if(!ascending[source].has(target) && !descending[source].has(target)) {
					if(!equals[source].has(target) || equals[source].get(target) > edgeDist) {
						equals[source].set(target, edgeDist)
						equals[target].set(source, edgeDist)
					}
				}

			} else {
				// --- ASCENDING/DESCENDING LOGIC ---

				// 1. Ascendants of source become ascendants of target
				for(const [node, dist] of ascending[source].entries()) {
					if(!equals[target].has(node) && !descending[target].has(node)) {
						const newDist = dist + edgeDist
						if(!ascending[target].has(node) || ascending[target].get(node) > newDist) {
							ascending[target].set(node, newDist)
							descending[node].set(target, newDist)
						}
					}
				}

				// 2. Descendants of target become descendants of source
				for(const [node, dist] of descending[target].entries()) {
					if(!equals[source].has(node) && !ascending[source].has(node)) {
						const newDist = dist + edgeDist
						if(!descending[source].has(node) || descending[source].get(node) > newDist) {
							descending[source].set(node, newDist)
							ascending[node].set(source, newDist)
						}
					}
				}

				// 3. Direct edge relation (Source < Target)
				if(!equals[target].has(source) && !descending[source].has(target)) {
					if(!ascending[target].has(source) || ascending[target].get(source) > edgeDist) {
						ascending[target].set(source, edgeDist)
						descending[source].set(target, edgeDist)
					}
				}

				// 4. Reverse check (Target > Source)
				if(!equals[source].has(target) && !ascending[target].has(source)) {
					if(!ascending[source].has(target) || ascending[source].get(target) > edgeDist) {
						ascending[source].set(target, edgeDist)
						descending[target].set(source, edgeDist)
					}
				}
			}
		}

		// Recalculate total based on Map sizes
		newTotal = 0
		for(const node in ascending) newTotal += ascending[node].size
		for(const node in descending) newTotal += descending[node].size
		for(const node in equals) newTotal += equals[node].size

		//console.debug('ascendingDescendingNodes : ', newTotal - total, 'new connexions added')
		await sleep(0) // Wait a bit to prevent freezing the view
	}

	//console.debug('ascendingDescendingNodes : ', total, 'total connexions found')

	return {ascending, descending, equals}
}
