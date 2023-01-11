const Q = require('../index'),
     {expect} = require('chai')

function getHeap(){
    global.gc()
    global.gc()
    const usage = process.memoryUsage();
    return usage.heapUsed
}
describe('Q tests', function(){
    describe('safeRace', function(){
        it('defer should not leak on unresolved', async function(){
            const deferred = Q.defer()

            async function a(){
                await deferred.promise
            }

            var beforeTestHeap = getHeap();
            for(let i = 0; i<100000; i++) {
                a()
            }
            var afterTestHeap = getHeap();

            console.log({beforeTestHeap, afterTestHeap, diff: afterTestHeap - beforeTestHeap})

            expect(afterTestHeap - beforeTestHeap > 2000000).to.be.true

            deferred.resolve(true)

            await Q.delay(20)

            const afterResolveHeap = getHeap()

            console.log({afterResolveHeap, beforeTestHeap, diff: afterResolveHeap - beforeTestHeap})
            expect(afterResolveHeap - beforeTestHeap < 300000).to.be.true
        })
    })

    describe('safeRace', function(){
        it('safeRace should not leak on unresolved', async function(){
            async function randomString(length) {
                let result = "";
                const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
                for (let i = 0; i < length; i++) {
                    result += characters.charAt(Math.floor(Math.random() * characters.length));
                }
                await Q.nextTick()
                return result;
            }

            function rs(length = 10000){
                let result = "";
                const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
                for (let i = 0; i < length; i++) {
                    result += characters.charAt(Math.floor(Math.random() * characters.length));
                }
                return result
            }

            let ds = [], dswarm = []

            const beforeHeap = getHeap()

            for(let i = 0; i < 100; i++){
                const deferred1 = Q.defer()
                const promise = randomString(10000)
        

                const c = rs()
                ds.push(deferred1)
                dswarm.push(dswarm)
                await Promise.race([deferred1.promise, promise, c])
            }
        
        
            await Q.delay(10)
            const afterLeakHeap = getHeap()

            expect(afterLeakHeap - beforeHeap > 1000000).to.be.true

            

            for(let i = 0; i < 200; i++){
                const deferred1 = Q.defer()
                const promise = randomString(10000)

                const c = rs()
                ds.push(deferred1)
        
                await Q.safeRace([deferred1.promise, promise, c])
            }

            await Q.delay(10)
            const afterSafeHeap = getHeap()

            console.log({afterLeakHeap, afterSafeHeap, diff: afterSafeHeap - afterLeakHeap})

            expect(afterSafeHeap - afterLeakHeap < 1000000).to.be.true

            // this is required to prevent GC of ds
            expect(ds.length)//.to.be.eql(300)

            ds = null

            
            const finalHeap = getHeap()

            console.log({finalHeap, afterLeakHeap, diff: finalHeap - afterLeakHeap})

            expect(finalHeap - afterLeakHeap < 100000).to.be.true
        })
        it('should return with the resolved value', async function(){
            async function testFn(){
                const deferred = Q.defer()
                const promise = new Promise(function(resolve){
                    resolve(1)
                })
                const p = Q.safeRace([deferred.promise,promise])
                deferred.resolve()
                expect(await p).to.be.eql(1)
            }
            await testFn()
         })
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
          
          it('should preserve stack (5)', async function(){
            async function testFn(){
                const deferred = Q.defer()
                async function a(){
                   await Q.delay(1)
                   throw new Error('test')
                }
                const promise = a()

                await Q.safeRace([Q.delay(10), promise])

                const p = Q.cancelledRace([deferred.promise, promise])
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
           
           it('should preserve stack (5)', async function(){
               async function testFn(){
                   const deferred = Q.defer()
                   async function a(){
                      await Q.delay(1)
                      throw new Error('test')
                   }
                   const promise = a()
 
                   await Q.cancelledRace([Q.delay(10), promise])
 
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