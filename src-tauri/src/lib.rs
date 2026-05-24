mod commands;

pub fn run() {
    let app = tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            // api
            commands::api::list_mods,
            commands::api::get_mod,
            commands::api::get_latest_file,
            commands::api::list_mod_files,
            commands::api::list_categories,
            commands::api::register_download,
            // settings
            commands::settings::get_settings,
            commands::settings::set_game_path,
            commands::settings::set_launcher,
            commands::settings::set_launch_options,
            commands::settings::set_skip_fileopenlog_warning,
            commands::settings::dismiss_deps_warning,
            // mods
            commands::mods::get_installed,
            commands::mods::install_mod,
            commands::mods::install_file,
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
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    commands::settings::migrate_from_electron(app.handle());

    app.run(|_, _| {});
}
