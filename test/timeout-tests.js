const chai = require('chai')
const { expect } = chai
const chaiAsPromised = require('chai-as-promised')
const Q = require('../index')

chai.use(chaiAsPromised)

describe('Q timeout tests', function () {
	it('should resolve with the original value before timing out', async function () {
		const deferred = Q.defer()
		const wrapped = Q.timeout(deferred.promise, 100)

		deferred.resolve('done')

		expect(await wrapped).to.equal('done')
	})

	it('should reject with ETIMEDOUT and the default message', async function () {
		const deferred = Q.defer()
		const wrapped = Q.timeout(deferred.promise, 60)

		try {
			await wrapped
			throw new Error('Expected promise to time out')
		} catch (ex) {
			expect(ex).to.be.instanceOf(Error)
			expect(ex.code).to.equal('ETIMEDOUT')
			expect(ex.message).to.equal('Timed out after 60 ms')
		}
	})

	it('should reject with a custom timeout message', async function () {
		const deferred = Q.defer()
		const wrapped = Q.timeout(deferred.promise, 60, 'custom timeout')

		try {
			await wrapped
			throw new Error('Expected promise to time out')
		} catch (ex) {
			expect(ex).to.be.instanceOf(Error)
			expect(ex.code).to.equal('ETIMEDOUT')
			expect(ex.message).to.equal('custom timeout')
		}
	})

	it('should reject with the provided symbol', async function () {
		const deferred = Q.defer()
		const timeoutSymbol = Symbol('timeout')
		const wrapped = Q.timeout(deferred.promise, 60, timeoutSymbol)

		try {
			await wrapped
			throw new Error('Expected promise to time out')
		} catch (ex) {
			expect(ex).to.equal(timeoutSymbol)
		}
	})

	it('should cancel the underlying promise when cancelled', async function () {
		let cancelled = false
		const inner = new Promise(() => {})
		inner.cancel = function () {
			cancelled = true
		}

		const wrapped = Q.timeout(inner, 100)
		wrapped.cancel()

		await expect(wrapped).to.eventually.be.rejectedWith(Q.CancellationError)
		expect(cancelled).to.equal(true)
	})

	it('should allow extending the timeout window', async function () {
		const deferred = Q.defer()
		const wrapped = Q.timeout(deferred.promise, 25)

		const resolver = (async () => {
			await Q.delay(10)
			wrapped.extend(50)
			await Q.delay(40)
			deferred.resolve('extended')
		})()

		expect(await wrapped).to.equal('extended')
		await resolver
	})
})