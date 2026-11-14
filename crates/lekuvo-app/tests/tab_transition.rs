//! Diagnostic: does the active-tab fill follow `tab` switches when the
//! animation clock is stepped like the live loop (16 ms + render)?

use std::path::Path;
use std::time::Duration;

use velqu_view::{DocumentSource, ReactiveValue, StylesheetSource, VelquView, Viewport};

const WIN_W: u32 = 760;
const WIN_H: u32 = 560;

fn sample(result: &velqu_view::FrameResult, x: u32, y: u32) -> String {
    match result.frame.pixel(x, y) {
        Some(color) => format!("{:02X}{:02X}{:02X}", color.r, color.g, color.b),
        None => "?".to_owned(),
    }
}

#[test]
fn tab_fill_follows_tab_switches_under_live_stepping() {
    let app_dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../app");
    let mut view = VelquView::new();
    view.enable_tailwind();
    view.enable_reactive();
    let html = std::fs::read_to_string(app_dir.join("index.html")).unwrap();
    view.load_document(DocumentSource::new("lekuvo", html)).unwrap();
    for name in ["01-notch.css", "theme-classic.css"] {
        let css = std::fs::read_to_string(app_dir.join(name)).unwrap();
        let id = name.trim_end_matches(".css");
        view.load_stylesheet(StylesheetSource::new(id, css)).unwrap();
    }
    let viewport = Viewport::try_new(WIN_W, WIN_H, 1.0).unwrap();

    // Expanded card, music tab.
    view.write_state("expanded", ReactiveValue::Bool(true)).unwrap();
    view.write_state("tab", ReactiveValue::String("music".to_owned())).unwrap();
    view.pump_reactive(&[]);
    for _ in 0..12 {
        view.step_animations_by(Duration::from_millis(50));
        let _ = view.render(viewport);
    }
    let music_fill = sample(&view.render(viewport).unwrap(), 160, 70);
    println!("music scene tab fill at (160,70): {music_fill}");

    // Switch to system, live-step.
    view.write_state("tab", ReactiveValue::String("system".to_owned())).unwrap();
    view.pump_reactive(&[]);
    for _ in 0..12 {
        view.step_animations_by(Duration::from_millis(50));
        let _ = view.render(viewport);
    }
    let system_fill_music_slot = sample(&view.render(viewport).unwrap(), 160, 70);
    println!("system scene music-slot fill: {system_fill_music_slot}");

    // Back to music, live-step.
    view.write_state("tab", ReactiveValue::String("music".to_owned())).unwrap();
    view.pump_reactive(&[]);
    for _ in 0..12 {
        view.step_animations_by(Duration::from_millis(50));
        let _ = view.render(viewport);
    }
    let back_fill = sample(&view.render(viewport).unwrap(), 160, 70);
    println!("back-to-music fill: {back_fill}");

    // The music tab must be filled while active (#9DB2FF) and track
    // colored (#414874-ish) otherwise.
    assert_eq!(music_fill, "9DB2FF", "music active fill");
    assert_ne!(system_fill_music_slot, "9DB2FF", "music tab must deactivate on system");
    assert_eq!(back_fill, "9DB2FF", "music tab must re-activate");
}
