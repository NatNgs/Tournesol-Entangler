
// POLYFILL

Object.defineProperty(Object.prototype, "getDefault", {
	value: function(...params) {
		const deflt = params.pop()

		let out = this
		while(params.length) {
			const k = params.shift()
			if(!out.hasOwnProperty(k))
				return deflt
			out = out[k]
		}
		return out
	}
});
Object.defineProperty(Object.prototype, "setDefault", {
	value: function(...params) {
		const defaultValue = params.pop()
		const lastKey = params.pop()

		let map = this
		while(params.length) {
			const k = params.shift()
			if(!map.hasOwnProperty(k))
				map[k] = {}
			map = map[k]
		}
		if(!map.hasOwnProperty(lastKey))
			map[lastKey] = defaultValue
		return map[lastKey]
	}
});

Object.defineProperty(Object.prototype, "deepSet", {
	value: function(...params) {
		const value = params.pop()
		const lastKey = params.pop()

		let map = this
		while(params.length) {
			const k = params.shift()
			if(!map.hasOwnProperty(k))
				map[k] = {}
			map = map[k]
		}
		map[lastKey] = value
		return this
	}
});

Object.defineProperty(Object.prototype, "size", {
	value: function() {
		return Object.keys(this).length
	}
});
