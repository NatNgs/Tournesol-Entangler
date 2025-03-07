class DatasetManager {
	constructor() {
		this.zip = null

		this.individualScores = {} // {<user>: {<vid>: {<criterion>: {score: <float>, uncertainty: <float>, voting_right: <float>}}}}
		this.collectiveScores = {} // {<vid>: {<criterion>: {score: <float>, uncertainty: <float>}}}
		this.comparisons = {} // {<user>: {<criterion>: {<week>: [{pos: <vid>, neg: <vid>, score: <float>, score_max: <float>}]}}}
	}

	async setZip(file, onUpdate) {
			onUpdate('Extracting Dataset...')
			return new JSZip().loadAsync(file)
				.then((content) => this.zip = content)
				.then(() => onUpdate('Loading collective scores...'))
				.then(() => this.loadCollectiveScores())
				.then(() => onUpdate('Loading individual scores...'))
				.then(() => this.loadIndividualScores())
				.then(() => onUpdate('Loading comparisons...'))
				.then(() => this.loadComparisons())
	}

	loadCollectiveScores() {
		return new Promise((resolve, reject) => {
			const REQ_COLS = ['video', 'criteria', 'score' /*, 'uncertainty'*/]
			const ta = new Date()
			if (!this.zip || !this.zip.files || !('collective_criteria_scores.csv' in this.zip.files)) {
				return reject('No collective_criteria_scores.csv file found in Zip')
			}
			this.zip.file('collective_criteria_scores.csv').async('string')
			.then(csvText => {
				// Séparer les lignes par le retour à la ligne
				const rows = csvText.trim().split('\n')

				// Extraire l'en-tête (la première ligne)
				const header = rows.shift().split(',').map(item => item.trim())

				// Validate format
				for (const col of REQ_COLS) {
					if (header.indexOf(col) < 0) {
						console.error('collective_criteria_scores.csv format', header)
						return reject('Unexpected collective_criteria_scores.csv file format')
					}
				}

				rows.map(r => {
					const values = r.split(',')
					const obj = {}
					for (const col in header) {
						obj[header[col]] = values[col].trim()
					}
					return obj
				}).forEach((obj) => {
					if (!(obj.video in this.collectiveScores)) {
						this.collectiveScores[obj.video] = {}
					}
					if (!(obj.criteria in this.collectiveScores[obj.video])) {
						this.collectiveScores[obj.video][obj.criteria] = {}
					}
					this.collectiveScores[obj.video][obj.criteria] = {
						score: parseFloat(obj.score),
						//uncertainty: parseFloat(obj.uncertainty),
					}
				})
				console.log('Loaded ' + rows.length + ' collective scores in', (new Date() - ta) / 1000, 'seconds')
			})
			.then(resolve)
			.catch(reject)
		})
	}

	loadIndividualScores() {
		return new Promise((resolve, reject) => {
			const REQ_COLS = ['public_username', 'video', 'criteria', 'score' /*, 'uncertainty'*/, 'voting_right']
			const ta = new Date()
			this.zip.file('individual_criteria_scores.csv').async('string')
			.then(csvText => {
				// Séparer les lignes par le retour à la ligne
				const rows = csvText.trim().split('\n')

				// Extraire l'en-tête (la première ligne)
				const header = rows.shift().split(',').map(item => item.trim())

				// Validate format
				for (const col of REQ_COLS) {
					if (header.indexOf(col) < 0) {
						console.error('individual_criteria_scores.csv format', header)
						return reject('Unexpected individual_criteria_scores.csv file format')
					}
				}

				rows.map((r) => {
					const values = r.split(',')
					const obj = {}
					for (const col in header) {
						obj[header[col]] = values[col].trim()
					}
					return obj
				}).forEach((obj) => {
					if (!(obj.public_username in this.individualScores)) {
						this.individualScores[obj.public_username] = {}
					}
					if (!(obj.video in this.individualScores[obj.public_username])) {
						this.individualScores[obj.public_username][obj.video] = {}
					}
					this.individualScores[obj.public_username][obj.video][obj.criteria] = {
						score: parseFloat(obj.score),
						//uncertainty: parseFloat(obj.uncertainty),
						voting_right: parseFloat(obj.voting_right || 0),
					}
				})
				console.log('Loaded ' + rows.length + ' individual scores in', (new Date() - ta) / 1000, 'seconds')
			})
			.then(resolve)
			.catch(reject)
		})
	}

	loadComparisons() {
		return new Promise((resolve, reject) => {
			const REQ_COLS = ['public_username', 'video_a', 'video_b', 'criteria', 'score' /*, 'score_max'*/, 'week_date']
			const ta = new Date()
			this.zip.file('comparisons.csv').async('string')
			.then(csvText => {
				// Séparer les lignes par le retour à la ligne
				const rows = csvText.trim().split('\n')

				// Extraire l'en-tête (la première ligne)
				const header = rows.shift().split(',').map(item => item.trim())

				// Validate format
				for (const col of REQ_COLS) {
					if (header.indexOf(col) < 0) {
						console.error('comparisons.csv format', header)
						return reject('Unexpected comparisons.csv file format')
					}
				}

				rows.map((r) => {
					const values = r.split(',')
					const obj = {}
					for (const col in header) {
						obj[header[col]] = values[col].trim()
					}
					return obj
				}).forEach((obj) => {
					if (!(obj.public_username in this.comparisons)) {
						this.comparisons[obj.public_username] = {}
					}
					if (!(obj.criteria in this.comparisons[obj.public_username])) {
						this.comparisons[obj.public_username][obj.criteria] = {}
					}
					if (!(obj.week_date in this.comparisons[obj.public_username][obj.criteria])) {
						this.comparisons[obj.public_username][obj.criteria][obj.week_date] = []
					}

					this.comparisons[obj.public_username][obj.criteria][obj.week_date].push({
						pos: obj.video_a,
						neg: obj.video_b,
						score: parseFloat(obj.score),
						//score_max: parseFloat(obj.score_max),
					})
				})
				console.log('Loaded ' + rows.length + ' comparisons in', (new Date() - ta) / 1000, 'seconds')
			})
			.then(resolve)
			.catch(reject)
		})
	}
}
