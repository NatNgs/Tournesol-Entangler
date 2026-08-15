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
	computeUserSuggestions(dataset, currentSelectedUsername, HTML_ELMS.suggestionsContainer)
	setStatus('success', 'Suggestions computed')
}

function displayTournesolComparisonModal(entityA, entityB) {
	/*const src=`https://tournesol.app/comparison?embed=1&utm_source=NatNgsEntangler&utm_medium=frame&uidA=yt:${entityA}&uidB=yt:${entityB}`
	HTML_ELMS.tournesolModalIFrame.src = src
	HTML_ELMS.tournesolModal.removeAttribute('hidden')
	*/

	// Open new tab with this url
	const src=`https://tournesol.app/comparison?uidA=yt:${entityA}&uidB=yt:${entityB}`
	window.open(src, '_blank')
}

function closeTournesolModal() {
	HTML_ELMS.tournesolModal.setAttribute('hidden', 'hidden')
}
