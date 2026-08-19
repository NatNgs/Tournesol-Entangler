let showNextSuggestion = null
async function computeUserSuggestions(dataset, user, parentDiv) {
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

	// Build comparisons data
	for(const date in dataset.comparisons[user]['largely_recommended']) {
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
	}

	// Prepare graph object for ascendingDescendingNodes
	const graphData = {
		nodes: Object.keys(nodeDegrees),
		edges: directedEdges
	}

	// Ascending/descending nodes
	const ascdsc = await ascendingDescendingNodes(graphData)

	// Reverse ascdsc format: {node : { ascending, descending, equals, cmps, targets }}
	const candidatesData = {}
	const connectivity = []
	for(const node of graphData.nodes) {
		candidatesData[node] = {
			id: node,
			ascending: ascdsc.ascending[node],
			descending: ascdsc.descending[node],
			equals: ascdsc.equals[node],
			cmps: nodeDegrees[node], // Replaced undirGraph.degree(node)
			cntrs: Object.values(dataset.contributors[node].largely_recommended).length,
			target: targetCmpNb(dataset, node),
			lastCompared: getLastCompared(dataset, user, node),
		}
		connectivity.push(candidatesData[node].ascending.size + candidatesData[node].descending.size + candidatesData[node].equals.size)
	}

	// Compute user connectivity score
	// -> Each video get a score from 0 (has no ascendant, descendant or equals) to 1 (every other video is in ascendant, descendant or equal)
	// -> Then sum all these connectivity scores
	connectivity.sort((a,b) => a-b)
	const averageConn = connectivity.reduce((a,b) => a+b, 0) / connectivity.length
	const userConnectivityScore = {
		min: connectivity[0],
		q1: connectivity[(connectivity.length/4)|0],
		q2: connectivity[(connectivity.length/2)|0],
		q3: connectivity[((connectivity.length*3)/4)|0],
		max: connectivity[connectivity.length-1],
		all: averageConn,
		pct: (averageConn-1)/(graphData.nodes.length-2), // Min possible value is 1 => 0%, max is (graphData.nodes.length -1) => 100%
	}

	// Display all nodes as divs in parentDiv
	parentDiv.innerHTML = ''
	const getNextSuggestion = generateDirectedConnections(candidatesData)

	showNextSuggestion = async () => {
		await sleep(0) // Wait a bit to prevent freezing the view
		const next = getNextSuggestion()
		if(next == null) return

		const [a, b] = next
		try {
			makeSuggestionDiv(candidatesData, parentDiv, a, b)
		} catch(e) {
			console.error(e)
			await showNextSuggestion() // Compute another suggestion in 100ms
		}
	}

	// Init 10 suggestions, deffered
	setTimeout(async () => {for(let i = 0; i < 10; i++) await showNextSuggestion()}, 100)

	return userConnectivityScore
}

/**
 * Computes ascending/descending/equal nodes from a plain graph data object.
 * @param {Object} graphData - { nodes: string[], edges: [{ source, target, attributes: { score } }] }
 */
async function ascendingDescendingNodes(graphData) {
	const ascending = {} // node -> Map(ascendant, distance)
	const descending = {} // node -> Map(descendant, distance)
	const equals = {} // node -> Map(equal, distance)

	// Init
	for(const node of graphData.nodes) {
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

			if((++it) % 500 === 0) await sleep(0) // Wait a bit to prevent freezing the view
		}

		// Recalculate total based on Map sizes
		newTotal = 0
		for(const node in ascending) newTotal += ascending[node].size
		for(const node in descending) newTotal += descending[node].size
		for(const node in equals) newTotal += equals[node].size

		console.debug('ascendingDescendingNodes : ', newTotal - total, 'new connexions added/updated')
		await sleep(0) // Wait a bit to prevent freezing the view
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

function getNodeInfoDiv(cId, cData, maxConnct) {
	const div = document.createElement('div')
	div.className = 'nodeInfoGroup'
	div.appendChild(makeVideoDiv(cId))
	const nodeInfo = document.createElement('div')
	const connectivityValue = (cData.ascending.size+cData.equals.size+cData.descending.size)/maxConnct
	const connectivityStr = connectivityValue < 0.01 ? '⚠️<1%' : `${(connectivityValue*100)|0}%`
	nodeInfo.innerHTML = [
		`${connectivityValue >= 0.01 && cData.descending.size === 0  ? '🔝' : ''}${connectivityStr}&nbsp;connected`,
		`${cData.cmps}&nbsp;comparison${cData.cmps === 1 ? '' : 's'}&nbsp;by&nbsp;me`,
		`${cData.cntrs}&nbsp;contributor${cData.cntrs === 1 ? '' : 's'}`
	].join(' - ')
	nodeInfo.className = 'nodeInfo'
	div.appendChild(nodeInfo)

	return div
}

function makeSuggestionDiv(candidatesData, parentDiv, a, b) {
	const div = document.createElement('li')
	div.className = 'compSuggestion'

	const maxConnct = Object.keys(candidatesData).length - 1

	// First node
	div.appendChild(getNodeInfoDiv(a, candidatesData[a], maxConnct))

	// Append "-vs-" span
	const vsSpan = document.createElement('span')
	vsSpan.innerHTML = '&nbsp;vs&nbsp;'
	div.appendChild(vsSpan)

	// Second node
	div.appendChild(getNodeInfoDiv(b, candidatesData[b], maxConnct))

	// Add button div
	const buttonDiv = document.createElement('div')
	buttonDiv.className = 'buttonDiv'
	div.appendChild(buttonDiv)

	// Add button to compare
	const compareButton = document.createElement('a')
	compareButton.innerHTML = 'Compare&nbsp;🌻'
	compareButton.className = 'button'
	compareButton.href = `https://tournesol.app/comparison?uidA=yt:${a}&uidB=yt:${b}`
	compareButton.target = '_blank'
	buttonDiv.appendChild(compareButton)

	// Add button to the end of the div, named "Hide", on click, hide this <li>
	const hideButton = document.createElement('button')
	hideButton.innerText = 'Hide/Ignore'
	hideButton.className = 'button'
	hideButton.onclick = () => {
		// Set div height to 0, then wait a second, then remove the parent
		div.classList.add('hidden')
		setTimeout(() => div.remove(), 1000)
		setTimeout(showNextSuggestion)
	}
	buttonDiv.appendChild(hideButton)

	parentDiv.appendChild(div)
}

function makeVideoDiv(videoId) {
	//console.log(data.title);
	//console.log(data.author_name);
	//console.log(data.thumbnail_url);

	const vdiv = document.createElement('a')
	vdiv.className = 'nodeId'
	vdiv.href = `https://tournesol.app/entities/yt:${videoId}`
	vdiv.target = '_blank'
	vdiv.rel = 'noopener noreferrer'

	const vimg = document.createElement('img')
	vimg.src = '' // TODO
	vimg.style = 'opacity: 0;'
	vimg.className = 'nodeImg'
	vdiv.appendChild(vimg)

	const textDiv = document.createElement('div')
	textDiv.className = 'nodeText'
	vdiv.appendChild(textDiv)

	const vauthor = document.createElement('div')
	vauthor.innerText = 'yt:' + videoId
	vauthor.className = 'nodeAuthor'
	textDiv.appendChild(vauthor)

	const vtitle = document.createElement('div')
	vtitle.innerText = 'Loading video information...' // TODO
	vtitle.className = 'nodeTitle'
	textDiv.appendChild(vtitle)

	const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
	fetch(url).then(async r => {
		if(!r.ok) {
			vtitle.innerText = '(Unavailable, unlisted or removed)'
		} else {
			const data = await r.json()
			vimg.src = data.thumbnail_url
			vimg.style = ''
			vauthor.innerText = data.author_name
			vtitle.innerText = data.title
		}
	})

	return vdiv
}
