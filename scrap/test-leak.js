const Q = require('../index'),
     {expect} = require('chai')


function getHeap(){
    global.gc()
    global.gc()
    const usage = process.memoryUsage();
    return usage.heapUsed
}

async function main(){

const deferred1 = Q.defer()
const deferred2 = Q.defer()

const beforeHeap = getHeap()

async function a(){
    await Q.safeRace([deferred1.promise, deferred2.promise])
}

for(let i = 0; i < 100000; i++){
    a()
}

const leakHeap = getHeap()
let diff = leakHeap - beforeHeap
console.log({beforeHeap, leakHeap, diff})

expect(diff > 1000000).to.be.true

deferred2.resolve()

await Q.delay(10)
await Q.delay(10)

const afterHeap = getHeap()
diff = afterHeap - beforeHeap
console.log({beforeHeap, afterHeap, diff})

expect(diff < 300000).to.be.true
}

main()