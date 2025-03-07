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

async function onApplyUsername() {
	const currentSelectedUsername = HTML_ELMS.usernameinpt.value.trim()
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
	setStatus('working', 'Loading user data: ' + currentSelectedUsername.replaceAll('<', '&lt;'))

	let badges_html = document.getElementById('badgesContainer')
	badges_html.innerHTML = "" // Reset displayed badges

	const badges = []
	await generateBadges(currentSelectedUsername, (badge) => {
		badge.dom = badge.toDOM()
		if(!badge.dom) return

		// Sort badges by grade (platinum first), then by progress (most progress first)
		badges.push(badge)
		badges.sort((a,b)=>(a.grade === b.grade)
			? b.totalProgress - a.totalProgress
			: gradesOrder.indexOf(b.grade) - gradesOrder.indexOf(a.grade)
		)
		for(const b of badges)
			badges_html.appendChild(b.dom)
	})
	setStatus('success', 'Loaded user data: ' + currentSelectedUsername.replaceAll('<', '&lt;'))
}
