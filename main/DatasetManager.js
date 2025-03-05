function DatasetManager() {
	const DSM = this
	this.zip = null

	this.individualScores = {} // {<user>: {<vid>: {<criterion>: {score: <float>, uncertainty: <float>, voting_right: <float>}}}}
	this.collectiveScores = {} // {<vid>: {<criterion>: {score: <float>, uncertainty: <float>}}}
	this.comparisons = {} // {<user>: {<criterion>: {<week>: [{pos: <vid>, neg: <vid>, score: <float>, score_max: <float>}]}}}

	this.setZip = async function(file, onUpdate) {
		onUpdate('Extracting Dataset...')
		return new JSZip().loadAsync(file)
			.then((content) => DSM.zip = content)
			.then(() => onUpdate('Loading collective scores...'))
			.then(DSM.loadCollectiveScores)
			.then(() => onUpdate('Loading individual scores...'))
			.then(DSM.loadIndividualScores)
			.then(() => onUpdate('Loading comparisons...'))
			.then(DSM.loadComparisons)
	}

	this.loadCollectiveScores = () => new Promise((resolve, reject) => {
		const REQ_COLS = ['video', 'criteria', 'score'/*, 'uncertainty'*/]
		const ta = new Date()
		if(!DSM.zip || !DSM.zip.files || !('collective_criteria_scores.csv' in DSM.zip.files)) {
			return reject('No collective_criteria_scores.csv file found in Zip')
		}
		DSM.zip.file('collective_criteria_scores.csv').async('string').then(csvText => {
			// Séparer les lignes par le retour à la ligne
			const rows = csvText.trim().split('\n')

			// Extraire l'en-tête (la première ligne)
			const header = rows.shift().split(',').map(item => item.trim())

			// Validate format
			for(const col of REQ_COLS) {
				if(header.indexOf(col) < 0) {
					console.error('collective_criteria_scores.csv format', header)
					return reject('Unexpected collective_criteria_scores.csv file format')
				}
			}

			rows.map(r => {
				const values = r.split(',')
				const obj = {}
				for(const col in header) {
					obj[header[col]] = values[col].trim()
				}
				return obj
			}).forEach((obj) => {
				if(!(obj.video in DSM.collectiveScores)) {
					DSM.collectiveScores[obj.video] = {}
				}
				if(!(obj.criteria in DSM.collectiveScores[obj.video])) {
					DSM.collectiveScores[obj.video][obj.criteria] = {}
				}
				DSM.collectiveScores[obj.video][obj.criteria] = {
					score: parseFloat(obj.score),
					//uncertainty: parseFloat(obj.uncertainty),
				}
			})
			console.log('Loaded ' + rows.length + ' collective scores in', (new Date()-ta)/1000, 'seconds')
		})
		.then(resolve)
		.catch(reject)
	})

	this.loadIndividualScores = () => new Promise((resolve, reject) => {
		const REQ_COLS = ['public_username', 'video', 'criteria', 'score'/*, 'uncertainty', 'voting_right'*/]
		const ta = new Date()
		DSM.zip.file('individual_criteria_scores.csv').async('string').then(csvText => {
			// Séparer les lignes par le retour à la ligne
			const rows = csvText.trim().split('\n')

			// Extraire l'en-tête (la première ligne)
			const header = rows.shift().split(',').map(item => item.trim())

			// Validate format
			for(const col of REQ_COLS) {
				if(header.indexOf(col) < 0) {
					console.error('individual_criteria_scores.csv format', header)
					return reject('Unexpected individual_criteria_scores.csv file format')
				}
			}

			rows.map((r) => {
				const values = r.split(',')
				const obj = {}
				for(const col in header) {
					obj[header[col]] = values[col].trim()
				}
				return obj
			}).forEach((obj) => {
				if(!(obj.public_username in DSM.individualScores)) {
					DSM.individualScores[obj.public_username] = {}
				}
				if(!(obj.video in DSM.individualScores[obj.public_username])) {
					DSM.individualScores[obj.public_username][obj.video] = {}
				}
				DSM.individualScores[obj.public_username][obj.video][obj.criteria] = {
					score: parseFloat(obj.score),
					//uncertainty: parseFloat(obj.uncertainty),
					//voting_right: parseFloat(obj.voting_right),
				}
			})
			console.log('Loaded ' + rows.length + ' individual scores in', (new Date()-ta)/1000, 'seconds')
		})
		.then(resolve)
		.catch(reject)
	})

	this.loadComparisons = () => new Promise((resolve, reject) => {
		const REQ_COLS = ['public_username', 'video_a', 'video_b', 'criteria', 'score'/*, 'score_max'*/, 'week_date']
		const ta = new Date()
		DSM.zip.file('comparisons.csv').async('string').then(csvText => {
			// Séparer les lignes par le retour à la ligne
			const rows = csvText.trim().split('\n')

			// Extraire l'en-tête (la première ligne)
			const header = rows.shift().split(',').map(item => item.trim())

			// Validate format
			for(const col of REQ_COLS) {
				if(header.indexOf(col) < 0) {
					console.error('comparisons.csv format', header)
					return reject('Unexpected comparisons.csv file format')
				}
			}

			rows.map((r) => {
				const values = r.split(',')
				const obj = {}
				for(const col in header) {
					obj[header[col]] = values[col].trim()
				}
				return obj
			}).forEach((obj) => {
				if(!(obj.public_username in DSM.comparisons)) {
					DSM.comparisons[obj.public_username] = {}
				}
				if(!(obj.criteria in DSM.comparisons[obj.public_username])) {
					DSM.comparisons[obj.public_username][obj.criteria] = {}
				}
				if(!(obj.week_date in DSM.comparisons[obj.public_username][obj.criteria])) {
					DSM.comparisons[obj.public_username][obj.criteria][obj.week_date] = []
				}

				DSM.comparisons[obj.public_username][obj.criteria][obj.week_date].push({
					pos: obj.video_a,
					neg: obj.video_b,
					score: parseFloat(obj.score),
					//score_max: parseFloat(obj.score_max),
				})
			})
			console.log('Loaded ' + rows.length + ' comparisons in', (new Date()-ta)/1000, 'seconds')
		})
		.then(resolve)
		.catch(reject)
	})
}
