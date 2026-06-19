// Lets background API work (the bulk installed-mod metadata refresh, hover
// prefetch) defer to foreground work (the visible Browse/detail fetch) so it
// doesn't sit queued behind silent background calls on the shared
// rate-limited connection to modworkshop. Tracks recency of foreground
// activity rather than an in-flight counter, so a call site that forgets to
// report completion can't permanently starve background work — at worst it
// waits out one quiet window.
const QUIET_MS = 1500
const POLL_MS = 200

// -Infinity (rather than 0) so "never marked" can't collide with a real
// timestamp — tests that fake the clock to epoch 0 would otherwise read as
// "foreground just active" and hang waiting on a timer that never advances.
let lastForegroundAt = -Infinity

export function markForegroundActivity(): void {
    lastForegroundAt = Date.now()
}

export async function waitForForegroundClear(): Promise<void> {
    while (Date.now() - lastForegroundAt < QUIET_MS) {
        await new Promise<void>((resolve) => setTimeout(resolve, POLL_MS))
    }
}
