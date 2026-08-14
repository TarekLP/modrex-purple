# pakviewer

Headless pak listing for the Modrex pak viewer. A self-contained .NET console app that
lists the assets inside a UE pak using [CUE4Parse](https://github.com/FabianFG/CUE4Parse)
(license: MIT — see the NuGet package for the full license text).

## Build

`pnpm build:pakviewer` (from `apps/desktop`) publishes a self-contained single file to
`pakviewer/dist/` for the host platform. The Tauri bundler globs that directory into the
app as a resource, and the Rust `list_pak_assets` command spawns it.

## Usage

```
pakviewer --pak <file> --game <pd3|cb> [--aes <key>] [--usmap <file>]
```

- `--game pd3` / `--game cb` both map to UE 4.27. Both games ship a baked-in default AES
  key; `--aes` overrides it (this is what a user-supplied Settings override uses).
- `--usmap` attaches a `.usmap` mapping file so asset exports resolve to readable class
  names.
- Exit codes: `0` = listing written to stdout as JSON (`[{path,size,class}]`), `1` =
  listing failed (reason on stderr), `2` = bad arguments.