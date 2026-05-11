const util = require('util')

const { eventLoopUtilization } = require('perf_hooks').performance;

class QPromise extends Promise {
	/**
	 * Creates a promise with Q-lite instance helpers.
	 * @param {(resolve: (value?: any) => void, reject: (reason?: any) => void) => void} executor Promise executor callback.
	 * @returns {void}
	 */
	constructor(executor) {
		super(executor);
	}

	/**
	 * Wraps the current promise with a timeout.
	 * @param {number} ms Number of milliseconds before timing out.
	 * @param {string|symbol|undefined} [message=undefined] Optional timeout message or symbol.
	 * @returns {QPromise<any>} A timeout-aware promise.
	 */
	timeout(ms, message = undefined) {
		return Q.timeout(this, ms, message)
	}

	/**
	 * Delays resolution of the fulfilled value.
	 * @param {number} ms Number of milliseconds to wait.
	 * @returns {QPromise<any>} A promise resolved with the original value after the delay.
	 */
	delay(ms) {
		return this.then(function (value) {
			return Q.delay(ms).then(() => value)
		})
	}

	/**
	 * Registers a rejection handler.
	 * @param {(reason: any) => any} fn Rejection handler.
	 * @returns {QPromise<any>} A promise for the handler result.
	 */
	fail(fn) {
		return this.catch(fn)
	}

	/**
	 * Attaches terminal handlers without returning a chained promise.
	 * @param {(value: any) => any} [onSuccess=undefined] Fulfillment handler.
	 * @param {(reason: any) => any} [onReject=undefined] Rejection handler.
	 * @returns {void}
	 */
	done(onSuccess = undefined, onReject = undefined) {
		if (!onSuccess) return
		this.then(onSuccess, onReject)
	}

	/**
	 * Calls a Node-style callback when the promise settles.
	 * @param {Function|undefined} fn Callback receiving `(error, result)`.
	 * @returns {QPromise<any>|undefined} The original promise when no callback is supplied, otherwise `undefined`.
	 */
	nodeify(fn) {
		if (typeof fn !== 'function') return this

		this.done(r => fn(null, r), e => fn(e))
	}
	/**
	 * Checks whether the promise is still pending.
	 * @returns {boolean} `true` when the promise has not settled.
	 */
	isPending() {
		return Q.isPending(this)
	}
	/**
	 * Checks whether the promise is fulfilled.
	 * @returns {boolean} `true` when the promise is fulfilled.
	 */
	isFulfilled() {
		return Q.isFulfilled(this)
	}
	/**
	 * Checks whether the promise is rejected.
	 * @returns {boolean} `true` when the promise is rejected.
	 */
	isRejected() {
		return Q.isRejected(this)
	}
}

class CancellationError extends Error {
	/**
	 * Creates a cancellation error.
	 * @param {string} [message='cancel'] Error message.
	 * @returns {void}
	 */
	constructor(message = 'cancel') {
		super()
		this.message = message
		this.code = "ECANCEL"
	}
}

class CancellationState {
	/**
	 * Creates a cancellation tracking container.
	 * @returns {void}
	 */
	constructor() {
		this.cancelled = false
		this._child = new Set()
	}
	/**
	 * Registers a callback to run on cancellation.
	 * @param {Function} fn Cancellation callback.
	 * @returns {boolean} `true` when the callback was registered.
	 */
	addOnCancel(fn){
		if(this.cancelled) return false
		this._child.add(fn)
		return true
	}
	/**
	 * Tracks a cancellable promise under this state.
	 * @param {Promise<any> & { cancel?: Function }} promise Promise to wrap.
	 * @returns {Promise<any>} The wrapped promise.
	 */
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
	/**
	 * Creates helper functions for wrapping a deferred.
	 * @param {WeakRef<{ reject: Function }>} weakDeferred Weak reference to the deferred object.
	 * @returns {{ cancelFn: Function, doRemove: Function }} Cancellation helpers.
	 */
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
	/**
	 * Tracks a deferred object under this cancellation state.
	 * @param {{ promise: Promise<any>, reject: Function }} deferred Deferred object to wrap.
	 * @returns {{ promise: Promise<any>, reject: Function }} The wrapped deferred.
	 */
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

	/**
	 * Cancels all registered children.
	 * @returns {void}
	 */
	cancel() {
		if(this.cancelled) return
		this.cancelled = true
		for (const child of this._child) {
			child()
		}
		this._child = null
	}

	/**
	 * Throws when the state has already been cancelled.
	 * @param {string} [message='cancel'] Message used for the cancellation error.
	 * @returns {void}
	 */
	checkCancel(message = 'cancel') {
		if(this.cancelled) throw new CancellationError(message)
	}
}


/**
 * Wraps a value in a `QPromise`.
 * @param {any} value Value to resolve.
 * @returns {QPromise<any>} A resolved `QPromise`.
 */
function Q(value) {
	return new QPromise(r => r(value))
}

Q.Promise = QPromise

Q.CancellationError = CancellationError

Q.CancellationState = CancellationState

/**
 * Throws after a promise has already been cancelled.
 * @returns {never} This function always throws.
 */
function AlreadyCancelledFn(){
	throw new Error('Already cancelled')
}

/**
 * Wraps a function so its returned promise becomes cancellable.
 * @param {Function} fn Function receiving `CancellationState` as its first argument.
 * @returns {Function} A wrapped function with cancellation support.
 */
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

/**
 * Creates a deferred object.
 * @returns {{ resolve: Function, reject: Function, promise: QPromise<any> }} A deferred container.
 */
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

/**
 * Returns a cancellable delay promise.
 * @param {number} ms Number of milliseconds to delay.
 * @returns {QPromise<void> & { cancel: Function }} A promise that resolves after the delay.
 */
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

/**
 * Races values without exposing unresolved deferred state.
 * @param {Iterable<any>} contenders Values or promises to race.
 * @returns {Promise<any>} A promise for the first settled contender.
 */
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

/**
 * Races promises and cancels the losers.
 * @param {Array<Promise<any> & { cancel?: Function }>} promises Promises to race.
 * @param {boolean} [safeRace=true] Uses `Q.safeRace` when `true`.
 * @returns {Promise<any>} A promise for the winning result.
 */
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

/**
 * Calls a function and resolves with its return value.
 * @param {Function} fn Function to invoke.
 * @param {...any} args Arguments passed to the function.
 * @returns {QPromise<any>} A promise for the function result.
 */
Q.fcall = function (fn, ...args) {
	return new QPromise(async (resolve, reject) => {
		try {
			resolve(await fn(...args))
		} catch (ex) {
			reject(ex)
		}
	})
}

/**
 * Calls a Node-style callback function and resolves its result.
 * @param {Function} fn Node-style function to invoke.
 * @param {...any} args Arguments passed before the callback.
 * @returns {QPromise<any>} A promise for the callback result.
 */
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

/**
 * Applies an exact timeout using `setTimeout`.
 * @param {Promise<any> & { cancel?: Function }} promise Promise to guard.
 * @param {number} ms Timeout in milliseconds.
 * @param {string|symbol|undefined} [message=undefined] Optional timeout message.
 * @param {boolean} [overloadSafe=true] Defers rejection with `setImmediate` when `true`.
 * @returns {QPromise<any> & { cancel: Function, extend: Function }} A timeout-aware promise.
 */
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

/**
 * Schedules a timer callback.
 * @param {Function & { time?: number }} fn Callback to schedule.
 * @param {number} ms Delay in milliseconds.
 * @returns {void}
 */
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

/**
 * Adjusts the execution time for a scheduled timer.
 * @param {Function & { time?: number }} fn Callback to reschedule.
 * @param {number} ms Delay in milliseconds.
 * @returns {void}
 */
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

/**
 * Removes a scheduled timer callback.
 * @param {Function} fn Callback to clear.
 * @returns {void}
 */
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

/**
 * Executes pending timer callbacks.
 * @param {number} scheduled The scheduled tick deadline.
 * @returns {void}
 */
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

/**
 * Exposes timer state for debugging.
 * @returns {{ nextTimer: Function, nextTickTimer: NodeJS.Timeout|null }} Internal timer state.
 */
Q._debugTimer = function(){
	return {
		nextTimer,
		nextTickTimer
	}
}

/**
 * Applies an event-loop aware timeout.
 * @param {Promise<any> & { cancel?: Function }} promise Promise to guard.
 * @param {number} ms Timeout in milliseconds.
 * @param {string|symbol|undefined} [message=undefined] Optional timeout message.
 * @returns {QPromise<any> & { cancel: Function, extend: Function }} A timeout-aware promise.
 */
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

	promise.then(a => {
		clearTimer(largeTimeout)
		clearTimer(inchingTimeout)
		deferred.resolve(a)
	, ex=>{
		clearTimer(largeTimeout)
		clearTimer(inchingTimeout)
		deferred.reject(ex)
	}})

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

/**
 * Calls a warning handler when a promise runs for too long.
 * @param {Promise<any>} promise Promise to observe.
 * @param {number} ms Timeout in milliseconds.
 * @param {(error: Error) => boolean|number|Promise<boolean|number>} fn Warning callback.
 * @param {string|undefined} [message=undefined] Optional timeout message.
 * @returns {Promise<any>} The original promise result.
 */
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

/**
 * Rejects a deferred if it does not settle in time.
 * @param {{ reject: Function, promise: Promise<any> }} deferred Deferred to guard.
 * @param {number} ms Timeout in milliseconds.
 * @param {Error|symbol|undefined} [symbol=undefined] Error or symbol used for rejection.
 * @returns {Promise<any>} The deferred promise.
 */
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

/**
 * Invokes an object's Node-style method.
 * @param {Record<string, Function>} object Target object.
 * @param {string} method Method name.
 * @param {...any} args Arguments to pass to the method.
 * @returns {Promise<any>} A promise for the callback result.
 */
Q.ninvoke = async function (object, method, ...args) {
	return Q.nfcall(await object[method].bind(object), ...args)
}

/**
 * Invokes an object's method and resolves its return value.
 * @param {Record<string, Function>} object Target object.
 * @param {string} method Method name.
 * @param {...any} args Arguments to pass to the method.
 * @returns {Promise<any>} A promise for the method result.
 */
Q.finvoke = async function (object, method, ...args) {
	return Q.fcall(await object[method].bind(object), ...args)
}

/**
 * Resolves on the next process tick.
 * @returns {Promise<void>} A promise resolved on the next tick.
 */
Q.nextTick = function(){
	return new Promise(resolve=>{
		process.nextTick(resolve)
	})
}

/**
 * Placeholder for Q compatibility.
 * @returns {void}
 */
Q.resetUnhandledRejections = function () { }

/**
 * Waits for all values unless cancelled.
 * @param {Array<Promise<any> & { cancel?: Function }>} values Values to await.
 * @param {(fn: Function) => void} cancelFn Registers a cancel callback.
 * @returns {Promise<any[]>} A promise for all results.
 */
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

/**
 * Waits for all values and cancels the rest on failure.
 * @param {Array<Promise<any> & { cancel?: Function }>} values Values to await.
 * @returns {Promise<any[]> & { cancel?: Function }} A cancellable promise for all results.
 */
Q.safeAll = function(values){
	let cancel
	const ret = safeAll(values, c=>cancel=c)
	ret.cancel = cancel
	return ret
}

/**
 * Waits for all values, optionally enabling cancellation.
 * @param {Array<any>} values Values or promises to await.
 * @param {boolean} [cancel=true] Enables cancellation-aware behavior when `true`.
 * @returns {Promise<any[]>} A promise for all results.
 */
Q.all = function (values, cancel = true) {
	if(cancel){
		return Q.safeAll(values)	
	}
	return QPromise.all(values, cancel)
}

/**
 * Creates a rejected `QPromise`.
 * @param {any} reason Rejection reason.
 * @returns {QPromise<never>} A rejected promise.
 */
Q.reject = (reason) => QPromise.reject(reason)
/**
 * Creates a resolved `QPromise`.
 * @param {any} value Resolution value.
 * @returns {QPromise<any>} A resolved promise.
 */
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

/**
 * Checks whether a promise is pending.
 * @param {Promise<any>} promise Promise to inspect.
 * @returns {boolean} `true` when the promise is pending.
 */
Q.isPending = function (promise) {
	return _promiseState(promise) == 0
}

/**
 * Checks whether a promise is fulfilled.
 * @param {Promise<any>} promise Promise to inspect.
 * @returns {boolean} `true` when the promise is fulfilled.
 */
Q.isFulfilled = function (promise) {
	return _promiseState(promise) == 1
}

/**
 * Checks whether a promise is rejected.
 * @param {Promise<any>} promise Promise to inspect.
 * @returns {boolean} `true` when the promise is rejected.
 */
Q.isRejected = function (promise) {
	return _promiseState(promise) == 2
}

Q.CancellationError = CancellationError

/**
 * Prevents overlapping executions by sharing the active promise.
 * @param {Function} fn Function to run singularly.
 * @param {(fn: Function) => void} cancelFn Registers a cancel callback.
 * @param {Array<any>} args Arguments for the wrapped function.
 * @returns {Promise<any>} A promise for the function result.
 */
async function singularize(fn, cancelFn, args){
	const deferred = Q.defer()
	cancelFn(()=>{
		deferred.reject(new CancellationError())
	})

	const p = fn(...args)
	await Q.cancelledRace([p, deferred.promise])

	return await p
}

/**
 * Wraps a function so concurrent calls share the same in-flight promise.
 * @param {Function} fn Function to wrap.
 * @returns {Function} A singularized function.
 */
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


/**
 * Waits for either primary or secondary values, with cancellation support.
 * @param {(fn: Function) => void} cancelFn Registers a cancel callback.
 * @param {Array<Promise<any>>} primaryValues Primary promises to race.
 * @param {Array<Promise<any> & { resolve?: Function }>} secondaryValues Secondary promises to race and later resolve.
 * @returns {Promise<void>} A promise that settles when one input resolves or rejects.
 */
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

/**
 * Races primary and secondary promises with cancellation support.
 * @param {Array<Promise<any>>} primaryValues Primary promises to race.
 * @param {Array<Promise<any>>} secondaryValues Secondary promises to race.
 * @returns {Promise<void> & { cancel?: Function }} A cancellable promise for the race.
 */
Q.safeyAwait = function(primaryValues, secondaryValues) {
	let cancel
	const ret = safeyAwait(c=>cancel=c, primaryValues, secondaryValues)
	ret.cancel = cancel
	return ret
}

module.exports = Q