const Q = require('../index'),
     {expect} = require('chai')

describe('Q tests', function(){
    describe('safeRace', function(){
        it('should not leak on unresolved', async function(){
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

            function getHeap(){
                global.gc()
                const usage = process.memoryUsage();
                return usage.heapUsed
            }
            const ds = []

            const beforeHeap = getHeap()

            for(let i = 0; i < 100; i++){
                const deferred1 = Q.defer()
                const promise = randomString(10000)
        

                const c = rs()
                ds.push(deferred1)
                await Promise.race([deferred1.promise, promise, c])
            }
        
        
            await Q.delay(10)
            const afterLeakHeap = getHeap()

            expect(afterLeakHeap - beforeHeap > 1000000).to.be.true

            

            for(let i = 0; i < 100; i++){
                const deferred1 = Q.defer()
                const promise = randomString()

                const c = rs()
                ds.push(deferred1)
        
                await Q.safeRace([deferred1.promise, promise, c])
            }

            await Q.delay(10)
            const afterSafeHeap = getHeap()

            console.log({afterLeakHeap, afterSafeHeap, diff: afterSafeHeap - afterLeakHeap})

            expect(afterSafeHeap - afterLeakHeap < 1000000).to.be.true

            // this is required to prevent GC of ds
            expect(ds.length).to.be.eql(200)
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