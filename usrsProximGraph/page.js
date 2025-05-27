const dataset = new DatasetManager()
const HTML_ELMS = {}

function onPageLoad() {
	HTML_ELMS.loading = document.getElementById('loading_status')
	HTML_ELMS.fileInput = document.getElementById('datasetzip')
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
	const file = HTML_ELMS.fileInput.files[0]
	if(file) {
		setStatus('working')
		await dataset.setZip(file, (status) => setStatus(null, status))
			.then(() => {
				setStatus('success', 'Dataset loaded successfully. Select a user and Apply to continue')
				setTimeout(showFullGraph)
			})
			.catch((err) => {
				console.error(err)
				setStatus('error', 'Failed to load dataset (' + err + '). Please try again with another file')
				HTML_ELMS.fileInput.value = null
			})
	} else {
		setStatus('error', 'No file selected')
	}
}

// // // Graph modes

async function showFullGraph() {
	if(!dataset) {
		setStatus('error', 'Tournesol Dataset is required')
	}
	if(curr_status == 'working') {
		return alert("Please wait for current task, or refresh the page")
	}

	// Show loading
	const graph = new UsersProximGraph(dataset)
	await graph.load()

	// Add graph viz to viewport
	document.getElementById('graph').innerHTML = ''

	const zone = document.getElementById('graph')
	const _onDrawStart = () => {
		setStatus('working', 'Drawing...')
	}
	const _onEnd = () => {
		setStatus('success', 'Drawing complete')
	}
	zone.appendChild(graph.makeD3(_onDrawStart, _onEnd))
}
