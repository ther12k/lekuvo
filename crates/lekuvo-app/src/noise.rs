//! Ambient-sound generator + player.
//!
//! Each soundscape is a procedurally generated 16-bit mono WAV loop
//! (written once into the cache dir) played back by `paplay` inside a
//! self-restarting shell loop; toggling off kills the process group.

use std::path::PathBuf;
use std::process::Child;

pub const SOUNDS: [&str; 4] = ["rain", "waves", "fire", "wind"];

pub struct NoisePlayer {
    dir: PathBuf,
    loops: HashMap<String, Child>,
}

impl NoisePlayer {
    pub fn new() -> Self {
        let mut dir = std::env::var_os("XDG_CACHE_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from(std::env::var("HOME").unwrap_or_default()).join(".cache"));
        dir.push("lekuvo/noise");
        std::fs::create_dir_all(&dir).ok();
        for name in SOUNDS {
            let path = dir.join(format!("{name}.wav"));
            if !path.exists() {
                let samples = render(name);
                write_wav(&path, &samples);
            }
        }
        Self { dir, loops: HashMap::new() }
    }

    /// Toggles a sound; returns whether it is now playing.
    pub fn toggle(&mut self, name: &str) -> bool {
        if let Some(mut child) = self.loops.remove(name) {
            // Kill the sh wrapper and its paplay child.
            let _ = child.kill();
            let _ = child.wait();
            false
        } else {
            let file = self.dir.join(format!("{name}.wav"));
            let child = std::process::Command::new("sh")
                .arg("-c")
                .arg(format!("while true; do paplay --file='{}'; done", file.display()))
                .spawn()
                .ok();
            let playing = child.is_some();
            if let Some(child) = child {
                self.loops.insert(name.to_owned(), child);
            }
            playing
        }
    }
}

impl Drop for NoisePlayer {
    fn drop(&mut self) {
        for (_, mut child) in self.loops.drain() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

use std::collections::HashMap;

fn write_wav(path: &PathBuf, samples: &[i16]) {
    let data_len = samples.len() * 2;
    let mut bytes = Vec::with_capacity(44 + data_len);
    bytes.extend_from_slice(b"RIFF");
    bytes.extend_from_slice(&(36 + data_len as u32).to_le_bytes());
    bytes.extend_from_slice(b"WAVEfmt ");
    bytes.extend_from_slice(&16u32.to_le_bytes());
    bytes.extend_from_slice(&1u16.to_le_bytes()); // PCM
    bytes.extend_from_slice(&1u16.to_le_bytes()); // mono
    bytes.extend_from_slice(&44100u32.to_le_bytes());
    bytes.extend_from_slice(&88200u32.to_le_bytes()); // byte rate
    bytes.extend_from_slice(&2u16.to_le_bytes()); // block align
    bytes.extend_from_slice(&16u16.to_le_bytes()); // bits
    bytes.extend_from_slice(b"data");
    bytes.extend_from_slice(&(data_len as u32).to_le_bytes());
    for sample in samples {
        bytes.extend_from_slice(&sample.to_le_bytes());
    }
    std::fs::write(path, bytes).ok();
}

/// Two-second mono loops at 44100 Hz.
fn render(name: &str) -> Vec<i16> {
    const RATE: usize = 44100;
    const LEN: usize = RATE * 2;
    let mut samples = vec![0i16; LEN];
    let mut previous = 0f32;
    match name {
        // Rain: filtered white noise with occasional heavier drops.
        "rain" => {
            let mut seed = 1234u32;
            for sample in samples.iter_mut() {
                seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
                let white = (seed as f32 / u32::MAX as f32) * 2.0 - 1.0;
                previous = previous * 0.82 + white * 0.18; // soft lowpass
                let drop = if seed % 9973 < 25 { 1.6 } else { 1.0 };
                *sample = (previous * 0.5 * drop * i16::MAX as f32) as i16;
            }
        }
        // Waves: noise swells with a slow 2s tide cycle.
        "waves" => {
            let mut seed = 4242u32;
            for (index, sample) in samples.iter_mut().enumerate() {
                seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
                let white = (seed as f32 / u32::MAX as f32) * 2.0 - 1.0;
                previous = previous * 0.9 + white * 0.1;
                let tide = (index as f32 / RATE as f32 * std::f32::consts::PI).sin() * 0.5 + 0.5;
                *sample = (previous * (0.15 + tide * 0.55) * i16::MAX as f32) as i16;
            }
        }
        // Fire: brown noise bed with random crackle spikes.
        "fire" => {
            let mut seed = 777u32;
            for sample in samples.iter_mut() {
                seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
                let white = (seed as f32 / u32::MAX as f32) * 2.0 - 1.0;
                previous = (previous * 0.96 + white * 0.04).clamp(-0.9, 0.9);
                let crackle = if seed % 1499 < 9 { white * 0.8 } else { 0.0 };
                *sample = ((previous * 0.7 + crackle * 0.3) * i16::MAX as f32) as i16;
            }
        }
        // Wind: two averaged noise octaves with a slow gust LFO.
        _ => {
            let mut seed = 9511u32;
            let mut slow = 0f32;
            for (index, sample) in samples.iter_mut().enumerate() {
                seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
                let white = (seed as f32 / u32::MAX as f32) * 2.0 - 1.0;
                previous = previous * 0.97 + white * 0.03;
                slow = slow * 0.999 + previous * 0.001;
                let gust = (index as f32 / RATE as f32 * 2.0 * std::f32::consts::PI).sin() * 0.25 + 0.75;
                *sample = ((previous * 0.6 + slow.abs() * 0.2) * gust * i16::MAX as f32) as i16;
            }
        }
    }
    samples
}
