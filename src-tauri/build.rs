fn main() {
    // `analytics.rs` bakes these in at compile time via `option_env!`. Cargo doesn't
    // track env vars read that way, so without these lines a cached build (CI uses
    // rust-cache) could ship stale/empty credentials. Declaring them forces a
    // recompile whenever the values change.
    println!("cargo:rerun-if-env-changed=MODREX_GA_MEASUREMENT_ID");
    println!("cargo:rerun-if-env-changed=MODREX_GA_API_SECRET");
    tauri_build::build()
}
