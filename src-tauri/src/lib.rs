mod commands;

use tauri::Manager;

pub fn run() {
    #[cfg(target_os = "linux")]
    // WebKit's DMA-BUF renderer breaks under XWayland and some Wayland compositors
    unsafe {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }

    let app = tauri::Builder::default()
        .manage(commands::updater::UpdaterState::new())
        .register_uri_scheme_protocol("thumb", |ctx, request| {
            commands::thumbnails::handle_thumb_protocol(ctx.app_handle(), request)
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Warn)
                .level_for("modrex_lib", log::LevelFilter::Info)
                .max_file_size(5_000_000)
                .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepOne)
                .build(),
        )
        .setup(|app| {
            log::info!("Modrex started");
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // api
            commands::api::list_mods,
            commands::api::get_mod,
            commands::api::get_latest_file,
            commands::api::list_mod_files,
            commands::api::list_mod_links,
            commands::api::list_categories,
            commands::api::register_download,
            // settings
            commands::settings::get_settings,
            commands::settings::get_game_settings,
            commands::settings::set_game_path,
            commands::settings::set_launcher,
            commands::settings::set_launch_options,
            commands::settings::set_skip_fileopenlog_warning,
            commands::settings::dismiss_deps_warning,
            commands::settings::get_analytics_consent,
            commands::settings::set_analytics_consent,
            commands::analytics::track_event,
            // mods
            commands::mods::get_installed,
            commands::mods::install_mod,
            commands::mods::install_file,
            commands::mods::install_from_zip_entry,
            commands::mods::install_host_pack,
            commands::mods::delete_temp_file,
            commands::mods::uninstall_mod,
            commands::mods::enable_mod,
            commands::mods::disable_mod,
            commands::mods::reorder_in_folder,
            commands::mods::move_to_folder,
            commands::mods::reorder_children,
            commands::mods::move_folder,
            commands::mods::create_folder,
            commands::mods::rename_folder,
            commands::mods::delete_folder,
            commands::mods::open_mods_folder,
            // superblt / pdth_overrides
            commands::superblt::check_superblt,
            commands::superblt::install_superblt,
            commands::pdth_overrides::check_pdth_overrides,
            commands::pdth_overrides::install_pdth_overrides,
            // launchers & system
            commands::launchers::auto_detect_game,
            commands::launchers::installed_launchers,
            commands::launchers::identify_launcher,
            commands::launchers::configure_game_path,
            commands::launchers::pick_folder,
            commands::launchers::launch_game,
            commands::launchers::launch_without_mods,
            commands::launchers::restore_mods,
            commands::launchers::is_game_running,
            commands::launchers::stop_game,
            commands::launchers::shell_open_external,
            commands::launchers::shell_open_path,
            commands::launchers::open_log_file,
            // updater
            commands::updater::check_for_update,
            commands::updater::download_update,
            commands::updater::install_update,
            // thumbnails
            commands::thumbnails::get_thumbnail,
            // mod index
            commands::mod_index::get_index_mod_files,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    commands::settings::migrate_from_electron(app.handle());

    let games_configured = commands::settings::read_settings(app.handle())
        .games
        .as_ref()
        .map(|g| g.values().filter(|gs| gs.game_path.is_some()).count())
        .unwrap_or(0);
    commands::analytics::track(
        app.handle(),
        "app_started",
        serde_json::json!({ "games_configured": games_configured }),
    );

    let handle = app.handle().clone();
    tauri::async_runtime::spawn(commands::mod_index::ensure_index(handle));

    let handle = app.handle().clone();
    tauri::async_runtime::spawn(commands::thumbnails::cleanup_thumbnail_cache(handle));

    #[cfg(not(debug_assertions))]
    {
        let handle = app.handle().clone();
        tauri::async_runtime::spawn(async move {
            let _ = commands::updater::check_for_update(handle).await;
        });
    }

    app.run(|_, _| {});
}
