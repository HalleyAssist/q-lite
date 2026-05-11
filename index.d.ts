declare function Q<T = undefined>(value?: T | PromiseLike<T>): Q.QPromise<Awaited<T>>;

declare namespace Q {
  type Awaitable<T> = T | PromiseLike<T>;

  interface Cancelable {
    cancel?: () => void;
  }

  interface Extendable {
    extend?: (ms: number) => void;
  }

  interface Resolvable {
    resolve?: (value?: unknown) => void;
  }

  interface CancelablePromise<T> extends Promise<T>, Cancelable {}

  interface DeferredPromise<T> extends QPromise<T>, Cancelable, Extendable, Resolvable {}

  interface Deferred<T> {
    resolve: (value?: Awaitable<T>) => void;
    reject: (reason?: any) => void;
    promise: DeferredPromise<T>;
  }

  class QPromise<T> extends Promise<T> {
    constructor(
      executor: (
        resolve: (value?: Awaitable<T>) => void,
        reject: (reason?: any) => void,
      ) => void,
    );

    timeout(ms: number, message?: string | symbol): DeferredPromise<T>;
    delay(ms: number): QPromise<T>;
    fail<TResult = never>(fn: (reason: any) => TResult | PromiseLike<TResult>): QPromise<T | Awaited<TResult>>;
    done(onSuccess?: ((value: T) => any) | undefined, onReject?: ((reason: any) => any) | undefined): void;
    nodeify(fn?: ((error: any, result?: T) => void) | undefined): this | undefined;
    isPending(): boolean;
    isFulfilled(): boolean;
    isRejected(): boolean;
  }

  class CancellationError extends Error {
    code: 'ECANCEL';
    constructor(message?: string);
  }

  class CancellationState {
    cancelled: boolean;
    addOnCancel(fn: () => void): boolean;
    promiseWrap<T>(promise: PromiseLike<T> & Cancelable): Promise<T> & Cancelable;
    deferredWrap<T>(deferred: Deferred<T>): Deferred<T>;
    cancel(): void;
    checkCancel(message?: string): void;
  }

  const Promise: typeof QPromise;
  const CancellationError: typeof Q.CancellationError;
  const CancellationState: typeof Q.CancellationState;

  function canceller<Args extends unknown[], TResult>(
    fn: (state: CancellationState, ...args: Args) => TResult,
  ): (...args: Args) => TResult extends PromiseLike<infer T> ? (Promise<T> & Cancelable) : TResult;

  function defer<T = unknown>(): Deferred<T>;
  function delay(ms: number): DeferredPromise<void>;
  function safeRace<T>(contenders: Iterable<T | PromiseLike<T>>): Promise<Awaited<T>>;
  function cancelledRace<T>(promises: Array<(PromiseLike<T> & Cancelable) | T>, safeRace?: boolean): Promise<Awaited<T>>;
  function fcall<Args extends unknown[], TResult>(
    fn: (...args: Args) => TResult | PromiseLike<TResult>,
    ...args: Args
  ): QPromise<Awaited<TResult>>;
  function nfcall<Args extends unknown[], TResult>(
    fn: (...args: [...Args, (err: any, result: TResult) => void]) => void,
    ...args: Args
  ): QPromise<TResult>;
  function timeoutExact<T>(
    promise: PromiseLike<T> & Cancelable,
    ms: number,
    message?: string | symbol,
    overloadSafe?: boolean,
  ): DeferredPromise<T>;
  function _debugTimer(): {
    nextTimer: Function;
    nextTickTimer: NodeJS.Timeout | null;
  };
  function timeout<T>(promise: PromiseLike<T> & Cancelable, ms: number, message?: string | symbol): DeferredPromise<T>;
  function timewarn<T>(
    promise: PromiseLike<T>,
    ms: number,
    fn: (error: Error) => boolean | number | Promise<boolean | number>,
    message?: string,
  ): Promise<T>;
  function deferredTimeout<T>(deferred: Deferred<T>, ms: number, symbol?: Error | symbol): Promise<T>;
  function ninvoke<T = unknown>(object: Record<string, any>, method: string, ...args: any[]): Promise<T>;
  function finvoke<T = unknown>(object: Record<string, any>, method: string, ...args: any[]): Promise<T>;
  function nextTick(): Promise<void>;
  function resetUnhandledRejections(): void;
  function safeAll<T>(values: Array<(PromiseLike<T> & Cancelable) | T>): Promise<Awaited<T>[]> & Cancelable;
  function all<T>(values: Array<T | PromiseLike<T>>, cancel?: boolean): Promise<Awaited<T>[]>;
  function reject(reason?: any): QPromise<never>;
  function resolve<T>(value?: T | PromiseLike<T>): QPromise<Awaited<T>>;
  function isPending(promise: PromiseLike<unknown>): boolean;
  function isFulfilled(promise: PromiseLike<unknown>): boolean;
  function isRejected(promise: PromiseLike<unknown>): boolean;
  function singularize<Args extends unknown[], TResult>(
    fn: (...args: Args) => TResult | PromiseLike<TResult>,
  ): (...args: Args) => Promise<Awaited<TResult>> & Cancelable;
  function safeyAwait(
    primaryValues: Array<PromiseLike<any>>,
    secondaryValues: Array<PromiseLike<any>>,
  ): Promise<void> & Cancelable;
}

export = Q;
