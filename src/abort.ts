/**
 * The deadline a tool's `exec.signal` carries, read where the work happens.
 *
 * `timeoutMs` on a tool is not a request for the host to interrupt the handler: the host's policy is a `tools/execute`
 * wrapper, so a synchronous call is over before a timer could fire. The contract says a tool declaring it asserts it
 * forwards `exec.signal` to a cooperative implementation that can reach quiescence. A search that checks the signal every
 * few thousand states is that implementation: it stops while the caller still gets a refusal, rather than finishing work
 * nobody is waiting for.
 */

export interface AbortLike {
  readonly aborted: boolean
}

/**
 * Stop the current call when its deadline has passed.
 * @param signal - the tool run's abort signal, when the host passed one.
 * @param where - what the caller was doing, for the message.
 */
export function checkAbort(signal: AbortLike | undefined, where: string): void {
  if (signal === undefined || !signal.aborted) return
  const error = new Error('the call ran out of time while ' + where + ', so it stops rather than finish work nobody is waiting for')
  ;(error as Error & { code: string }).code = 'TOOL_ABORTED'
  throw error
}
