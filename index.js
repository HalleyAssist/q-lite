class QPromise extends Promise {
	constructor(executor) {
		super(executor);
	}

	timeout(ms, message = undefined){
		return Q.timeout(this, ms, message)
	}

	delay(ms){
		return this.then(function(value){
			return Q.delay(ms).then(()=>value)
		})
	}

	fail(fn){
		return this.catch(fn)
	}

	done(onSuccess = undefined, onReject = undefined){
		if(!onSuccess) return
		this.then(onSuccess, onReject)
	}

	nodeify(fn){
		if(typeof fn !== 'function') return this

		this.done(r=>fn(null, r), e=>fn(e))
	}
	isPending(){
		return Q.isPending(this)
	}
	isFulfilled(){
		return Q.isFulfilled(this)
	}
	isRejected(){
		return Q.isRejected(this)
	}
}

function Q(value){
	return new QPromise(r=>r(value))
}

Q.Promise = QPromise

Q.defer = function defer(){
	let d
	d = {
		resolve: undefined, reject: undefined,
		promise: undefined
	}
	d.promise = new QPromise((resolve, reject)=>{
		d.resolve = resolve
		d.reject = reject
	})
	return d
}

Q.delay = function(ms){
	const deferred = Q.defer()
	const timer = setTimeout(deferred.resolve, ms)
	let ret = deferred.promise
	ret.cancel = function(){
		clearTimeout(timer)
		deferred.reject('delay cancelled')
	}
	return ret
}

Q.cancelledRace = async function(promises){
	let ret
	try {
		ret = await Promise.race(promises)
	} finally{
		for(const p of promises){
			if(p.cancel) p.cancel()
		}
	}
	return ret
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

Q.timeout = function (promise, ms, message = undefined){
	const deferred = Q.defer()

	const e = new Error(message ? message : `Timed out after ${ms} ms`)
	const timeout = setTimeout(function(){
		e.code = 'ETIMEDOUT'
		deferred.reject(e)
	}, ms)
	
	Promise.race([deferred.promise, promise]).then(r=>{
		clearTimeout(timeout)
		deferred.resolve(r)
	}, err=>{
		clearTimeout(timeout)
		deferred.reject(err)
	})
	
	return deferred.promise
}

Q.ninvoke = function(object, method, ...args){
	return Q.nfcall(object[method].bind(object), ...args)
}

Q.finvoke = function(object, method, ...args){
	return Q.fcall(object[method].bind(object), ...args)
}

Q.resetUnhandledRejections = function(){}

Q.all = function(values){
	return QPromise.all(values)
}

Q.reject = (reason)=>QPromise.reject(reason)
Q.resolve = value=>QPromise.resolve(value)

function _promiseState(promise){
	return process.binding('util').getPromiseDetails(promise)[0]
}
Q.isPending = function(promise){
	return _promiseState(promise) == 0
}

Q.isFulfilled = function(promise){
	return _promiseState(promise) == 1
}

Q.isRejected = function(promise){
	return _promiseState(promise) == 2
}

module.exports = Q