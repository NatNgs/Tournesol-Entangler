const gradesOrder = ['locked', 'default', 'bronze', 'silver', 'gold', 'platinum']

class Badge {
	constructor(title, selectedUser, fc_progress, info) {
		this.title = title
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
			platinum: {title: title, minScore: scores[sortedUsers[0]]}, // FIRST user
			gold: {title: title, minScore: scores[sortedUsers[10]]}, // Within top 10
			silver: {title: title, minScore: scores[sortedUsers[(sortedUsers.length/10)|0]]}, // Within top 10%
			bronze: {title: title, minScore: scores[sortedUsers[(sortedUsers.length/3)|0]]}, // Within top 33%
			default: {title: title, minScore: 1}, // From score=1 to top 33%
			locked: {title: 'Locked', minScore: 0}, // Score=0
		}

		// Find current grade
		this.grade = 'locked'
		for(const g of gradesOrder) {
			if(this.progress >= this.grades[g].minScore)
				this.grade = g
			else
				break
		}
	}

	toDOM() {
		if(this.grade === 'locked')
			return null

		const totalProgress = this.progress / this.grades.platinum.minScore;
		const currentGrade = this.grades[gradesOrder[gradesOrder.indexOf(this.grade)]];
		const nextGrade = this.grades[gradesOrder[gradesOrder.indexOf(this.grade) + 1]];
		const gradeProgress = nextGrade?(this.progress-currentGrade.minScore) / (nextGrade.minScore-currentGrade.minScore):null;

		const domBadge = document.createElement('div')
		domBadge.classList.add("badge")
		domBadge.classList.add(this.grade)
		domBadge.style = `--progress:${100*totalProgress}%; --pgs:${gradeProgress}s;`
		domBadge.innerText = properGrades[this.grade] + ' ' + this.title

		const domGrades = domBadge.appendChild(document.createElement('div'))
		domGrades.classList.add('grades')

		for(let i=1; i<gradesOrder.length-1; i++) {
			const domCurrGrade = domGrades.appendChild(document.createElement('div'))

			const minGradeScore = this.grades[gradesOrder[i]].minScore
			const maxGradeScore = this.grades[gradesOrder[i+1]  ].minScore
			const tillGradeProgress = this.progress > maxGradeScore ? 1 : (this.progress/maxGradeScore)||totalProgress
			const curGradePrgrs = this.progress > maxGradeScore ? 1 : (this.progress < minGradeScore ? 0 : (this.progress-minGradeScore)/(maxGradeScore-minGradeScore))
			domCurrGrade.style = `--progress:${100*curGradePrgrs}%;`
			domCurrGrade.classList.add('progress')
			domCurrGrade.classList.add(gradesOrder[i])
			domCurrGrade.innerText = (this.grade === gradesOrder[i] ? `(${(100*tillGradeProgress)|0}%) ${this.progress} /` : '') + maxGradeScore
			domCurrGrade.setAttribute('title', `${gradesOrder[i+1]}: ${maxGradeScore} ${this.info} (${(100*tillGradeProgress)|0}%)`)
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

	// -- BADGE 1 : Number of compared videos --
	await onBadgeCreated(new Badge(
		'Content Contributor',
		selectedUser,
		(user) => Object.values(dataset.individualScores[user]).length,
		'videos compared'
	))

	// -- BADGE 2 : Weekly contributor
	await onBadgeCreated(new Badge(
		'Active Member',
		selectedUser,
		(user)=>(!dataset.comparisons[user])?0:
			Object.values(dataset.comparisons[user]['largely_recommended'] || {}).length,
		'weeks of activity'
	))

	// -- BADGE 3 - 13 : Criteria contributor
	await appendCriteriaBadges(selectedUser, onBadgeCreated)

	// -- BADGE 14 : First
	// -- BADGE 15 : Early contributors
	await appendFirstAndEarlyBadges(selectedUser, onBadgeCreated)

	// -- BADGE 16 : Top 10 user
	await onBadgeCreated(new Badge(
		'Presence in Weekly Podium',
		selectedUser,
		(user) => { return 0 }, // TODO
		'weeks as top 10 contributor'
	))

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
		'comparisons'
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
			'comparisons with criteria ' + criteriaText[criterion]
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
	await fc_onBadgeCreated(new Badge(
		'First Contributor',
		selectedUser,
		(user) => (usersFirstContribs[user] || noFirst).first.length,
		'first comparisons on video'
	))

	// Early contributor badge for how many time the user is not alone in vidFirstContrib
	await fc_onBadgeCreated(new Badge(
		'Early Contributor',
		selectedUser,
		(user) => (usersFirstContribs[user] || noFirst).early.length,
		'early comparisons'
	))
}
