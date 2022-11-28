const chai = require('chai')
const {expect} = chai
const Q = require('../index')
var chaiAsPromised = require("chai-as-promised");

chai.use(chaiAsPromised);

describe('Q Singular tests', function(){
    it('should singularize', async() => {
        let i = 0
        const C = Q.singularize(async function(){
            await Q.delay(50)
            i++
            return i
        })

        const p1 = C()
        const p2 = C()

        await expect(p1).to.eventually.be.equal(1)
        await expect(p2).to.eventually.be.equal(1)

        const p3 = C()
        await expect(p3).to.eventually.be.equal(2)
    })
    it('should cancel master', async() => {
        let i = 0
        const C = Q.singularize(async function(){
            await Q.delay(50)
            i++
            return i
        })

        const p1 = C()
        const p2 = C()

        p1.cancel()

        await expect(p1).to.eventually.be.rejectedWith(Q.CancellationError)
        await expect(p2).to.eventually.be.rejectedWith(Q.CancellationError)


        const p3 = C()
        await expect(p3).to.eventually.be.equal(2)
    })
    it('should cancel secondary', async() => {
        let i = 0
        const C = Q.singularize(async function(){
            await Q.delay(50)
            i++
            return i
        })

        const p1 = C()
        const p2 = C()

        p2.cancel()

        await expect(p1).to.eventually.be.rejectedWith(Q.CancellationError)
        await expect(p2).to.eventually.be.rejectedWith(Q.CancellationError)


        const p3 = C()
        await expect(p3).to.eventually.be.equal(2)
    })
    it('should cancel canceller', async() => {
        let i = 0
        const C = Q.singularize(Q.canceller(async function(cancellationState){
            await cancellationState.promiseWrap(Q.delay(50))
            i++
            return i
        }))

        const p1 = C()
        const p2 = C()

        p2.cancel()

        await expect(p1).to.eventually.be.rejectedWith(Q.CancellationError)
        await expect(p2).to.eventually.be.rejectedWith(Q.CancellationError)


        const p3 = C()
        await expect(p3).to.eventually.be.equal(1)
    })
})