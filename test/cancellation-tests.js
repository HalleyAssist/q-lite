const chai = require('chai')
const {expect} = chai
const Q = require('../index')
var chaiAsPromised = require("chai-as-promised");

chai.use(chaiAsPromised);

describe('Q cancellation tests', function(){
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
})