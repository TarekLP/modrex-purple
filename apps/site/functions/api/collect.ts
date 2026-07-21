// Transparent passthrough to GA4's Measurement Protocol endpoint, used by the
// desktop app's opt-in analytics (modrex-main/src-tauri/src/commands/analytics.rs).
//
// The app already sends from its Rust backend instead of the webview so in-page
// ad blockers can't strip the request — but DNS-level and hosts-file blocklists
// (Pi-hole, AdGuard Home, NextDNS, "debloat Windows" scripts) and outbound
// firewalls block `google-analytics.com` for every process on a machine, not just
// browsers, and this audience runs that tooling heavily. Routing through
// modrex.net instead means the request only has to survive being blocked by
// name, not by Google's domain.
//
// This function otherwise doesn't know or care about GA4's event schema — it
// just forwards the query string and body verbatim — so it can never drift out
// of sync with whatever analytics.rs decides to send. The one exception is
// `ip_override` below: without it, GA4 geolocates every user as wherever this
// function's own outbound fetch egresses from (Cloudflare's network), not the
// real visitor — since the request Google actually sees comes from Cloudflare,
// not the desktop app's connection.
export async function onRequestPost({
    request,
    env,
    waitUntil,
}: {
    request: Request
    env: { MODREX_GA_MEASUREMENT_ID?: string }
    waitUntil: (promise: Promise<unknown>) => void
}): Promise<Response> {
    const incoming = new URL(request.url)
    const measurementId = incoming.searchParams.get('measurement_id')
    const apiSecret = incoming.searchParams.get('api_secret')
    if (!measurementId || !apiSecret) {
        return new Response('Missing measurement_id or api_secret', { status: 400 })
    }
    // Relay only to Modrex's own GA4 property so modrex.net can't be used as a generic,
    // unauthenticated relay into arbitrary GA4 accounts. The exact id is a build-time secret in
    // the desktop app (analytics.rs option_env MODREX_GA_MEASUREMENT_ID), so pin it here only
    // when that same value is set as a Pages env var; otherwise fall back to requiring a
    // well-formed GA4 id. measurement_id is not itself secret (it rides in every GA request).
    const expectedId = env.MODREX_GA_MEASUREMENT_ID
    const idAllowed = expectedId
        ? measurementId === expectedId
        : /^G-[A-Z0-9]{4,}$/.test(measurementId)
    if (!idAllowed) {
        return new Response('Unexpected measurement_id', { status: 403 })
    }

    const target = new URL('https://www.google-analytics.com/mp/collect')
    target.searchParams.set('measurement_id', measurementId)
    target.searchParams.set('api_secret', apiSecret)

    // Set by Cloudflare's edge itself from the real TCP connection — the client
    // can't spoof this by sending its own header, Cloudflare overwrites it.
    // Absent under local `wrangler pages dev` (no real edge involved); the
    // request still forwards, just without geo correction, same as before.
    const clientIp = request.headers.get('CF-Connecting-IP')
    let body = await request.text()
    if (clientIp) {
        try {
            const parsed = JSON.parse(body)
            parsed.ip_override = clientIp
            body = JSON.stringify(parsed)
        } catch {
            // Malformed JSON from the client — forward as-is; GA4 rejects it the
            // same way it would have without this function in the path.
        }
    }

    // Fire-and-forget: the desktop client never reads this response and GA4 returns nothing
    // useful, so there's no reason to make the client wait on Google's round trip. waitUntil
    // keeps the worker alive until the fetch settles after we've already returned 204.
    waitUntil(
        fetch(target, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': request.headers.get('User-Agent') ?? '',
            },
            body,
        }).catch(() => {
            // GA4 never returns error codes for malformed payloads and the client never reads
            // this response, so a failed upstream call has nothing to surface.
        })
    )

    return new Response(null, { status: 204 })
}
