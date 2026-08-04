#!/usr/bin/env bash
set -euo pipefail

TAG="${1:?usage: post-discord-release.sh <tag>}"

# Discord caps an embed description at 4096 characters and a whole message at
# 6000 across its embeds, which the release notes pass regularly. Separate
# messages each get their own budget, so the notes go out in full instead of
# truncated. The margin below absorbs the byte-vs-character difference.
CHUNK_LIMIT=3900

RELEASE=$(gh api "repos/$REPOSITORY/releases/tags/$TAG")
BODY=$(jq -r '.body // ""' <<<"$RELEASE")
URL=$(jq -r '.html_url' <<<"$RELEASE")

if [ -z "${BODY//[[:space:]]/}" ]; then
    echo "Release $TAG has no notes to post." >&2
    exit 1
fi

CHUNKS=()
current=''

flush() {
    if [ -n "$current" ]; then
        CHUNKS+=("$current")
    fi
    current=''
}

# Chunks are assembled from whole lines, never by cutting inside one, so a
# multibyte character cannot be split into invalid UTF-8.
while IFS= read -r line; do
    if [[ $line == '### '* ]]; then
        flush
        current="$line"
        continue
    fi
    candidate="$current"$'\n'"$line"
    if [ "${#candidate}" -gt "$CHUNK_LIMIT" ]; then
        flush
        current="$line"
        continue
    fi
    current="$candidate"
done <<<"$BODY"
flush

# Only the first message carries the title and release link; the rest read as
# continuations of it.
for i in "${!CHUNKS[@]}"; do
    if [ "$i" -eq 0 ]; then
        PAYLOAD=$(jq -n \
            --arg tag "$TAG" \
            --arg body "${CHUNKS[$i]}" \
            --arg url "$URL" \
            '{username:"Modrex",avatar_url:"https://github.com/modrexio.png",embeds:[{title:$tag,description:$body,url:$url,color:5814783}]}')
    else
        PAYLOAD=$(jq -n \
            --arg body "${CHUNKS[$i]}" \
            '{username:"Modrex",avatar_url:"https://github.com/modrexio.png",embeds:[{description:$body,color:5814783}]}')
    fi

    # Discord answers a rejected embed with 400 and a JSON body naming the
    # offending field. Without --fail-with-body curl exits 0, so the job reports
    # success while the release goes unannounced.
    curl --fail-with-body -sS \
        -H 'Content-Type: application/json' \
        -d "$PAYLOAD" \
        "$DISCORD_WEBHOOK"

    # Webhooks allow 5 requests per 2 seconds. One per second stays clear, and
    # waiting for each response keeps the messages in order.
    if [ "$i" -lt "$((${#CHUNKS[@]} - 1))" ]; then
        sleep 1
    fi
done
