const chai = require('chai')
const {expect} = chai
const Q = require('../index')
var chaiAsPromised = require("chai-as-promised");

chai.use(chaiAsPromised);

describe('Q Cancellation tests', function(){
    it('Cancellation check tets', async() => {
        const C = Q.canceller(async function(cancellationState){
            await Q.delay(50)
            cancellationState.checkCancel()
            return true
        })

        const p = C()
        p.cancel()
        await expect(p).to.eventually.rejectedWith(Q.CancellationError)
    })
    it('Cancellation check tets', async() => {
        const deferred = Q.defer()
        const C = Q.canceller(async function(cancellationState){
            const innerP = new Promise((resolve, reject) => {
                
            })
            innerP.cancel = function(){
                deferred.resolve(true)
            }
            cancellationState.promiseWrap(innerP)
            return await innerP
        })

        const p = C()
        p.cancel()
        await expect(deferred.promise).to.eventually.be.true
    })
    it('Canceller should call inner cancel', async() => {
        const deferred = Q.defer()
        const C = Q.canceller(function(cancellationState){
            const innerP = new Promise((resolve, reject) => {
                
            })
            innerP.cancel = function(){
                deferred.resolve(true)
            }
            return innerP
        })

        const p = C()
        p.cancel()
        await expect(deferred.promise).to.eventually.be.true
    })
    it("Q.all should cancel all other members but return own rejection", async function(){
        const deferreds = [Q.defer(), Q.defer()]
        let cancelCalled = 0
        deferreds[1].promise.cancel = function(){
            cancelCalled++
            deferreds[1].reject(new Error('cancelled'))
        }
        const allPromise = Q.all([deferreds[0].promise, deferreds[1].promise])
        allPromise.catch(()=>{})
        deferreds[0].reject("test")
        try {
            await allPromise
        } catch(ex){
            expect(ex).be.be.equal("test")
        }   
        expect(cancelCalled).to.be.equal(1)
    })
})