
/**
 * @param {string} id youtube video id
 * @param {number} index numerical id
 * @param {DatasetManager} dataset
 */
class Node {
	constructor(user, id, individualScores) {
		this.user = user
		this.id = id  // nodes.indexOf(#) == this node
		this.individualScores = individualScores
		this.vcount = Object.keys(individualScores).length

		// d3js variables
		this.x = null
		this.y = null
		this.vx = null
		this.vy = null
		this.fx = null
		this.fy = null
		this.r = Math.sqrt(this.vcount)
	}
}
class Edge {
	constructor(n1, n2, val) {
		this.source = n1 < n2 ? n1 : n2
		this.target = n1 < n2 ? n2 : n1
		this.val = val
		this.id = `l_${this.source}_${this.target}`
	}
}

function min(a,b,ifnull) {
	if(!isFinite(a)) {
		return isFinite(b) ? b : ifnull
	}
	if(!isFinite(b)) {
		return isFinite(a) ? a : ifnull
	}
	if(a < b) return a;
	return b;
}

function sigsqrt(x) {
	return x<0?-Math.sqrt(-x):Math.sqrt(x)
}

const MIN_VIDS_IN_COMMON = 20
class UsersProximGraph {
	constructor(dataset) {
		console.debug('UsersProximGraph', this)
		this.dataset = dataset

		this.data = {
			nodes_index: {}, // map node.id => index (for d3js)
			nodes: [], // list of node objects -- WARN: Node.index is the location of the node within this list, sort/pop carefully
			links: [],
		}
		this.div = null // @see _makeD3
	}

	// // // PUBLIC // // //

	async load() {
		// Sort users by their number of compared videos (length of individual_scores)
		const users = Object.keys(this.dataset.individualScores).sort((a,b) => Object.values(this.dataset.individualScores[b]).length - Object.values(this.dataset.individualScores[a]).length)
		for(const user of users) {
			// Ignore small users
			if(Object.keys(this.dataset.individualScores[user]).length < MIN_VIDS_IN_COMMON)
				continue

			this._loadNextUser(user)
		}
	}

	makeD3(onstart, onend) {

		const nbn = this.data.nodes.length
		const maxAlpha = 0.3
		const maxR = this.data.nodes.reduce((m,n) => n.r>m?n.r:m, 0)

		// Init nodes location, as a spiral from the most videos compared to the least
		this.data.nodes.forEach((n,i) => {
			if(n.x && n.y) return // already initialized

			// Set node location near 0,0, with random angle and radius = vcount
			n.x = i * Math.cos(i)
			n.y = i * Math.sin(i)
			n.vx = 0
			n.vy = 0
		})

		console.debug('Links:', this.data.links)

		// Create a simulation with several forces
		const simulation = d3.forceSimulation(this.data.nodes)
			.alpha(maxAlpha)
			.alphaTarget(0.29)
			.alphaDecay(0.1)
			.velocityDecay(0.5)
			.force("repulse", d3.forceManyBody().strength(-50).distanceMax(maxR*5))
			.force('attract', () => {
				const COEF = 0.0001

				// For every link, apply a force to vx,vy of both their nodes, relative (val-averageForce)/maxForce
				this.data.links.forEach(l => {
					const source = this.data.nodes[this.data.nodes_index[l.source]]
					const target = this.data.nodes[this.data.nodes_index[l.target]]
					const s = source.r + target.r
					const dx = target.x - source.x
					const dy = target.y - source.y
					const d2 = dx*dx + dy*dy

					if(d2 <= s*1.1) {
						return
					}
					const force = COEF * l.val
					const rep = (target.r**4 / s**4)

					source.vx += force* sigsqrt(dx-s) * rep
					source.vy += force* sigsqrt(dy-s) * rep
					target.vx -= force* sigsqrt(dx-s) * (1-rep)
					target.vy -= force* sigsqrt(dy-s) * (1-rep)
				})
			})
			.force('colide', () => {
				const repPower = 0.3
				// For every link, apply a force to vx,vy of both their nodes, relative (val-averageForce)/maxForce
				for(let i1=1; i1<this.data.nodes.length; i1++) {
					const n1 = this.data.nodes[i1]
					for(let i2=0; i2<i1; i2++) {
						const n2 = this.data.nodes[i2]
						const dx = n2.x - n1.x
						const dy = n2.y - n1.y
						const d = Math.sqrt(dx*dx + dy*dy)
						let s = (n1.r + n2.r)
						if(d < s) {
							const wigglex = Math.random() - 0.5
							const wiggley = Math.random() - 0.5
							n1.vx += wigglex
							n2.vx -= wigglex
							n1.vy += wiggley
							n2.vy -= wiggley
						}
						s *= 1.1
						if(d < s) {
							const prop = (s-d)/s

							// Apply repulsive force
							const rep = (n2.r / s)**2
							n1.vx -= dx * prop * rep * repPower
							n1.vy -= dy * prop * rep * repPower
							n2.vx += dx * prop * (1-rep) * repPower
							n2.vy += dy * prop * (1-rep) * repPower
						}
					}
				}
			})
			.force('speed_limit', () => {
				const limit = maxR/8
				// For every link, apply a force to vx,vy of both their nodes, relative (val-averageForce)/maxForce
				for(let i=0; i<this.data.nodes.length; i++) {
					const n = this.data.nodes[i]
					if(n.vx > limit) n.vx = limit
					if(n.vx < -limit) n.vx = limit
					if(n.vy > limit) n.vy = limit
					if(n.vy < -limit) n.vy = limit
				}
			})
			.force('recenter', () => {
				// Center of gravity of the graph = Center of the viewport
				const _nds = this.data.nodes.filter(n => (n.x || n.y) && (n.vx || n.vy))
				let mid = [0,0]
				_nds.forEach(n => {
					mid[0] += n.x
					mid[1] += n.y
				})
				mid = [mid[0]/_nds.length, mid[1]/_nds.length]
				_nds.forEach(n => {
					n.vx -= mid[0]
					n.vy -= mid[1]
				})
			})

		// Create div
		const svg = d3.create('svg').attr('viewBox', [-100, -100, 200, 200])

		const popupOnHover = d3.select("body").append("div")
			.attr("class", "tooltip")
			.style("opacity", 0);

		const g_nodes = svg.append('g')
			.attr('class', 'nodes')
			.selectAll('circle')
			.data(this.data.nodes)
			.join('circle')
			.attr('r', n => n.r)
			.attr('class', 'usr_node')
			.attr('id', n => `node_${n.id}`)
			.on('mouseenter', (evt,n) => {
				popupOnHover.text(n.user)
					.style("opacity", 1)
					.style("left", (evt.pageX + 10) + "px")
					.style("top", (evt.pageY - 15) + "px");
			})
			.on('mouseleave', (evt,n) => {
				popupOnHover.style("opacity", 0)
			})
			.on('click', (evt,n) => {
				// Color other nodes according to proximity to hovered one
				// Green means high proximity
				// Red meand 0 proximity
				const links = this.data.links.filter(l => l.source === n.user || l.target === n.user)
				const maxLinkVal = Math.max(...links.map(l => l.val))
				this.data.nodes.forEach(n2 => {
					if(n === n2) {
						d3.select(`#node_${n.id}`)
							.attr('opacity', 1)
							.attr('fill', "#0022AA")
						return
					}

					// Find the link between n and n2
					const link = links.find(l => l.source === n2.user || l.target === n2.user)

					// If no link found, set n2 node opacity to 10%
					if(!link) {
						d3.select(`#node_${n2.id}`)
							.attr('opacity', 0.1)
						return
					}

					// If link found, set n2 node color according to link value
					// eg. if value=0   => color = #FF0000
					//     if value=0.5 => color = #AAAA00
					//     if value=1   => color = #00FF00
					d3.select(`#node_${n2.id}`)
						.attr('opacity', 1)
						.attr('fill', d3.interpolate("#FF0000", "#00FF00")(link.val / maxLinkVal))
				})
			})

		// Set the position attributes of links and nodes each time the simulation ticks.
		simulation.on('tick', () => {
			let mm = [99999, 99999, -99999, -99999]
			g_nodes
				.attr('cx', n => {
					if(n.x-n.r < mm[0]) mm[0] = n.x-n.r
					if(n.x+n.r > mm[2]) mm[2] = n.x+n.r
					return n.x
				})
				.attr('cy', n => {
					if(n.y-n.r < mm[1]) mm[1] = n.y-n.r
					if(n.y+n.r > mm[3]) mm[3] = n.y+n.r
					return n.y
				})
				.attr('vx', n => n.vx)
				.attr('vy', n => n.vy)

			// Auto zoom on content
			if(mm[2]-mm[0] > mm[3]-mm[1]) {
				const r = ((mm[2]-mm[0]) - (mm[3]-mm[1])) /2
				mm[1] -= r
				mm[3] += r
			} else {
				const r = ((mm[3]-mm[1]) - (mm[2]-mm[0])) /2
				mm[0] -= r
				mm[2] += r
			}
			svg.attr('viewBox', [mm[0], mm[1], mm[2]-mm[0], mm[3]-mm[1]])
		})

		const _div = svg.node()
		this.div = _div

		let simulating = true
		if(onstart) onstart()
		simulation.on('end', ()=>{
			simulating=false
			if(onend) onend()
		})

		g_nodes.call(d3.drag()
			.filter((evt) => {
				return !(evt.ctrlKey || evt.shiftKey || evt.altKey || evt.metaKey)
			})
			.on('start', (evt) => {
				svg.attr('class', 'grabbing')
			})
			.on('drag', (evt) => {
				if(evt.subject.fx !== evt.x || evt.subject.fy !== evt.y) {
					evt.subject.fx = evt.x
					evt.subject.fy = evt.y
					simulation.alpha(maxAlpha)
					if (!simulating) {
						simulating=true
						simulation.restart()
						if(onstart) onstart()
					}
				}
			})
			.on('end', (evt) => {
				svg.attr('class', '')
				evt.subject.fx = undefined
				evt.subject.fy = undefined
			})
		)
		return _div
	}

	// // // PRIVATE // // //


	async _loadNextUser(user) {
		const node = new Node(user, this.data.nodes.length, this.dataset.individualScores[user])
		this.data.nodes.push(node)
		this.data.nodes_index[user] = node.id

		// Generate links with all previous users
		for(let i=this.data.nodes.length-2;i>=0;i--) {
			const u2 = this.data.nodes[i].user
			const {sim, n} = this._getUserSimilarityScore(user, u2)

			// Ignore if not enough videos in common
			if(n < MIN_VIDS_IN_COMMON) continue

			this.data.links.push(new Edge(node.user, u2, sim))
		}
	}

	_getUserSimilarityScore(u1, u2) {
		let sim = 0.0
		let n = 0
		for(const vid in this.dataset.individualScores[u1]) {
			if(this.dataset.individualScores[u1][vid]['largely_recommended'] && this.dataset.individualScores[u2][vid] && this.dataset.individualScores[u2][vid]['largely_recommended']) {
				sim += (((this.dataset.individualScores[u1][vid]['largely_recommended'].score - this.dataset.individualScores[u2][vid]['largely_recommended'].score)/100)**2)/4
				n++
			}
		}
		return {sim:Math.sqrt(sim), n}
	}
}
