let showNextSuggestion = null
function computeUserSuggestions(dataset, user, parentDiv) {
	// Load user data in 2 graphs
	const undirGraph = new graphology.UndirectedGraph()
	const dirGraph = new graphology.DirectedGraph()

	// Build comparisons graphs
	for(const date in dataset.comparisons[user]['largely_recommended']) {
		for(const cmp of dataset.comparisons[user]['largely_recommended'][date]) {
			undirGraph.mergeUndirectedEdge(cmp.pos, cmp.neg)
			if(cmp.score >= 0) dirGraph.mergeDirectedEdge(cmp.pos, cmp.neg, {score: +cmp.score})
			else if(cmp.score <= 0) dirGraph.mergeDirectedEdge(cmp.neg, cmp.pos, {score: -cmp.score})
		}
	}

	// Ascending/descending nodes
	const ascdsc = ascendingDescendingNodes(dirGraph)

	// Revese ascdsc format: {node : { ascending, descending, equals, cmps, targets }}
	const candidatesData = {}
	for(const node of undirGraph.nodes()) {
		candidatesData[node] = {
			id: node,
			ascending: ascdsc.ascending[node],
			descending: ascdsc.descending[node],
			equals: ascdsc.equals[node],
			cmps: undirGraph.degree(node),
			cntrs: Object.values(dataset.contributors[node].largely_recommended).length,
			target: targetCmpNb(dataset, node),
			lastCompared: getLastCompared(dataset, user, node),
		}
	}

	// Display all nodes as divs in parentDiv
	parentDiv.innerHTML = ''
	const getNextSuggestion = generateDirectedConnections(candidatesData)
	showNextSuggestion = () => {
		const next = getNextSuggestion()
		if(next == null) return

		const [a, b] = next
		makeSuggestionDif(candidatesData, parentDiv, a, b)
	}

	// Init 10 suggestions
	for(let i = 0; i < 10; i++) {
		showNextSuggestion()
	}
}


function ascendingDescendingNodes(digraph) {
	const ascending = {} // node -> Map(ascendant, distance)
	const descending = {} // node -> Map(descendant, distance)
	const equals = {}    // node -> Map(equal, distance)

	// Init: Use Maps instead of Sets
	for(const node of digraph.nodes()) {
		ascending[node] = new Map()
		descending[node] = new Map()
		equals[node] = new Map()
	}

	let total = -1
	let newTotal = 0

	// Loop until no new connections (or shorter paths) are found
	while(newTotal > total) {
		total = newTotal

		for(const edge of digraph.edgeEntries()) {
			const { source, target, attributes } = edge
			const edgeDist = 1 // Direct neighbor distance

			if(attributes.score === 0) {
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
				// (If A < Source and Source < Target, then A < Target)
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
				// (If Target < B and Source < Target, then Source < B)
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

				// 4. Reverse check (Target > Source) - usually covered by loop direction,
				// but kept for symmetry with original code's second block
				if(!equals[source].has(target) && !ascending[target].has(source)) {
					if(!ascending[source].has(target) || ascending[source].get(target) > edgeDist) {
						// Note: In a directed graph, this block usually implies the reverse edge exists
						// or handles specific digraph library behaviors.
						// Based on original code logic:
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

		console.debug('ascendingDescendingNodes : ', newTotal - total, 'new connexions added/updated')
	}

	console.debug('ascendingDescendingNodes : ', total, 'total connexions found')

	return {ascending, descending, equals}
}

function targetCmpNb(dataset, node) {
	const contributors = Object.values(dataset.contributors[node].largely_recommended).length
	// const wcontributors = Object.values(dataset.contributors[node].largely_recommended).reduce((a,b) => a+b, 0)

	if(contributors <= 2) return 2
	return (5*(Math.log2(contributors) / Math.log2(5)))|0
	/* Examples:
	 *    1-2 contributors: 2 cmps target
	 *    3-4 contributors: 3-4 cmps target
	 *    5-6 contributors: 5 cmps target
	 *    7-9 contributors: 6 cmps target
	 *  10-13 contributors: 7 cmps target
	 *  14-18 contributors: 8 cmps target
	 *  19-24 contributors: 9 cmps target
	 *  25-34 contributors: 10 cmps target
	 *  35-47, 48-65, 66-90, 91-124, ...
	 */
}

function getLastCompared(dataset, user, node) {
	// Find the latest date having an element where either pos or neg is equal to node
	const dates = Object.keys(dataset.comparisons[user]['largely_recommended'])
	dates.sort((a,b) => new Date(b) - new Date(a)) // Sort from latest to oldest

	for(const date of dates) {
		for(const cmp of dataset.comparisons[user]['largely_recommended'][date]) {
			if(cmp.pos === node || cmp.neg === node) {
				return date
			}
		}
	}
	return null
}

function generateDirectedConnections(data, callback, onEnd) {
	// Candidates (exclude the ones already having more comparisons than target)
	const candidates = []
	for(const node in data) {
		// If less neigbors than target, append
		if(data[node].cmps < data[node].target) {
			candidates.push(node)
		}
	}
	if(!candidates.length) {
		console.debug('No candidates found')
		onEnd()
		return
	}

	candidates.sort((a,b) => {
		// To make A go first, return -1

		// No descending goes first
		if(data[a].descending.size > 0 && data[b].descending.size === 0) return 1 // B first
		if(data[a].descending.size === 0 && data[b].descending.size > 0) return -1 // A first
		// If both have no descending, no equal goes first
		if(data[a].descending.size === 0 && data[b].descending.size === 0) {
			if(data[a].equals.size > 0 && data[b].equals.size === 0) return 1 // B first
			if(data[a].equals.size === 0 && data[b].equals.size > 0) return -1 // A first
		}

		// Any of the two have less than 2 comparisons goes first
		//if(data[a].cmps < 2 && data[b].cmps >= 2) return -1 // A first
		//if(data[b].cmps < 2 && data[a].cmps >= 2) return 1 // B first

		// More comparisons remaining goes first
		const diff = (data[a].cmps / data[a].target) - (data[b].cmps / data[b].target)
		if(diff < 0) return -1 // A first
		if(diff > 0) return 1 // B first

		// Least recently compared goes first
		if(data[a].lastCompared > data[b].lastCompared) return 1 // B first
		if(data[a].lastCompared < data[b].lastCompared) return -1 // A first

		return 0 // Any
	})
	console.debug(candidates.map(c => data[c]))

	return () => {
		while(candidates.length > 2) {
			const c1 = candidates.shift()
			// Find c2 in candidates by order, such as c2 is not in c1.ascending, c1.descending or c1.equals
			for(let i = 0; i < candidates.length; i++) {
				const c2 = candidates[i]
				if(!data[c1].ascending.has(c2) && !data[c1].descending.has(c2) && !data[c1].equals.has(c2)) {
					candidates.splice(i, 1)
					return [c1, c2]
				}
			}
		}
		return null
	}
}


function makeSuggestionDif(candidatesData, parentDiv, a, b) {
	const div = document.createElement('li')
	div.className = 'compSuggestion'

	// First node
	const firstNode = document.createElement('span')
	firstNode.innerHTML = `
		<span class="nodeId">${a}</span>
		<span class="nodeInfo">(${candidatesData[a].cmps}/${candidatesData[a].cntrs})
		${candidatesData[a].descending.size === 0 ? '🔝' : ''}</span>
	`
	div.appendChild(firstNode)

	// Append "-vs-" span
	const vsSpan = document.createElement('span')
	vsSpan.innerText = ' -vs- '
	div.appendChild(vsSpan)

	// Second node
	const secondNode = document.createElement('span')
	secondNode.innerHTML = `
		<span class="nodeId">${b}</span>
		<span class="nodeInfo">(${candidatesData[b].cmps}/${candidatesData[b].cntrs})
		${candidatesData[b].descending.size === 0 ? '🔝' : ''}</span>
	`
	div.appendChild(secondNode)

	// Add button div
	const buttonDiv = document.createElement('div')
	buttonDiv.className = 'buttonDiv'
	div.appendChild(buttonDiv)

	// Add button to compare
	const compareButton = document.createElement('button')
	compareButton.innerText = 'Compare 🌻'
	compareButton.onclick = () => {displayTournesolComparisonModal(a, b)}
	buttonDiv.appendChild(compareButton)

	buttonDiv.append(' ')

	// Add button to the end of the div, named "Hide", on click, hide this <li>
	const hideButton = document.createElement('button')
	hideButton.innerText = 'Hide/Ignore'
	hideButton.onclick = () => {
		// Set div height to 0, then wait a second, then remove the parent
		div.style.height = '0'
		div.style.padding = '0'
		div.style.marginTop = '0'
		div.style.marginBottom = '-0.5em' // negative margin
		setTimeout(() => div.remove(), 1000)
		setTimeout(showNextSuggestion)
	}
	buttonDiv.appendChild(hideButton)

	parentDiv.appendChild(div)
}
