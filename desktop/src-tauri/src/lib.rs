use tauri::Manager;

/// Places the overlay window flush to the top edge, centered horizontally
/// on whatever monitor it currently occupies.
fn pin_to_top_center(window: &tauri::WebviewWindow) {
    let Ok(Some(monitor)) = window.current_monitor() else { return };
    let screen = monitor.size();
    let win = window.outer_size().unwrap_or_default();
    let x = screen.width.saturating_sub(win.width) / 2;
    let _ = window.set_position(tauri::PhysicalPosition::new(x, 0));
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                pin_to_top_center(&window);
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running lekuvo desktop");
}
