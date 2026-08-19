const dataset = new DatasetManager()
const HTML_ELMS = {}

function onPageLoad() {
	HTML_ELMS.loading = document.getElementById('loading_status')
	HTML_ELMS.fileInput = document.getElementById('datasetzip')
	HTML_ELMS.userapply = document.getElementById('userapply')
	HTML_ELMS.usernameinpt = document.getElementById('username')
	HTML_ELMS.connectivityGraphContainer = document.getElementById('connectivityGraphContainer')
}


let curr_status = null
function setStatus(status_code, status_text) {
	if(status_text) {
		HTML_ELMS.loading.innerText = status_text
	}
	if(status_code && status_code !== curr_status) {
		if(curr_status) {
			HTML_ELMS.loading.classList.remove(curr_status)
		}
		HTML_ELMS.loading.classList.add(status_code)
		curr_status = status_code
	}
	console.debug('Status:', curr_status, '-', HTML_ELMS.loading.innerText)
}

async function onSetDatasetZip() {
	let datasetLoaded = false
	const file = HTML_ELMS.fileInput.files[0]
	if(file) {
		HTML_ELMS.fileInput.setAttribute('disabled', 'disabled')
		HTML_ELMS.userapply.setAttribute('disabled', 'disabled')
		setStatus('working')
		await dataset.setZip(file, (status) => setStatus(null, status))
			.then(() => {
				HTML_ELMS.fileInput.removeAttribute('disabled')
				HTML_ELMS.userapply.removeAttribute('disabled')
				setStatus('success', 'Dataset loaded successfully. Select a user and Apply to continue')
				datasetLoaded = true
			})
			.catch((err) => {
				HTML_ELMS.fileInput.removeAttribute('disabled')
				console.error(err)
				setStatus('error', 'Failed to load dataset (' + err + '). Please try again with another file')
				HTML_ELMS.fileInput.value = null
			})
	} else {
		setStatus('error', 'No file selected')
	}
	return datasetLoaded
}

let currentSelectedUsername = null
async function onApplyUsername() {
	const newUsername = HTML_ELMS.usernameinpt.value.trim()
	currentSelectedUsername = newUsername
	if(!currentSelectedUsername) {
		// No username set
		setStatus('error', 'No user selected')
		return
	}

	if(!Object.keys(dataset.comparisons).length) {
		if(!await onSetDatasetZip()) { // Dataset not loaded yet
			setStatus('warning', 'Dataset is not loaded')
			return
		}
	}

	if(!(currentSelectedUsername in dataset.comparisons)) {
		setStatus('error', 'User not found (username is case sensitive)')
		return
	}
	setStatus('working', 'Computing connectivity week by week for ' + currentSelectedUsername.replaceAll('<', '&lt;') + '...')
	const getUserConnectivities = computeUserConnectivities(dataset, currentSelectedUsername)

	HTML_ELMS.connectivityGraphContainer.innerHTML = ''
	const {svg,addNewDataPoint} = initD3Chart()
	HTML_ELMS.connectivityGraphContainer.appendChild(svg)

	// Add one li row for every userConnectivities
	let nextUserConnectivity = null
	while(nextUserConnectivity = await getUserConnectivities()) {
		addNewDataPoint(nextUserConnectivity)
	}

	setStatus('success', 'Conectivity computed')
}
function initD3Chart(containerElement) {
	// Get parent dimensions
	const width = 1000
	const height = 500

	// Create SVG and append to container
	const svg = d3.create('svg')
		.attr('width', '100%')
		.attr('height', '100%')
		.attr('viewBox', `0 0 ${width} ${height}`)
		.attr('preserveAspectRatio', 'xMidYMid meet')

	const g = svg.append('g')

	const parseWeek = d3.timeParse('%Y-%m-%d')

	const x = d3.scaleTime().range([0, width])
	const yLeft = d3.scaleLinear().range([height, 0])
	// Domain is 0 to 1 internally
	const yRight = d3.scaleLinear().domain([0, 1]).range([height, 0])

	// Define margins to ensure axes are visible inside the SVG
	const margin = { top: 20, right: 50, bottom: 40, left: 50 }
	const innerWidth = width - margin.left - margin.right
	const innerHeight = height - margin.top - margin.bottom

	// Update scales to use inner dimensions
	x.range([0, innerWidth])
	yLeft.range([innerHeight, 0])
	yRight.range([innerHeight, 0])

	// Group for chart content, translated by margins
	const chartGroup = g.append('g')
		.attr('transform', `translate(${margin.left},${margin.top})`)

	const xAxis = chartGroup.append('g')
		.attr('class', 'axis x-axis')
		.attr('transform', `translate(0,${innerHeight})`)

	const yLeftAxis = chartGroup.append('g').attr('class', 'axis y-left-axis');
	const yRightAxis = chartGroup.append('g')
		.attr('class', 'axis y-right-axis')
		.attr('transform', `translate(${innerWidth},0)`)

	// Define lines
	const avgLine = d3.line()
		.x(d => x(d.week))
		.y(d => yLeft(d.avg))
		.curve(d3.curveMonotoneX)
	const maxLine = d3.line()
		.x(d => x(d.week))
		.y(d => yLeft(d.max))
		.curve(d3.curveMonotoneX)
	const pctLine = d3.line()
		.x(d => x(d.week))
		.y(d => yRight(d.pct))
		.curve(d3.curveMonotoneX)

	// Append paths: pct (red) first (background), then avg (blue) (foreground)
	const pctPath = chartGroup.append('path')
		.attr('class', 'pct-line')
		.attr('fill', 'none')
		.attr('stroke', 'red')
		.attr('stroke-width', 2)
	const maxPath = chartGroup.append('path')
		.attr('class', 'max-line')
		.attr('fill', 'none')
		.attr('stroke', '#0080FF')
		.attr('stroke-width', 2)
		.attr('stroke-dasharray', '5,5') /* dotted */
	const avgPath = chartGroup.append('path')
		.attr('class', 'avg-line')
		.attr('fill', 'none')
		.attr('stroke', 'blue')
		.attr('stroke-width', 2)

	// // // On hover data line // // //
	const focusLine = chartGroup.append('line')
		.attr('class', 'focus-line')
		.attr('stroke', '#999')
		.attr('stroke-dasharray', '3,3')
		.style('opacity', 0)

	const focusLabelBackground = chartGroup.append('rect')
		.style('opacity', 0)
		.attr('fill', 'white')
		.attr('pointer-events', 'none')
	const focusLabel = chartGroup.append('text').attr('class', 'focus-label').style('opacity', 0)
	const focusLabelDate =focusLabel.append('tspan').attr('class', 'date').text('2000-12-31')
	focusLabel.append('tspan').attr('dy', 16).text('Connectivity: ').attr('dx', '-5em')
	const focusLabelAvg = focusLabel.append('tspan').attr('class', 'blue').text('0')
	focusLabel.append('tspan').text('/')
	const focusLabelMax = focusLabel.append('tspan').attr('class', 'lblue').text('0')
	focusLabel.append('tspan').text(' (')
	const focusLabelPct = focusLabel.append('tspan').attr('class', 'red').text('0%');
	focusLabel.append('tspan').text(')')


	// Invisible overlay to capture mouse events over the whole chart area
	const overlay = chartGroup.append('rect')
		.attr('width', innerWidth)
		.attr('height', innerHeight)
		.attr('fill', 'none')
		.attr('pointer-events', 'all')

	const bisectDate = d3.bisector(d => d.week).left;
	let data = []

	function render() {
		if (!data.length) return

		const extent = d3.extent(data, d => d.week)
		x.domain(extent);
		yLeft.domain([0, d3.max(data, d => d.max) || 1]).nice()

		const [minDate, maxDate] = extent
		const diffTime = maxDate - minDate
		const diffWeeks = diffTime / (1000 * 60 * 60 * 24 * 7)
		const diffMonths = diffTime / (1000 * 60 * 60 * 24 * 30.44) // Approximate
		const diffYears = diffTime / (1000 * 60 * 60 * 24 * 365.25)

		let tickValues = []
		let tickFormat

		// Logic for X-Ticks
		if (diffWeeks <= 12) {
			// One tick per week, starting on the first data day
			const start = minDate
			// Generate weeks manually to ensure start aligns exactly with minDate
			let current = new Date(start)
			while (current <= maxDate) {
				tickValues.push(new Date(current))
				current.setDate(current.getDate() + 7)
			}
			tickFormat = d3.timeFormat('%Y-%m-%d')
		} else if (diffYears <= 2) { // 24 months = 2 years
			// One tick per month, starting on first day of the first month
			const start = new Date(minDate.getFullYear(), minDate.getMonth(), 1)
			tickValues = d3.timeMonths(start, new Date(maxDate.getFullYear(), maxDate.getMonth() + 1, 1))
			tickFormat = d3.timeFormat('%Y-%m')
		} else if (diffYears <= 4) {
			// One tick per 4 months, starting on January 1st of the first data year
			const start = new Date(minDate.getFullYear(), 0, 1) // Jan 1st
			// Generate manually to step by 4 months
			let current = new Date(start)
			while (current <= maxDate) {
				tickValues.push(new Date(current))
				current.setMonth(current.getMonth() + 4)
			}
			tickFormat = d3.timeFormat('%Y-%m')
		} else {
			// One tick per year, starting on January 1st of the first data year
			const start = new Date(minDate.getFullYear(), 0, 1)
			tickValues = d3.timeYears(start, new Date(maxDate.getFullYear() + 1, 0, 1))
			tickFormat = d3.timeFormat('%Y')
		}

		xAxis.call(
			d3.axisBottom(x)
			.tickValues(tickValues)
			.tickFormat(tickFormat)
		)

		yLeftAxis.call(d3.axisLeft(yLeft))

		// Right Axis: Percent format (0% - 100%)
		yRightAxis.call(
			d3.axisRight(yRight)
			.tickFormat(d3.format('.0%'))
		)

		// Update paths
		maxPath.datum(data).attr('d', maxLine)
		avgPath.datum(data).attr('d', avgLine)
		pctPath.datum(data).attr('d', pctLine)

		// Append onHover data line
		overlay.on('mousemove', function(event) {
			const [mouseX, mouseY] = d3.pointer(event)
			const xValue = x.invert(mouseX)

			// Find nearest data point
			const i = bisectDate(data, xValue, 1)
			const d0 = data[i - 1]
			const d1 = data[i]

			if (!d0 && !d1) return

			const d = d1 ? (xValue - d0.week > d1.week - xValue ? d1 : d0) : d0

			const xPos = x(d.week)
			const yPosAvg = yLeft(d.avg)
			const yPosPct = yRight(d.pct)

			// Update vertical line
			focusLine
				.attr('x1', xPos)
				.attr('x2', xPos)
				.attr('y1', 0)
				.attr('y2', innerHeight)
				.style('opacity', 1)

			// Update Label
			focusLabel.attr('x', xPos + 8).attr('y', mouseY).style('opacity', 1)
			focusLabelDate.text(d.week.toISOString().split('T')[0])
			focusLabelAvg.text(d.avg.toFixed(1))
			focusLabelMax.text(d.max | 0)
			focusLabelPct.text(`${(d.pct * 100).toFixed(2)}%`)

			const bboxAvg = focusLabel.node().getBBox()
			focusLabelBackground
				.attr('x', xPos + 6)
				.attr('y', bboxAvg.y - 2)
				.attr('width', bboxAvg.width + 4)
				.attr('height', bboxAvg.height + 4)
				.style('opacity', 1)
		})
		.on('mouseleave', function() {
			// Hide all focus elements
			focusLine.style('opacity', 0)
			focusLabel.style('opacity', 0)
			focusLabelBackground.style('opacity', 0)
		})
	}

	render()

	// Return function to append a new datapoint to the chart
	return {
		svg: svg.node(),
		addNewDataPoint: (dp) => {
			data.push({
				week: parseWeek(dp.week),
				avg: +dp.avg,
				pct: +dp.pct,
				max: +dp.max,
			})
			render()
		}
	};
}
