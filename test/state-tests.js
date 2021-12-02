const {expect} = require('chai')
const Q = require('../index')

describe('Q state tests', function(){
    it('Pending Q promise should be pending', async() => {
        const qp = Q.defer()
        expect(Q.isPending(qp.promise)).be.true
    })
    it('Resolved Q promise should be resolved', async() => {
        const qp = Q.defer()
        qp.resolve(true)
        expect(Q.isFulfilled(qp.promise)).be.true
    })
    it('Rejected Q promise should be rejected', async() => {
        const qp = Q.defer()
        qp.promise.catch(() => {})
        qp.reject('a')
        expect(Q.isRejected(qp.promise)).be.true
    })
})