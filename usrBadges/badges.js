const gradesOrder = ['locked', 'default', 'bronze', 'silver', 'gold', 'platinum']

const _BADGE_MODELS = []


class BadgeModel {
	constructor(defaultTitle, fc_progress, info, dataset) {
		/**
		 * defaultTitle: str, title of the Badge (can be overriden after construction by changing this.grades[<level>].title)
		 * fc_progress: function(dataset, username) that returns a map {date(iso str): score(float)}
		 * info: description of the badge score meaning, as the end of a sentense begining with the score like "<score> <info>"
		 * dataset: the dataset where to get the data from
		 */
		this.info = info
		this.fc_progress = fc_progress
		this.user_scores = {} // user: score

		// Compute every other users score for this badge using fc
		for(const user in dataset.individualScores) {
			const usc = fc_progress(dataset, user)
			if(usc && usc > 0)
				this.user_scores[user] = usc
		}

		// Sort users by score
		const sortedUsers = Object.keys(this.user_scores).sort((a,b) => this.user_scores[b] - this.user_scores[a])
		this.maxScore = this.user_scores[sortedUsers[0]]

		// Compute grades steps
		this.grades = {
			platinum: {title: 'Best ' + defaultTitle, minScore: this.maxScore}, // FIRST user
			gold: {title: 'Golden ' + defaultTitle, minScore: 1000},
			silver: {title: 'Silver ' + defaultTitle, minScore: 100},
			bronze: {title: 'Bronze ' + defaultTitle, minScore: 10},
			default: {title: defaultTitle, minScore: 1},
			locked: {title: 'Locked: ' + defaultTitle, minScore: -Infinity},
		}

		// gold = top 10 score, rounded down to 2 significant digits
		let unrounded = this.user_scores[sortedUsers[10]]
		let pwr = (Math.log10(unrounded)|0)-1
		this.grades.gold.minScore = ((unrounded/10**pwr)|0)*(10**pwr)

		// Silver = 33% of gold, rounded down to 1 significant digit
		unrounded = this.grades.gold.minScore*.33
		pwr = Math.log10(unrounded)|0
		this.grades.silver.minScore = ((unrounded/10**pwr)|0)*(10**pwr)

		// Bronze = 33% of silver, rounded down to 1 significant digit
		unrounded = this.grades.silver.minScore*.33
		pwr = Math.log10(unrounded)|0
		this.grades.bronze.minScore = ((unrounded/10**pwr)|0)*(10**pwr)
	}

	applyForUser(selectedUser) {
		return new UserBadge(this, selectedUser)
	}
}
class UserBadge {
	constructor(badgeModel, selectedUser) {
		this._model = badgeModel
		this.user = selectedUser

		this.progress = badgeModel.user_scores[this.user] || 0

		// Find current grade
		this.grade = gradesOrder[0]
		for(const g of gradesOrder) {
			if(this.progress < this._model.grades[g].minScore)
				break
			this.grade = g
		}

		this.dom = this._toDOM()
	}

	get totalProgressPct() {
		return this.progress / this._model.maxScore;
	}
	getGradeProgressPct(grade=null) {
		if(!grade) grade = this.grade

		const currGradeIndex = gradesOrder.indexOf(grade)
		if(currGradeIndex === gradesOrder.length - 1) {
			return this.totalProgressPct
		}
		const currGradeMinScore = this._model.grades[grade].minScore
		const currGradeMaxScore = this._model.grades[gradesOrder[currGradeIndex+1]].minScore
		if(this.progress >= currGradeMaxScore)
			return 1
		if(currGradeIndex === 1) {
			// If grade default, suppose progress pct from 0
			return this.progress / currGradeMaxScore;
		}
		if(this.progress <= currGradeMinScore)
			return 0
		return (this.progress - currGradeMinScore) / (currGradeMaxScore - currGradeMinScore)
	}

	_toDOM() {
		const domBadge = document.createElement('div')
		domBadge.classList.add("badge")
		domBadge.classList.add(this.grade)
		domBadge.style = `--progress:${100*this.totalProgressPct}%; --pgs:${100*this.getGradeProgressPct(this.grade)}%;`
		domBadge.innerText = this._model.grades[this.grade].title

		const domCurrScore = domBadge.appendChild(document.createElement('div'))
		domCurrScore.classList.add('currScore')
		domCurrScore.innerText = Math.round(this.progress)

		const domDescrption = domBadge.appendChild(document.createElement('div'))
		domDescrption.classList.add('description')
		domDescrption.innerText = this._model.info

		const domGrades = domBadge.appendChild(document.createElement('div'))
		domGrades.classList.add('grades')

		for(let i=2; i<gradesOrder.length; i++) {
			const iGradeDOM = domGrades.appendChild(document.createElement('div'))
			const iGradePrgrs = this.getGradeProgressPct(gradesOrder[i-1])
			iGradeDOM.style = `--progress:${100*iGradePrgrs}%;`

			iGradeDOM.classList.add('progress')
			iGradeDOM.classList.add(gradesOrder[i-1])
			iGradeDOM.innerText = Math.ceil(this._model.grades[gradesOrder[i]].minScore)
		}

		return domBadge
	}
}
async function getUserBadges(selectedUser, fc_onBadgeCreated) {
	const onBadgeCreated = (badge) => new Promise((resolve)=>{
		setTimeout(()=>{
			fc_onBadgeCreated(badge);
			resolve();
		})
	})

	for(const model of _BADGE_MODELS) {
		await onBadgeCreated(model.applyForUser(selectedUser))
	}
}


const defScore = {score:0}
async function initBadges(dataset) {
	// -- BADGE 1 : Weekly contributor
	let b = new BadgeModel(
		'Active Member',
		(ds,user)=>ds.comparisons.getDefault(user,'largely_recommended',{}).size(),
		'weeks of activity',
		dataset
	)
	b.grades.platinum.title = 'Most Active Member'
	b.grades.gold = {title: 'Yearly Active Member', minScore: 52}
	b.grades.silver = {title: 'Season Active Member', minScore: 20}
	b.grades.bronze = {title: 'Monthly Active Member', minScore: 5}
	b.grades.default = {title: 'Weekly Active Member', minScore: 2}
	_BADGE_MODELS.push(b)

	// -- BADGE 2 : Number of compared videos --
	_BADGE_MODELS.push(new BadgeModel(
		'Content Contributor',
		(ds,user) => Object.keys(ds.individualScores[user]).filter(vid =>
			ds.getContributorsCount(vid, 'largely_recommended')>=3
		).length,
		'videos compared*',
		dataset
	))

	// -- BADGE 3 : Trusted contributor
	b = new BadgeModel(
		'Valued Contributor',
		(ds,user) => {
			let sum = 0
			for(const vid in ds.individualScores[user]) {
				if(ds.getContributorsCount(vid, 'largely_recommended')>=3)
					sum += ds.individualScores[user][vid]['largely_recommended']?.voting_right || 0
			}
			return sum
		},
		'voting rights given*',
		dataset
	)
	b.grades.default.title = 'Low Valued Contributor'
	b.grades.platinum.title = 'Most Valued Contributor'
	_BADGE_MODELS.push(b)

	// -- BADGE 4 : Top 10 user
	await initPodiumBadge(dataset)

	// -- BADGE 5 : First
	// -- BADGE 6 : Early contributors
	await initFirstAndEarlyBadges(dataset)

	// -- BADGE 7 to 16 : Criteria contributor
	await initCriteriaBadges(dataset)
}

async function initCriteriaBadges(dataset) {
	const _countCriterionComparison = (criterion) => {
		return (ds,user)=>{
			let val = 0
			for(const week in ds.comparisons.getDefault(user,criterion,{})) {
				val += ds.comparisons[user][criterion][week].filter(c =>
					ds.getContributorsCount(c.pos, criterion) >= 3 ||
					ds.getContributorsCount(c.neg, criterion) >= 3
				).length
			}
			return val
		}
	}

	_BADGE_MODELS.push(new BadgeModel(
		'Comparator',
		_countCriterionComparison('largely_recommended'),
		'public comparisons sent*',
		dataset
	))

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
	for(const criterion in criteriaText) {
		_BADGE_MODELS.push(new BadgeModel(
			'Comparator of ' + criteriaText[criterion],
			_countCriterionComparison(criterion),
			'comparisons with "' + criteriaText[criterion] + '" criterion*',
			dataset
		))
	}
}
async function initFirstAndEarlyBadges(dataset) {
	// For every video, find who are their first contributors (users having done a comparison on it with week being the minimum)
	const vidFirstContrib = {} // video: {week:{users}}
	for(const user in dataset.comparisons) {
		for(const week in dataset.comparisons[user]['largely_recommended']) {
			for(const cmp of dataset.comparisons[user]['largely_recommended'][week]) {
				for(const vid of [cmp.pos, cmp.neg]) {
					vidFirstContrib.deepSet(vid, week, user, true)
				}
			}
		}
	}

	const usersFirstContribs = {} // user: {first:[vid], early:[vid], follow:[vid]}
	for(const vid in vidFirstContrib) {
		// Exclude vid if not collectively recommended enough
		//if(!dataset.collectiveScores[vid] || dataset.collectiveScores[vid]['largely_recommended'].score < 20)
		//	continue
		// Exclude vid from achievement if it does not have enough contributors
		if(dataset.getContributorsCount(vid, 'largely_recommended') < 3)
			continue

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

	// First contributor badge for how many time the user is alone in vidos of vidFirstContrib
	_BADGE_MODELS.push(new BadgeModel(
		'Video First Contributor',
		(ds,user) => usersFirstContribs.getDefault(user,'first', []).length,
		"videos compared as the first contributor*",
		dataset
	))

	// Early contributor badge for how many time the user is not alone in vidFirstContrib
	_BADGE_MODELS.push(new BadgeModel(
		'Early Contributor',
		(ds,user) => usersFirstContribs.getDefault(user,'early', []).length,
		"videos compared before they had 3 contributors*",
		dataset
	))

	// Early contributor badge for how many time the user is not alone in vidFirstContrib
	/*_BADGE_MODELS.push(new BadgeModel(
		'Recommendation Follower',
		(ds,user) => usersFirstContribs.getDefault(user,'follow', []).length,
		"videos compared that already had 3+ contributors*",
		dataset
	))*/
}
async function initPodiumBadge(dataset) {
	// For every week, sort users by how many comparisons they made this week
	const usrCmpsByWeek = {} // week: {user: #comparisons}
	// dataset.comparisons = {<user>: {<criterion>: {<week>: [{pos: <vid>, neg: <vid>, score: <float>, score_max: <float>}]}}}
	for(const user in dataset.comparisons) {
		for(const week in dataset.comparisons[user]['largely_recommended']) {
			usrCmpsByWeek.deepSet(week,user, dataset.comparisons[user]['largely_recommended'][week].length)
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

	_BADGE_MODELS.push(new BadgeModel(
		'Weekly Podium Presence',
		(ds,user) => usrsPodiums.getDefault(user, 0),
		'weeks as top 10 contributor',
		dataset
	))
}
