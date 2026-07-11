mod commands;

use tauri::Manager;
use tauri_plugin_deep_link::DeepLinkExt;

fn route_deep_link(app: &tauri::AppHandle, url: &tauri::Url) {
    match url.scheme() {
        "modrex" => commands::nexus_oauth::spawn_handle_oauth_callback(app, url.to_string()),
        _ => commands::nxm::spawn_handle_nxm_url(app, url.to_string()),
    }
}

pub fn run() {
    std::panic::set_hook(Box::new(|panic_info| {
        log::error!("PANIC: {panic_info}");
    }));

    #[cfg(target_os = "linux")]
    // WebKit's DMA-BUF renderer breaks under XWayland and some Wayland compositors
    unsafe {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }

    let (discord_state, discord_rx) = commands::discord::DiscordState::new(true);

    let mut builder = tauri::Builder::default();
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            // Not argv itself, it can carry an nxm:// URL with a real download token.
            log::info!("second instance launched with {} arg(s)", argv.len());
            // A second launch is the user asking for the app, so surface the existing window.
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }));
    }

    let app = builder
        .manage(commands::updater::UpdaterState::new())
        .manage(discord_state)
        .register_uri_scheme_protocol("thumb", |ctx, request| {
            commands::thumbnails::handle_thumb_protocol(ctx.app_handle(), request)
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_deep_link::init())
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

            #[cfg(desktop)]
            {
                app.deep_link().register("nxm")?;
                app.deep_link().register("modrex")?;
            }

            let handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                for url in event.urls() {
                    route_deep_link(&handle, &url);
                }
            });

            // A link that launched this very process isn't replayed through
            // on_open_url on Windows/Linux, it only surfaces via get_current.
            if let Ok(Some(urls)) = app.deep_link().get_current() {
                for url in urls {
                    route_deep_link(app.handle(), &url);
                }
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
            // nexus (prototype)
            commands::nexus::nexus_search_mods,
            commands::nexus::nexus_get_download_link,
            commands::nexus_oauth::nexus_oauth_start,
            // discord
            commands::discord::set_discord_presence_enabled,
            commands::discord::update_discord_presence,
            // settings
            commands::settings::get_settings,
            commands::settings::get_game_settings,
            commands::settings::set_game_path,
            commands::settings::set_launcher,
            commands::settings::set_launch_options,
            commands::settings::set_crimeboss_install_mode,
            commands::settings::set_suppress_crash_reporter,
            commands::settings::set_skip_fileopenlog_warning,
            commands::settings::dismiss_deps_warning,
            commands::settings::get_analytics_consent,
            commands::settings::set_analytics_consent,
            commands::settings::set_nexus_api_key,
            commands::settings::clear_nexus_api_key,
            commands::settings::nexus_key_configured,
            commands::analytics::track_event,
            // mods
            commands::mods::get_installed,
            commands::mods::install_mod,
            commands::mods::install_file,
            commands::mods::install_from_zip_entry,
            commands::mods::install_cb_flat_archive,
            commands::mods::install_host_pack,
            commands::mods::delete_temp_file,
            commands::mods::uninstall_mod,
            commands::mods::enable_mod,
            commands::mods::disable_mod,
            commands::mods::move_crimeboss_mod_target,
            commands::mods::reorder_in_folder,
            commands::mods::move_to_folder,
            commands::mods::reorder_children,
            commands::mods::move_folder,
            commands::mods::create_folder,
            commands::mods::rename_folder,
            commands::mods::delete_folder,
            commands::mods::open_mods_folder,
            // superblt / pdth_overrides / dahm
            commands::superblt::check_superblt,
            commands::superblt::install_superblt,
            commands::superblt::is_pd2_diesel3,
            commands::pdth_overrides::check_pdth_overrides,
            commands::pdth_overrides::install_pdth_overrides,
            commands::dahm::check_dahm,
            commands::dahm::install_dahm,
            commands::ue4ss::check_ue4ss,
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
            // news
            commands::news::fetch_news,
            commands::news::refresh_news,
            commands::news::fetch_news_page,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    commands::settings::migrate_from_old_identifier(app.handle());
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

    {
        let discord_enabled = commands::settings::read_settings(app.handle())
            .discord_rich_presence_enabled
            .unwrap_or(true);
        let discord_state = app.state::<commands::discord::DiscordState>();
        discord_state
            .enabled
            .store(discord_enabled, std::sync::atomic::Ordering::Relaxed);
        commands::discord::start(std::sync::Arc::clone(&discord_state.enabled), discord_rx);
    }

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
