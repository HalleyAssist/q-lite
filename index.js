class QPromise extends Promise {
	constructor(executor) {
			super(executor);
	}

	timeout(ms, message){
		const deferred = Q.deferred()
		setTimeout(function(){
			const e = new Error(message ? message : ("Timed out after " + ms + " ms"))
			e.code = 'ETIMEDOUT'
			deferred.reject(e)
		}, ms)
		this.then(function(r){
			deferred.resolve(r)
		})
		return deferred.promise
	}

	delay(ms){
		return this.then(function(){
			return Q.delay(ms)
		})
	}

	fail(fn){
		return this.catch(fn)
	}

	finally(fn){
		return this.then(async r => {
			await fn()
			return r
		}, async (ex) => {
			await fn()
			throw ex
		})
	}
}

function Q(value){
	if(value && value.then){
		return QPromise.resolve().then(()=>value)
	}else{
		return QPromise.resolve(value)
	}
}

Q.defer = function(){
	const d = {}
	d.promise = Q(new QPromise((resolve, reject)=>{
		d.resolve = resolve
		d.reject = reject
	}))
	return d
}

Q.delay = function(ms){
	const deferred = Q.deferred()
	setTimeout(function(){
		deferred.resolve()
	}, ms)
	return deferred.promise
}

Q.fcall = function(fn, ...args){
	return new QPromise((resolve, reject)=>{
		try {
			resolve(fn(...args))
		} catch(ex){
			reject(ex)
		}
	})
}

Q.nfcall = function(fn,...args){
	return new QPromise((resolve, reject)=>{
		try {
			fn(...args, function(err, result){
				if(err) {
					reject(err)
					return
				}
				resolve(result)
			})
		} catch(ex){
			reject(ex)
		}
	})
}

Q.resetUnhandledRejections = function(){}

Q.all = function(values){
	return QPromise.all(values)
}

module.exports = Q