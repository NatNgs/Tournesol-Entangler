const dataset = new DatasetManager()
const HTML_ELMS = {}

function onPageLoad() {
	HTML_ELMS.loading = document.getElementById('loading_status')
	HTML_ELMS.fileInput = document.getElementById('datasetzip')
	HTML_ELMS.userapply = document.getElementById('userapply')
	HTML_ELMS.usernameinpt = document.getElementById('username')
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
	currentSelectedUsername = HTML_ELMS.usernameinpt.value.trim()
	if(!currentSelectedUsername) {
		// No username set
		setStatus('error', 'No user selected')
		return
	}

	if(!Object.keys(dataset.comparisons).length)
		if(!await onSetDatasetZip()) // Dataset not loaded yet
			return

	if(!(currentSelectedUsername in dataset.comparisons)) {
		setStatus('error', 'User not found (username is case sensitive)')
		return
	}
	setStatus('success', 'Loaded user data: ' + currentSelectedUsername.replaceAll('<', '&lt;'))
	setTimeout(showFullGraph)
}

// // // Graph modes

async function showFullGraph() {
	if(!dataset || !currentSelectedUsername) {
		return alert("Full graph requires to select dataset and a user")
	}
	if(curr_status == 'working') {
		return alert("Please wait for current task, or refresh the page")
	}

	// Show loading
	const graph = new TnslGraph(dataset)

	const weeks = Object.keys(dataset.comparisons[currentSelectedUsername]['largely_recommended'])
	weeks.sort()
	// Add first week links
	for(const w of weeks) {
		setStatus('working', 'Computing user data (' + w + ')...')
		await (new Promise((resolve)=>{
			for(const c of dataset.comparisons[currentSelectedUsername]['largely_recommended'][w]) {
				graph.addLink(c.pos, c.neg, c.score/(c.score_max || 10), w)
			}
			setTimeout(resolve)
		}))
	}

	// Add graph viz to viewport
	document.getElementById('graph').innerHTML = ''

	const zone = document.getElementById('graph')
	const _onDrawStart = () => {
		setStatus('working', 'Drawing...')
	}
	const _onEnd = () => {
		HTML_ELMS.userapply.removeAttribute('disabled')
		HTML_ELMS.usernameinpt.removeAttribute('disabled')
		setStatus('success', 'Drawing complete')
	}
	zone.appendChild(graph.makeD3(_onDrawStart, _onEnd))
}
