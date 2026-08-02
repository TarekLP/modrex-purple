fn main() {
    // analytics.rs bakes these in at compile time via option_env!. Cargo does not
    // track env vars read that way, so without these lines a cached build (CI uses
    // rust-cache) could ship stale/empty credentials. Declaring them forces a
    // recompile whenever the values change.
    println!("cargo:rerun-if-env-changed=MODREX_GA_MEASUREMENT_ID");
    println!("cargo:rerun-if-env-changed=MODREX_GA_API_SECRET");
    println!("cargo:rerun-if-env-changed=MODREX_ANALYTICS_ENDPOINT");

    // The bindings-export test links rfd's TaskDialogIndirect, imported from comctl32
    // by ordinal and present only in common-controls v6. The app exe gets v6 through
    // tauri-build's embedded manifest, but test binaries have none and would die at load
    // with STATUS_ORDINAL_NOT_FOUND, so embed the same dependency into them here.
    if std::env::var("CARGO_CFG_WINDOWS").is_ok() {
        println!("cargo:rustc-link-arg-tests=/MANIFEST:EMBED");
        println!(
            "cargo:rustc-link-arg-tests=/MANIFESTDEPENDENCY:type='win32' name='Microsoft.Windows.Common-Controls' version='6.0.0.0' publicKeyToken='6595b64144ccf1df' language='*' processorArchitecture='*'"
        );
    }

    tauri_build::build()
}
