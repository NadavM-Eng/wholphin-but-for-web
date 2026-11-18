/** A counting semaphore (kotlinx `Semaphore(n).withPermit`): at most `max` tasks run at once. */
export type Limiter = <T>(task: () => Promise<T>) => Promise<T>

export function createLimiter(max: number): Limiter {
  let running = 0
  const queue: (() => void)[] = []
  const next = () => {
    if (running >= max) return
    const start = queue.shift()
    if (start) {
      running++
      start()
    }
  }
  return <T>(task: () => Promise<T>) =>
    new Promise<T>((resolve, reject) => {
      queue.push(() => {
        task()
          .then(resolve, reject)
          .finally(() => {
            running--
            next()
          })
      })
      next()
    })
}

/** `items.map(fn)` with at most `max` calls in flight; results keep the input order. */
export async function mapLimited<A, B>(items: readonly A[], max: number, fn: (a: A) => Promise<B>): Promise<B[]> {
  const limit = createLimiter(max)
  return Promise.all(items.map((a) => limit(() => fn(a))))
}
