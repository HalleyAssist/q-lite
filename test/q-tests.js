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
         it('should preserve stack (2)', async function(){
             async function testFn(){
                 const deferred = Q.defer()
                 async function a(){
                    await Q.delay(1)
                    throw new Error('test')
                 }
                 const promise = a()
                 
                 // will fail if this becomes awaited
                 // this is because the stack is not preserved

                 //await Q.delay(10)
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
         it('should preserve stack (3)', async function(){
             async function testFn(){
                 const deferred = Q.defer()
                 async function a(){
                    await Q.delay(1)
                    throw new Error('test')
                 }
                 const promise = a()
                 
                 // unlike test 2 this will work, because the stack is preserved, however if promise is never resolved then promise will leak
                 await Promise.race([Q.delay(10), promise])

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
          it('should preserve stack (4)', async function(){
              async function testFn(){
                  const deferred = Q.defer()
                  async function a(){
                     await Q.delay(1)
                     throw new Error('test')
                  }
                  const promise = a()

                  await Q.safeyAwait([Q.delay(10)], [promise])

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