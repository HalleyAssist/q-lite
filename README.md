# q-lite
Lightweight implementation of Q.js for performance

## Methods

### Q.safetyAwait

Solves stack preservation when calling async functions without an await over async boundries

```
function testFn(){
    const deferred = Q.defer()
    async function a(){
        await Q.delay(1)
        throw new Error('test')
    }
    const promise = a()
    
    // will fail if this becomes awaited
    // this is because the stack is not preserved
    await Q.delay(10)

    const p = Q.cancelledRace([deferred.promise,promise])
    deferred.resolve()
    return await p
}
```

Stack would be lost (`testFn`) in this test over the `Q.delay` call. However with `Q.safetyAwait` method state can be preserved.

```
function testFn(){
    const deferred = Q.defer()
    async function a(){
        await Q.delay(1)
        throw new Error('test')
    }
    const promise = a()
    
    // will fail if this becomes awaited
    // this is because the stack is not preserved
    await Q.safetyAwait([Q.delay(10)], [promise])

    const p = Q.cancelledRace([deferred.promise,promise])
    deferred.resolve()
    return await p
}
```