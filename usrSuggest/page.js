const dataset = new DatasetManager()
const HTML_ELMS = {}

function onPageLoad() {
	HTML_ELMS.loading = document.getElementById('loading_status')
	HTML_ELMS.fileInput = document.getElementById('datasetzip')
	HTML_ELMS.userapply = document.getElementById('userapply')
	HTML_ELMS.usernameinpt = document.getElementById('username')
	HTML_ELMS.suggestionsContainer = document.getElementById('suggestionsContainer')
	HTML_ELMS.tournesolModal = document.getElementById('tournesol-modal')
	HTML_ELMS.tournesolModalIFrame = document.getElementById('tournesol-iframe')
	HTML_ELMS.userConnectivityScore = document.getElementById('userConnectivityScore')
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
	setStatus('working', 'Computing suggestions for ' + currentSelectedUsername.replaceAll('<', '&lt;') + '...')
	const userScore = await computeUserSuggestions(dataset, currentSelectedUsername, HTML_ELMS.suggestionsContainer)
	HTML_ELMS.userConnectivityScore.innerHTML = `
		<span class="score main">${userScore.all.toFixed(2)}</span> <span class="pct">(${(userScore.pct*100)|0}% connected)</span>
		[min: <span class="score">${userScore.min}</span>,
		q1: <span class="score">${userScore.q1|0}</span>,
		median: <span class="score">${userScore.q2|0}</span>,
		q3: <span class="score">${userScore.q3|0}</span>,
		max: <span class="score">${userScore.max}</span>]`
	setStatus('success', 'Suggestions computed')
}

function closeTournesolModal() {
	HTML_ELMS.tournesolModal.setAttribute('hidden', 'hidden')
}
