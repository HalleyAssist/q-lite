const util = require('util')

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

function isPrimitive(value) {
    return (
      value === null ||
      (typeof value !== "object" && typeof value !== "function")
    );
  }
  
// Keys are the values passed to race, values are a record of data containing a
// set of deferreds and whether the value has settled.
const wm = new WeakMap();

// This NodeJS / v8 issue show the stupidity of Promise.race
// Issue: https://github.com/nodejs/node/issues/17469
// Fortunately a nice guy (brainkim) wrote a safeRace function

Q.safeRace = function(contenders) {
    let deferred;
    const result = new Promise((resolve, reject) => {
        deferred = {resolve, reject};
        for (const contender of contenders) {
            if (isPrimitive(contender)) {
                // If the contender is a primitive, attempting to use it as a key in the
                // weakmap would throw an error. Luckily, it is safe to call
                // `Promise.resolve(contender).then` on a primitive value multiple times
                // because the promise fulfills immediately.
                Promise.resolve(contender).then(resolve, reject);
                continue;
            }

            let record = wm.get(contender);
            if (record === undefined) {
                record = {deferreds: new Set([deferred]), settled: false};
                wm.set(contender, record);
                // This call to `then` happens once for the lifetime of the value.
                Promise.resolve(contender).then(
                    (value) => {
                        record.settled = true;
                        for (const {resolve} of record.deferreds) {
                            resolve(value);
                        }

                        record.deferreds.clear();
                    },
                    (err) => {
                        record.settled = true;
                        for (const {reject} of record.deferreds) {
                            reject(err);
                        }

                        record.deferreds.clear();
                    },
                );
            } else if (record.settled) {
                // If the value has settled, it is safe to call
                // `Promise.resolve(contender).then` on it.
                Promise.resolve(contender).then(resolve, reject);
            } else {
                record.deferreds.add(deferred);
            }
        }
    });

    // The finally callback executes when any value settles, preventing any of
    // the unresolved values from retaining a reference to the resolved value.
    return result.finally(() => {
        for (const contender of contenders) {
            if (!isPrimitive(contender)) {
                const record = wm.get(contender);
                record.deferreds.delete(deferred);
            }
        }
    });
}

Q.cancelledRace = async function(promises, safeRace = true){
	let ret
	try {
		ret = await (safeRace ? Q.safeRace : Promise.race)(promises)
	} finally{
		for(const p of promises){
			if(p.cancel) p.cancel()
		}
	}
	return ret
}

Q.fcall = function(fn, ...args){
	return new QPromise(async (resolve, reject)=>{
		try {
			resolve(await fn(...args))
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

Q.timeout = function (promise, ms, message = undefined, overloadSafe = true){
	const deferred = Q.defer()

	const e = new Error(message ? message : `Timed out after ${ms} ms`)
	const timeout = setTimeout(() => {
		e.code = 'ETIMEDOUT'
		if(overloadSafe) setImmediate(deferred.reject, e)
		else deferred.reject(e)
	}, ms)
	
	promise.then(deferred.resolve, deferred.reject).then(()=>{
		clearTimeout(timeout)
	})
	
	deferred.promise.cancel = () =>{
		if(promise.cancel) promise.cancel()
		deferred.reject('cancelled')
	}

	return deferred.promise
}

Q.deferredTimeout = function(deferred, ms, symbol = undefined, overloadSafe = true){
	if(!symbol) {
		symbol = new Error(`Timed out after ${ms} ms`)
	}
	const timer = setTimeout(()=>{
		if(overloadSafe) setImmediate(deferred.reject, symbol)
		else deferred.reject(symbol)
	}, ms)

	deferred.promise.catch(()=>{}).then(()=>{
		clearTimeout(timer)
	})

	return deferred.promise
}

Q.ninvoke = async function(object, method, ...args){
	return Q.nfcall(await object[method].bind(object), ...args)
}

Q.finvoke = async function(object, method, ...args){
	return Q.fcall(await object[method].bind(object), ...args)
}

Q.resetUnhandledRejections = function(){}

Q.all = function(values){
	return QPromise.all(values)
}

Q.reject = (reason)=>QPromise.reject(reason)
Q.resolve = value=>QPromise.resolve(value)

const Util = process.binding('util')

let _promiseState
if(Util.getPromiseDetails){
	_promiseState = function(promise){
		return Util.getPromiseDetails(promise)[0]
	}
} else{
	// eslint-disable-next-line no-control-regex
	const RejectedPromise = new RegExp("\\{[\\s\n\r]+<rejected>")
	// eslint-disable-next-line no-control-regex
	const PendingPromise = new RegExp("\\{[\\s\n\r]+<pending>")

	_promiseState = function(promise){
		const p = util.inspect(promise)
		if(RejectedPromise.test(p)){
			return 2
		} else if(PendingPromise.test(p)){
			return 0
		} else{
			return 1
		}
	}
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