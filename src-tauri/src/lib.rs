mod commands;

pub fn run() {
    let app = tauri::Builder::default()
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    commands::settings::migrate_from_electron(app.handle());

    app.run(|_, _| {});
}
