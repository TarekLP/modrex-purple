## New language

**Language:** <!-- e.g. Ukrainian -->
**Locale code:** <!-- e.g. uk, de, pt-BR -->

<!-- If you're not a native/fluent speaker of this language, say so here. -->

## Checklist

- [ ] Added `apps/desktop/src/renderer/src/i18n/<code>.json` by copying `en.json` — no other file changed to register it
- [ ] Translated values only; keys are untouched and in the same order as `en.json`
- [ ] Every `{var}` token (e.g. `{name}`, `{count}`) is preserved exactly, just repositioned to read naturally
- [ ] Both halves of every singular/plural pair are translated (`modCount`/`modCountSingle`, `updatesAvailable`/`updatesAvailableSingle`, `installed`/`installedSingle`)
- [ ] `pnpm check-i18n` passes
- [ ] Checked the app in this language for obvious layout overflow (long strings breaking buttons, headers, or Settings rows)

<!-- A screenshot of a page or two in the new language is appreciated but not required. -->
