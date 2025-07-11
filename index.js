const util = require('util')

const { eventLoopUtilization } = require('perf_hooks').performance;

class QPromise extends Promise {
	constructor(executor) {
		super(executor);
	}

	timeout(ms, message = undefined) {
		return Q.timeout(this, ms, message)
	}

	delay(ms) {
		return this.then(function (value) {
			return Q.delay(ms).then(() => value)
		})
	}

	fail(fn) {
		return this.catch(fn)
	}

	done(onSuccess = undefined, onReject = undefined) {
		if (!onSuccess) return
		this.then(onSuccess, onReject)
	}

	nodeify(fn) {
		if (typeof fn !== 'function') return this

		this.done(r => fn(null, r), e => fn(e))
	}
	isPending() {
		return Q.isPending(this)
	}
	isFulfilled() {
		return Q.isFulfilled(this)
	}
	isRejected() {
		return Q.isRejected(this)
	}
}

class CancellationError extends Error {
	constructor(message = 'cancel') {
		super()
		this.message = message
		this.code = "ECANCEL"
	}
}

class CancellationState {
	constructor() {
		this.cancelled = false
		this._child = new Set()
	}
	addOnCancel(fn){
		if(this.cancelled) return false
		this._child.add(fn)
		return true
	}
	promiseWrap(promise) {
		if(this.cancelled) throw new CancellationError('Already cancelled')
		const cancelFn = promise.cancel
		if (cancelFn) {
			this._child.add(cancelFn)
			const doRemove = a => {
				if(this._child) this._child.delete(cancelFn)
				return a
			}
			const c = promise.then(doRemove, e=>{
				doRemove(undefined)
				throw e
			})
			c.cancel = cancelFn
			return c
		}
		return promise
	}
	_deferredWrapFns(weakDeferred){
		const cancelFn = ()=>{
			const deferred = weakDeferred.deref()
			if(!deferred) return
			deferred.reject(new CancellationError())
		}
		const doRemove = a => {
			if(this._child) this._child.delete(cancelFn)
			return a
		}
		return {cancelFn, doRemove}
	}
	deferredWrap(deferred){
		if(this.cancelled) throw new CancellationError('Already cancelled')
		const {cancelFn, doRemove} = this._deferredWrapFns(new WeakRef(deferred))
		this._child.add(cancelFn)
		deferred.promise = deferred.promise.then(doRemove, e=>{
			doRemove()
			throw e
		})
		return deferred
	}

	cancel() {
		if(this.cancelled) return
		this.cancelled = true
		for (const child of this._child) {
			child()
		}
		this._child = null
	}

	checkCancel(message = 'cancel') {
		if(this.cancelled) throw new CancellationError(message)
	}
}


function Q(value) {
	return new QPromise(r => r(value))
}

Q.Promise = QPromise

Q.CancellationError = CancellationError

Q.CancellationState = CancellationState

function AlreadyCancelledFn(){
	throw new Error('Already cancelled')
}

Q.canceller = function (fn) {
	// fn will be called with CancellationState as the first argument, followed by it's own arguments
	return function (...args) {
		const state = new CancellationState()
		const promise = fn.call(this, state, ...args)
		if(!promise?.then) return promise
		const promiseCancel = promise.cancel
		promise.cancel = function () {
			if(promiseCancel) promiseCancel.call(promise)
			state.cancel()
			promise.cancel = AlreadyCancelledFn
		}
		return promise
	}
}

Q.defer = function defer() {
	let d
	d = {
		resolve: undefined, reject: undefined,
		promise: undefined
	}
	d.promise = new QPromise((resolve, reject) => {
		d.resolve = resolve
		d.reject = reject
	})
	return d
}

Q.delay = function (ms) {
	const deferred = Q.defer()
	const timer = setTimeout(deferred.resolve, ms)
	let ret = deferred.promise
	ret.cancel = function () {
		clearTimeout(timer)
		deferred.reject('delay cancelled')
	}
	return ret
}

Q.safeRace = async function(contenders) {
	let deferreds = [], promises = []
	for (let contender of contenders) {
		const deferred = Q.defer()
		deferreds.push(deferred)
		promises.push(deferred.promise)

		if(!contender.then){
			deferred.resolve(contender)
		} else {
			contender.then(deferred.resolve, deferred.reject)
		}
	}

	try {
		return await Promise.race(promises)
	} finally {
		for (const deferred of deferreds) {
			deferred.resolve()
		}
	}
}

Q.cancelledRace = async function (promises, safeRace = true) {
	let ret
	try {
		if(safeRace){
			ret = Q.safeRace(promises)
		} else {
			ret = Promise.race(promises)
		}
		ret = await ret
	} finally {
		for (const p of promises) {
			if (p.cancel) p.cancel()
		}
	}
	return ret
}

Q.fcall = function (fn, ...args) {
	return new QPromise(async (resolve, reject) => {
		try {
			resolve(await fn(...args))
		} catch (ex) {
			reject(ex)
		}
	})
}

Q.nfcall = function (fn, ...args) {
	return new QPromise((resolve, reject) => {
		try {
			fn(...args, function (err, result) {
				if (err) {
					reject(err)
					return
				}
				resolve(result)
			})
		} catch (ex) {
			reject(ex)
		}
	})
}

Q.timeoutExact = function (promise, ms, message = undefined, overloadSafe = true) {
	const deferred = Q.defer()

	let e
	if(typeof message === 'symbol') e = message
	else e = new Error(message ? message : `Timed out after ${ms} ms`)

	let timeout

	promise.then(deferred.resolve, deferred.reject).then(() => {
		clearTimeout(timeout)
	})

	deferred.promise.cancel = () => {
		if (promise.cancel) promise.cancel()
		deferred.reject(new CancellationError())
	}

	deferred.promise.extend = (ms)=>{
		if(timeout){
			clearTimeout(timeout)
		}
		timeout = setTimeout(() => {
			if(e instanceof Error) e.code = 'ETIMEDOUT'
			if (overloadSafe) setImmediate(deferred.reject, e)
			else deferred.reject(e)
		}, ms)
	}
	deferred.promise.extend(ms)

	return deferred.promise
}

const EmptyTimer = function(){}
EmptyTimer.time = Number.POSITIVE_INFINITY
let nextTimer = EmptyTimer
const timers = new Set()
let nextTickTimer = null

function addTimer(fn, ms){
	const now = Date.now()
	const timeToRun = now + ms
	fn.time = timeToRun

	if(nextTimer.time > timeToRun){
		if(nextTimer !== EmptyTimer){
			timers.add(nextTimer)
		}
		nextTimer = fn
		if(nextTickTimer === null) {
			nextTickTimer = setTimeout(executeTimerTick, 25, now + 25)
		}
	} else {
		timers.add(fn)
	}

}

function adjustTimer(fn, ms){
	const now = Date.now()
	fn.time = now + ms
	if(nextTimer === fn){
		for(const t in timers){
			if(t.time < fn.time) {
				nextTimer = t
				timers.add(fn)
				return
			}	
		}
	}else{
		if(fn.time < nextTimer.time){
			timers.add(nextTimer)
			nextTimer = fn
		}
	}
}

function clearTimer(fn){
	if(nextTimer === fn){
		nextTimer = EmptyTimer
		for(const t of timers){	
			// potentially the next tiemr
			if(t.time < nextTimer.time){
				nextTimer = t
			}
		}
		if(nextTimer === EmptyTimer){
			clearTimeout(nextTickTimer)
			nextTickTimer = null
		} else {
			timers.delete(nextTimer)
		}
	} else {
		timers.delete(fn)
	}
}

function executeTimerTick(scheduled){
	const now = Date.now()
	const workingTime = (now + scheduled) / 2

	if(nextTimer.time > workingTime){
		if(nextTimer !== EmptyTimer){
			nextTickTimer = setTimeout(executeTimerTick, 25, Math.min(now + 25, workingTime + 50))
		} else {
			nextTickTimer = null
		}
		return
	}

	// execute the next timer
	setImmediate(nextTimer)
	nextTimer = EmptyTimer

	// find the next timer, execute any due timers
	for(const t of timers){
		// due for execution
		if(t.time <= workingTime) {
			setImmediate(t)
			timers.delete(t)
			continue
		}

		// potentially the next tiemr
		if(t.time < nextTimer.time){
			nextTimer = t
		}
	}

	if(nextTimer !== EmptyTimer){
		timers.delete(nextTimer)
	
		// schedule the next timer
		nextTickTimer = setTimeout(executeTimerTick, 25, Math.min(now + 25, workingTime + 50))
	} else {
		nextTickTimer = null
	}
}

Q._debugTimer = function(){
	return {
		nextTimer,
		nextTickTimer
	}
}

Q.timeout = function (promise, ms, message = undefined) {
	const deferred = Q.defer()

	let e
	if(typeof message === 'symbol') e = message
	else e = new Error(message ? message : `Timed out after ${ms} ms`)

	const final = () => {
		if(e instanceof Error) e.code = 'ETIMEDOUT'
		deferred.reject(e)
	}

	let currentlyInching = false
	let firstUtil = null
	let inchingTimeout = () => {
		// 10% of the time to run is required at the end to ensure we have executed all timer dependencies

		if(!firstUtil){
			firstUtil = eventLoopUtilization()
			addTimer(inchingTimeout, Math.max(50, ms * 0.11))
			return
		}

		const elu = eventLoopUtilization(firstUtil);
		ms -= elu.idle
		if(ms <= 0) {
			final()
		} else {
			firstUtil = elu
			addTimer(inchingTimeout, Math.max(50, ms))
		}
	}
	let largeTimeout = () => {
		addTimer(inchingTimeout, ms * 0.5)
		currentlyInching = true
	}

	promise.then(deferred.resolve, deferred.reject).then(() => {
		clearTimer(largeTimeout)
		clearTimer(inchingTimeout)
	})

	deferred.promise.cancel = () => {
		if (promise.cancel) promise.cancel()
		deferred.reject(new CancellationError())
	}

	deferred.promise.extend = (_ms)=>{
		ms = _ms
		firstUtil = null
		if(currentlyInching) {
			if(ms > 2000) {
				clearTimer(inchingTimeout)
				addTimer(largeTimeout, ms - 2000)
				currentlyInching = false
				ms = 2000
			} else {
				adjustTimer(inchingTimeout, _ms * 0.5)
			}
		} else {
			adjustTimer(largeTimeout, Math.max(0, ms - 2000))
			ms = 2000
		}
	}

	// start the timeout
	if(ms > 2000) {
		addTimer(largeTimeout, ms - 2000)
		ms = 2000
	} else {
		currentlyInching = true
		addTimer(inchingTimeout, ms * 0.5)
	}

	return deferred.promise
}

Q.timewarn = async function (promise, ms, fn, message = undefined) {
	let ex = new Error(message ? message : `Timed out after ${ms} ms`)
    async function doCall() {
		if(!ex) return
		ex.code = 'ETIMEDOUT'

		// if returns true or a ms value we should wait again
		const requeue = await fn(ex)
        if(requeue){
			if(!ex) return
			addTimer(doCall, Number.isInteger(requeue) ? requeue : ms)
		}
    }
    addTimer(doCall, ms)
    function doClear(v){
        clearTimer(doCall)
		ex = null
		return v
    }
    function doClearEx(ex){
        doClear()
        throw ex
    }
    
    return await promise.then(doClear, doClearEx)
}

Q.deferredTimeout = function (deferred, ms, symbol = undefined) {
	if (!symbol) {
		symbol = new Error(`Timed out after ${ms} ms`)
	}

	const fn = () => {
		deferred.reject(symbol)
	}

	addTimer(fn, ms)

	deferred.promise.catch(() => { }).then(() => {
		clearTimer(fn)
	})

	return deferred.promise
}

Q.ninvoke = async function (object, method, ...args) {
	return Q.nfcall(await object[method].bind(object), ...args)
}

Q.finvoke = async function (object, method, ...args) {
	return Q.fcall(await object[method].bind(object), ...args)
}

Q.nextTick = function(){
	return new Promise(resolve=>{
		process.nextTick(resolve)
	})
}

Q.resetUnhandledRejections = function () { }

async function safeAll(values, cancelFn)  {
	const deferred = Q.defer()
	cancelFn(()=>{
		deferred.reject(new CancellationError())
	})
	const allPromise = Promise.all(values)
	try {
		await Promise.race([deferred.promise, allPromise])
	} catch(ex){
		for(const p of values){
			if(p.cancel) p.cancel()
		}
		throw ex
	} finally {
		deferred.resolve()
	}
	return await allPromise
}

Q.safeAll = function(values){
	let cancel
	const ret = safeAll(values, c=>cancel=c)
	ret.cancel = cancel
	return ret
}

Q.all = function (values, cancel = true) {
	if(cancel){
		return Q.safeAll(values)	
	}
	return QPromise.all(values, cancel)
}

Q.reject = (reason) => QPromise.reject(reason)
Q.resolve = value => QPromise.resolve(value)

const Util = process.binding('util')

let _promiseState
if (Util.getPromiseDetails) {
	_promiseState = function (promise) {
		return Util.getPromiseDetails(promise)[0]
	}
} else {
	// eslint-disable-next-line no-control-regex
	const RejectedPromise = new RegExp("\\{[\\s\n\r]+<rejected>")
	// eslint-disable-next-line no-control-regex
	const PendingPromise = new RegExp("\\{[\\s\n\r]+<pending>")

	_promiseState = function (promise) {
		const p = util.inspect(promise)
		if (RejectedPromise.test(p)) {
			return 2
		} else if (PendingPromise.test(p)) {
			return 0
		} else {
			return 1
		}
	}
}

Q.isPending = function (promise) {
	return _promiseState(promise) == 0
}

Q.isFulfilled = function (promise) {
	return _promiseState(promise) == 1
}

Q.isRejected = function (promise) {
	return _promiseState(promise) == 2
}

Q.CancellationError = CancellationError

async function singularize(fn, cancelFn, args){
	const deferred = Q.defer()
	cancelFn(()=>{
		deferred.reject(new CancellationError())
	})

	const p = fn(...args)
	await Q.cancelledRace([p, deferred.promise])

	return await p
}

Q.singularize = function(fn){
	let currentPromise = null
	return function(...args){
		if(currentPromise) {
			return currentPromise
		}

		let cancel
		const ret = singularize(fn.bind(this), c=>cancel=c, args)
		ret.cancel = cancel
		currentPromise = ret
		ret.catch(()=>{}).then(()=>{
			currentPromise = null
		})

		return ret
	}
}


async function safeyAwait(cancelFn, primaryValues, secondaryValues){
	let dd
	for(let i = 0; i < secondaryValues.length; i++){
		dd = Q.defer()
		const promise = secondaryValues[i]
		promise.then(dd.resolve, dd.reject)
		dd.promise.resolve = dd.resolve
		secondaryValues[i] = dd.promise
	}

	let deferred = dd
	if(!deferred) {
		deferred = Q.defer()
		deferred.promise.resolve = deferred.resolve
		secondaryValues.push(deferred.promise)
	}
	cancelFn(()=>deferred.reject(Q.CancellationError))

	try {
		await Promise.race([...primaryValues, ...secondaryValues])
	} finally {
		for(const p of secondaryValues){
			p.resolve()
		}
	}
}

Q.safeyAwait = function(primaryValues, secondaryValues) {
	let cancel
	const ret = safeyAwait(c=>cancel=c, primaryValues, secondaryValues)
	ret.cancel = cancel
	return ret
}

module.exports = Q