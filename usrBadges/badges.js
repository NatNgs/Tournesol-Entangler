const gradesOrder = ['locked', 'default', 'bronze', 'silver', 'gold', 'platinum']
const defaultGradesTitlePrefix = {
	'locked': 'Not',
	//'default': 'New',
	'bronze': 'Bronze',
	'silver': 'Silver',
	'gold': 'Golden',
	'platinum': 'Best'
}

class Badge {
	constructor(defaultTitle, selectedUser, fc_progress, info) {
		this.info = info
		this.progress = fc_progress(selectedUser)

		const scores = {}
		scores[selectedUser] = this.progress

		// Compute every other users score for this badge using fc
		for(const user in dataset.individualScores) {
			if(user != selectedUser) {
				const usc = fc_progress(user)
				if(usc && usc >= 1)
					scores[user] = usc
			}
		}

		// Sort users by score
		const sortedUsers = Object.keys(scores).sort((a,b) => scores[b] - scores[a])

		// Compute grades steps
		this.grades = {
			platinum: {title: defaultTitle, minScore: scores[sortedUsers[0]]}, // FIRST user
			gold: {title: defaultTitle, minScore: scores[sortedUsers[10]]}, // Within top 10
			silver: {title: defaultTitle, minScore: scores[sortedUsers[(sortedUsers.length/10)|0]]}, // Within top 10%
			bronze: {title: defaultTitle, minScore: scores[sortedUsers[(sortedUsers.length/3)|0]]}, // Within top 33%
			default: {title: defaultTitle, minScore: 1}, // From score=1 to top 33%
			locked: {title: defaultTitle, minScore: 0}, // Score=0
		}
		for(const grade in defaultGradesTitlePrefix) {
			this.grades[grade].title = defaultGradesTitlePrefix[grade] + ' ' + this.grades[grade].title
		}

		// Find current grade
		this.grade = 'locked'
		for(const g of gradesOrder) {
			if(this.progress >= this.grades[g].minScore)
				this.grade = g
			else
				break
		}

		this.totalProgress = this.progress / this.grades.platinum.minScore;
	}

	toDOM() {
		if(this.grade === 'locked')
			return null

		const currentGrade = this.grades[gradesOrder[gradesOrder.indexOf(this.grade)]];
		const nextGrade = this.grades[gradesOrder[gradesOrder.indexOf(this.grade) + 1]];
		const gradeProgress = nextGrade?(this.progress-currentGrade.minScore) / (nextGrade.minScore-currentGrade.minScore):null;

		const domBadge = document.createElement('div')
		domBadge.classList.add("badge")
		domBadge.classList.add(this.grade)
		domBadge.style = `--progress:${100*this.totalProgress}%; --pgs:${gradeProgress}s;`
		domBadge.innerText = currentGrade.title

		const domDescrption = domBadge.appendChild(document.createElement('div'))
		domDescrption.classList.add('description')
		domDescrption.innerText = `${this.progress} ${this.info}`

		const domGrades = domBadge.appendChild(document.createElement('div'))
		domGrades.classList.add('grades')

		for(let i=2; i<gradesOrder.length; i++) {
			const domCurrGrade = domGrades.appendChild(document.createElement('div'))

			const minGradeScore = this.grades[gradesOrder[i-1]].minScore
			const maxGradeScore = this.grades[gradesOrder[i]  ].minScore
			//const tillGradeProgress = this.progress > maxGradeScore ? 1 : (this.progress/maxGradeScore)||this.totalProgress
			const curGradePrgrs = this.progress > maxGradeScore ? 1 : (this.progress < minGradeScore ? 0 : (this.progress-minGradeScore)/(maxGradeScore-minGradeScore))
			domCurrGrade.style = `--progress:${100*curGradePrgrs}%;`
			domCurrGrade.classList.add('progress')
			domCurrGrade.classList.add(gradesOrder[i-1])
			domCurrGrade.innerText = maxGradeScore
			domCurrGrade.setAttribute('title', `Unlock ${gradesOrder[i]} at ${maxGradeScore} ${this.info}`)
		}

		return domBadge
	}
}

async function generateBadges(selectedUser, fc_onBadgeCreated) {
	const unlockedBadges = {}

	const onBadgeCreated = (badge) => new Promise((resolve)=>{
		setTimeout(()=>{
			fc_onBadgeCreated(badge);
			resolve();
		})
	})

	// -- BADGE 1 : Weekly contributor
	let b = new Badge(
		'Active Member',
		selectedUser,
		(user)=>(!dataset.comparisons[user])?0:
			Object.values(dataset.comparisons[user]['largely_recommended'] || {}).length,
		'weeks of activity'
	)
	b.grades.default.title = 'New Member'
	b.grades.platinum.title = 'Most Active Member'
	await onBadgeCreated(b)

	// -- BADGE 2 : Number of compared videos --
	await onBadgeCreated(new Badge(
		'Content Contributor',
		selectedUser,
		(user) => Object.values(dataset.individualScores[user]).length,
		'videos compared'
	))

	// -- BADGE 3 : Trusted contributor
	b = new Badge(
		'Valued Contributor',
		selectedUser,
		(user) => {
			let sum = 0
			for(const vid in dataset.individualScores[user]) {
				sum += dataset.individualScores[user][vid]['largely_recommended']?.voting_right || 0
			}
			return Math.round(sum)
		},
		'voting rights attribued'
	)
	b.grades.default.title = 'Low Valued Contributor'
	b.grades.platinum.title = 'Most Valued Contributor'
	await onBadgeCreated(b)

	// -- BADGE 4 : Top 10 user
	await onBadgeCreated(generatePodiumBadge(selectedUser))

	// -- BADGE 5 : First
	// -- BADGE 6 : Early contributors
	await appendFirstAndEarlyBadges(selectedUser, onBadgeCreated)

	// -- BADGE 7 to 16 : Criteria contributor
	await appendCriteriaBadges(selectedUser, onBadgeCreated)

	return unlockedBadges
}
async function appendCriteriaBadges(selectedUser, fc_onBadgeCreated) {
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

	await fc_onBadgeCreated(new Badge(
		'Comparator',
		selectedUser,
		(user)=>{
			let val = 0
			if(dataset.comparisons[user] && dataset.comparisons[user]['largely_recommended']) {
				for(const week in dataset.comparisons[user]['largely_recommended']) {
					val += dataset.comparisons[user]['largely_recommended'][week].length
				}
			}
			return val
		},
		'public comparisons sent'
	))
	for(const criterion in criteriaText) {
		await fc_onBadgeCreated(new Badge(
			'Comparator of ' + criteriaText[criterion],
			selectedUser,
			(user)=>{
				let val = 0
				if(dataset.comparisons[user] && dataset.comparisons[user][criterion]) {
					for(const week in dataset.comparisons[user][criterion]) {
						val += dataset.comparisons[user][criterion][week].length
					}
				}
				return val
			},
			'comparisons with "' + criteriaText[criterion] + '" criterion'
		))
	}
}
async function appendFirstAndEarlyBadges(selectedUser, fc_onBadgeCreated) {
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

	const usersFirstContribs = {} // user: {first:[vid], early:[vid], follow:[vid]}
	for(const vid in vidFirstContrib) {
		const weeks = Object.keys(vidFirstContrib[vid])
		weeks.sort()

		let earlyUsers = Object.keys(vidFirstContrib[vid][weeks.shift()])
		// First contributor
		if(earlyUsers.length === 1) {
			if(!usersFirstContribs[earlyUsers[0]])
				usersFirstContribs[earlyUsers[0]] = {first:[], early:[], follow:[]}
			usersFirstContribs[earlyUsers[0]].first.push(vid)

			earlyUsers.length = 0 // Do not count this user in early users
		}

		// Early contributors
		while(earlyUsers.length < 3 && weeks.length) {
			const week = weeks.shift()
			for(const earlyUser in vidFirstContrib[vid][week]) {
				earlyUsers.push(earlyUser)
			}
		}
		for(const user of earlyUsers) {
			if(!usersFirstContribs[user])
				usersFirstContribs[user] = {first:[], early:[], follow:[]}
			usersFirstContribs[user].early.push(vid)
		}

		// Following contributors
		for(const week of weeks) {
			for(const user in vidFirstContrib[vid][week]) {
				if(!usersFirstContribs[user])
					usersFirstContribs[user] = {first:[], early:[], follow:[]}
				usersFirstContribs[user].follow.push(vid)
			}
		}
	}
	const noFirst = {first:[], early:[], follow:[]}

	// First contributor badge for how many time the user is alone in vidos of vidFirstContrib
	await fc_onBadgeCreated(new Badge(
		'First Contributor',
		selectedUser,
		(user) => (usersFirstContribs[user] || noFirst).first.length,
		"videos compared as the first contributor"
	))

	// Early contributor badge for how many time the user is not alone in vidFirstContrib
	await fc_onBadgeCreated(new Badge(
		'Early Contributor',
		selectedUser,
		(user) => (usersFirstContribs[user] || noFirst).early.length,
		"videos compared when they had less than 3 contributors"
	))

	// Early contributor badge for how many time the user is not alone in vidFirstContrib
	await fc_onBadgeCreated(new Badge(
		'Recommendations Follower',
		selectedUser,
		(user) => (usersFirstContribs[user] || noFirst).follow.length,
		"videos compared that already had 3+ contributors"
	))
}
function generatePodiumBadge(selectedUser) {
	// For every week, sort users by how many comparisons they made this week
	const usrCmpsByWeek = {} // week: {user: #comparisons}
	// dataset.comparisons = {<user>: {<criterion>: {<week>: [{pos: <vid>, neg: <vid>, score: <float>, score_max: <float>}]}}}
	for(const user in dataset.comparisons) {
		for(const week in dataset.comparisons[user]['largely_recommended']) {
			if(!usrCmpsByWeek[week])
				usrCmpsByWeek[week] = {}
			usrCmpsByWeek[week][user] = dataset.comparisons[user]['largely_recommended'][week].length
		}
	}

	// Keep only top 10 of every week
	const usrsPodiums = {} // usr: #weeks
	for(const week in usrCmpsByWeek) {
		const sortedUsers = Object.keys(usrCmpsByWeek[week])
		sortedUsers.sort((a,b)=>usrCmpsByWeek[week][b] - usrCmpsByWeek[week][a])
		if(sortedUsers.length > 10) sortedUsers.length = 10
		for(const u of sortedUsers) {
			if(!usrsPodiums[u]) usrsPodiums[u] = 1
			else usrsPodiums[u] += 1
		}
	}

	const b = new Badge(
		'Presence in Weekly Podium',
		selectedUser,
		(user) => (usrsPodiums[user] || 0),
		'weeks as top 10 contributor'
	)
	b.grades.default.title = 'Few Presences in Weekly Podium'
	b.grades.platinum.title = 'Most Presences in Weekly Podium'
	return b;
}
