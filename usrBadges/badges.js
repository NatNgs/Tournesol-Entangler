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
	const file = HTML_ELMS.fileInput.files[0]
	if(file) {
		setStatus('working')
		await dataset.setZip(file, (status) => setStatus(null, status))
			.then(() => {
				setStatus('success', 'Dataset loaded successfully. Select a user and Apply to continue')
			})
			.catch((err) => {
				console.error(err)
				setStatus('error', 'Failed to load dataset (' + err + '). Please try again with another file')
			})
	}
}

let currentSelectedUsername = null
const gradesOrder = ['default', 'bronze', 'silver', 'gold', 'best']
const properGrades = {
	'default': 'New',
	'bronze': 'Bronze',
	'silver': 'Silver',
	'gold': 'Golden',
	'best': 'Top 1'
}
async function onApplyUsername() {
	currentSelectedUsername = HTML_ELMS.usernameinpt.value.trim()
	if(!currentSelectedUsername) return // No username set
	if(!Object.keys(dataset.comparisons).length) return // Dataset not loaded yet
	if(!(currentSelectedUsername in dataset.comparisons)) {
		setStatus('error', 'User not found (username is case sensitive)')
		return
	}

	// Compute simple stats & display them
	document.getElementById("stt_nb_videos").innerText = Object.keys(dataset.individualScores[currentSelectedUsername]).length
	document.getElementById("stt_comparisons").innerText = Object.values(dataset.comparisons[currentSelectedUsername]['largely_recommended']).map(w => w.length).reduce((a,b)=>a+b,0)
	setStatus('success', 'Loaded user data: ' + currentSelectedUsername.replaceAll('<', '&lt;'))

	let badges_html = []
	const badges = await generateBadges()
	for(const badge in badges) {
		if(!badges[badge]) continue
		const bdata = badges[badge]
		const pgs = (bdata.progress-bdata.currGrade) / (bdata.nextGrade-bdata.currGrade);
		let bhtml = `<div class="badge ${bdata.grade}" style="--progress: ${100*pgs}%; --pgs: ${pgs}s;">
			${properGrades[bdata.grade]} ${bdata.title}`

		if(bdata.nextGrade) {
			bhtml += `<div class="progress">
				${bdata.progress} ${bdata.info}
				/
				${bdata.nextGrade} to ${properGrades[gradesOrder[gradesOrder.indexOf(bdata.grade)+1]]}
			</div>`
		} else {
			bhtml += `<div class="progress maxed">${bdata.progress} ${bdata.info}</div>`
		}
		bhtml += '</div>'
		badges_html.push(bhtml)
	}
	document.getElementById('badgesContainer').innerHTML = badges_html.join('')
}

async function generateBadges() {
	const unlockedBadges = {}

	// -- BADGE 1 : Number of compared videos --
	unlockedBadges['Videos'] = getBadge(
		'Content Contributor',
		currentSelectedUsername,
		(user) => Object.values(dataset.individualScores[user]).length,
		'videos compared'
	)

	// -- BADGE 2 : Weekly contributor
	unlockedBadges['WeeklyContributor'] = getBadge(
		'Active Member',
		currentSelectedUsername,
		(user)=>(!dataset.comparisons[user])?0:
			Object.values(dataset.comparisons[user]['largely_recommended'] || {}).length,
		'weeks of activity'
	)

	// -- BADGE 3 - 13 : Criteria contributor

	appendCriteriaBadges(unlockedBadges)


	// -- BADGE 14 : First
	// -- BADGE 15 : Early contributors

	appendFirstAndEarlyBadges(unlockedBadges)

	return unlockedBadges
}

function getBadge(title, selectedUser, fc, info) {
	// Get the grade and progression of the numerical badge that value is given by fc function

	const scores = {}
	let progress = fc(selectedUser)
	scores[selectedUser] = progress

	if(progress <= 0)
		return null

	// Compute every other users score for this badge using fc
	for(const user in dataset.individualScores) {
		if(user != selectedUser) {
			const usc = fc(user)
			if(usc && usc >= 1)
				scores[user] = usc
		}
	}

	// Sort users by score
	const sortedUsers = Object.keys(scores).sort((a,b) => scores[b] - scores[a])

	// Compute grades steps
	const steps = {
		best: scores[sortedUsers[0]], // FIRST user
		gold: scores[sortedUsers[10]], // Within top 10
		silver: scores[sortedUsers[(sortedUsers.length/10)|0]], // Within top 10%
		bronze: scores[sortedUsers[(sortedUsers.length/3)|0]], // Within top 33%
	}

	// Select corresponding step
	let grade = 'default'
	let currGrade = 1
	let nextGrade = steps.bronze
	if(progress >= steps.best) {
		grade = 'best'
		currGrade = steps.best
		nextGrade = null
	} else if(progress >= steps.gold) {
		grade = 'gold'
		currGrade = steps.gold
		nextGrade = steps.best
	} else if(progress >= steps.silver) {
		grade = 'silver'
		currGrade = steps.silver
		nextGrade = steps.gold
	} else if(progress >= steps.bronze) {
		grade = 'bronze'
		currGrade = steps.bronze
		nextGrade = steps.silver
	}
	return {title, grade, currGrade, nextGrade, progress, info}
}

function appendCriteriaBadges(unlockedBadges) {
	// for each criterion (individualScores = {<user>: {<vid>: {<criterion>: {score: <float>, uncertainty: <float>, voting_right: <float>}}}})
	const criteriaText = {
		'importance': 'Importance',
		'better_habits': 'Better Habits',
		'layman_friendly': 'Layman Friendly',
		'backfire_risk': 'Backfire Risk',
		'entertaining_relaxing': 'Entertaining & Relaxing',
		'diversity_inclusion': 'Diversity & Inclusion',
		'reliability': 'Reliability',
		'engaging': 'Engaging',
		'pedagogy': 'Pedagogy',
	}

	unlockedBadges['compaisons_largely_recommended'] = getBadge(
		'Comparator',
		currentSelectedUsername,
		(user)=>{
			let val = 0
			if(dataset.comparisons[user] && dataset.comparisons[user]['largely_recommended']) {
				for(const week in dataset.comparisons[user]['largely_recommended']) {
					val += dataset.comparisons[user]['largely_recommended'][week].length
				}
			}
			return val
		},
		'comparisons'
	)
	for(const criterion in criteriaText) {
		unlockedBadges['compaisons_' + criterion] = getBadge(
			'Comparator of ' + criteriaText[criterion],
			currentSelectedUsername,
			(user)=>{
				let val = 0
				if(dataset.comparisons[user] && dataset.comparisons[user][criterion]) {
					for(const week in dataset.comparisons[user][criterion]) {
						val += dataset.comparisons[user][criterion][week].length
					}
				}
				return val
			},
			'comparisons with criteria ' + criteriaText[criterion]
		)
	}
}
function appendFirstAndEarlyBadges(unlockedBadges) {
	// For every video, find who are their first contributors (users having done a comparison on it with week being the minimum)
	const vidFirstContrib = {} // video: {week:{users}}
	for(const user in dataset.comparisons) {
		for(const week in dataset.comparisons[user]['largely_recommended']) {
			for(const cmp of dataset.comparisons[user]['largely_recommended'][week]) {
				for(const vid of [cmp.pos, cmp.neg]) {
					if(!vidFirstContrib[vid]) {
						vidFirstContrib[vid] = {}
					}
					if(!vidFirstContrib[vid][week]) {
						vidFirstContrib[vid][week] = {}
					}
					vidFirstContrib[vid][week][user] = true
				}
			}
		}
	}

	const usersFirstContribs = {} // user: {first:[vid], early:[vid]}
	for(const vid in vidFirstContrib) {
		const weeks = Object.keys(vidFirstContrib[vid])
		weeks.sort()

		let earlyUsers = Object.keys(vidFirstContrib[vid][weeks.shift()])
		if(earlyUsers.length === 1) {
			if(!usersFirstContribs[earlyUsers[0]])
				usersFirstContribs[earlyUsers[0]] = {first:[], early:[]}
			usersFirstContribs[earlyUsers[0]].first.push(vid)

			earlyUsers.length = 0 // Do not count this user in early users
		}
		while(earlyUsers.length < 3 && weeks.length) {
			const week = weeks.shift()
			for(const earlyUser in vidFirstContrib[vid][week]) {
				earlyUsers.push(earlyUser)
			}
		}
		for(const user of earlyUsers) {
			if(!usersFirstContribs[user])
				usersFirstContribs[user] = {first: [], early: []}
			usersFirstContribs[user].early.push(vid)
		}
	}
	const noFirst = {first:[], early:[]}

	// First contributor badge for how many time the user is alone in vidos of vidFirstContrib
	unlockedBadges['First'] = getBadge(
		'First Contributor',
		currentSelectedUsername,
		(user) => (usersFirstContribs[user] || noFirst).first.length,
		'first comparisons on video'
	)

	// Early contributor badge for how many time the user is not alone in vidFirstContrib
	unlockedBadges['EarlyContributor'] = getBadge(
		'Early Contributor',
		currentSelectedUsername,
		(user) => (usersFirstContribs[user] || noFirst).early.length,
		'early comparisons'
	)
}
