const Q = require('../index'),
     {expect} = require('chai')

describe('Q tests', function(){
    describe('safeRace', function(){
        it('should preserve stack', async function(){
            async function testFn(){
                const deferred = Q.defer()
                const promise = new Promise(function(_resolve, reject){
                    reject(new Error('test'))
                })
                const p = Q.safeRace([deferred.promise,promise])
                deferred.resolve()
                return await p
            }
            try {
                await testFn()
            } catch(ex){
                expect(ex.stack.toString()).to.contain('testFn')
            }
         })
    })
    describe('cancelledRace', function(){
        it('should preserve stack', async function(){
            async function testFn(){
                const deferred = Q.defer()
                const promise = new Promise(function(_resolve, reject){
                    reject(new Error('test'))
                })
                promise.catch(()=>{})
                await Q.delay(10)
                const p = Q.cancelledRace([deferred.promise,promise])
                deferred.resolve()
                return await p
            }
            try {
                await testFn()
            } catch(ex){
                expect(ex.stack.toString()).to.contain('testFn')
            }
         })
    })
})