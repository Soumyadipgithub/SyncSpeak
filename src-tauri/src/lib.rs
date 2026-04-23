use serde_json::Value;
use std::fs::OpenOptions;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::window::Color;
use tauri::{Emitter, Manager};
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

// Store sidecar child handle for cleanup
struct SidecarState {
    child: Mutex<Option<tauri_plugin_shell::process::CommandChild>>,
}

#[tauri::command]
async fn send_sidecar_command(
    state: tauri::State<'_, SidecarState>,
    cmd: String,
) -> Result<(), String> {
    let mut child_lock = state.child.lock().unwrap();
    if let Some(child) = child_lock.as_mut() {
        child
            .write(format!("{}\n", cmd).as_bytes())
            .map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Sidecar not running".to_string())
    }
}

#[tauri::command]
fn save_history_entry(
    app: tauri::AppHandle,
    session_id: String,
    hindi: String,
    english: String,
    timestamp: String,
) -> Result<(), String> {
    log::debug!("Saving history entry for session: {}", session_id);
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    let file_path = data_dir.join("history.jsonl");

    let entry = serde_json::json!({
        "session_id": session_id,
        "hindi": hindi,
        "english": english,
        "timestamp": timestamp
    });

    let json = serde_json::to_string(&entry).map_err(|e| e.to_string())?;

    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&file_path)
        .map_err(|e| e.to_string())?;

    writeln!(file, "{}", json).map_err(|e| e.to_string())?;
    log::debug!("Successfully wrote to {:?}", file_path);
    Ok(())
}

#[tauri::command]
fn get_history(app: tauri::AppHandle) -> Result<Vec<Value>, String> {
    log::debug!("Loading history...");
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let file_path = data_dir.join("history.jsonl");
    if !file_path.exists() {
        log::debug!("History file does not exist at {:?}", file_path);
        return Ok(vec![]);
    }

    let file = std::fs::File::open(file_path).map_err(|e| e.to_string())?;
    let reader = BufReader::new(file);
    let mut entries = vec![];

    for line in reader.lines() {
        if let Ok(l) = line {
            if let Ok(json) = serde_json::from_str::<Value>(&l) {
                entries.push(json);
            }
        }
    }
    entries.reverse(); // Latest first
    Ok(entries)
}

#[tauri::command]
fn clear_history(app: tauri::AppHandle) -> Result<(), String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let file_path = data_dir.join("history.jsonl");
    if file_path.exists() {
        std::fs::remove_file(file_path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn save_config(app: tauri::AppHandle, key: String, value: String) -> Result<(), String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    let file_path = data_dir.join("config.json");

    let mut config = if file_path.exists() {
        let file = std::fs::File::open(&file_path).map_err(|e| e.to_string())?;
        serde_json::from_reader(file).unwrap_or_else(|_| serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    config[key] = serde_json::json!(value);

    let file = std::fs::File::create(&file_path).map_err(|e| e.to_string())?;
    serde_json::to_writer_pretty(file, &config).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_config(app: tauri::AppHandle, key: String) -> Result<Option<String>, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let file_path = data_dir.join("config.json");
    if !file_path.exists() {
        return Ok(None);
    }

    let file = std::fs::File::open(file_path).map_err(|e| e.to_string())?;
    let config: Value = serde_json::from_reader(file).map_err(|e| e.to_string())?;

    Ok(config
        .get(key)
        .and_then(|v| v.as_str())
        .map(|s| s.to_string()))
}

fn find_venv_python() -> PathBuf {
    // Locate the venv Python interpreter. Tauri's working directory varies between
    // `npm run dev` (project root) and cargo direct invocation (src-tauri/), so we
    // check one level up if the venv isn't found at cwd.
    //
    // `Scripts\python.exe` is the Windows venv layout. On macOS/Linux it would be
    // `bin/python`. This project is Windows-only (VB-Cable + WASAPI dependency),
    // so we don't need a cross-platform path here.
    let mut venv_base = std::env::current_dir().unwrap();
    if !venv_base.join("venv").exists() {
        if let Some(parent) = venv_base.parent() {
            if parent.join("venv").exists() {
                venv_base = parent.to_path_buf();
            }
        }
    }
    venv_base.join("venv").join("Scripts").join("python.exe")
}

fn find_sidecar_script() -> PathBuf {
    let mut root = std::env::current_dir().unwrap();
    if !root.join("python").exists() {
        if let Some(parent) = root.parent() {
            if parent.join("python").exists() {
                root = parent.to_path_buf();
            }
        }
    }
    root.join("python").join("sidecar_main.py")
}

#[tauri::command]
async fn restart_sidecar(
    app: tauri::AppHandle,
    state: tauri::State<'_, SidecarState>,
) -> Result<(), String> {
    // 1. Kill the old child process
    {
        let mut child_lock = state.child.lock().unwrap();
        if let Some(child) = child_lock.take() {
            let _ = child.kill();
        }
    }

    // 2. Spawn a fresh sidecar (Script in Dev, Binary in Prod)
    let (mut rx, child) = if cfg!(debug_assertions) {
        app.shell()
            .command(find_venv_python().to_str().unwrap())
            .args([find_sidecar_script().to_str().unwrap()])
            .spawn()
            .map_err(|e| e.to_string())?
    } else {
        app.shell()
            .sidecar("syncspeaker-sidecar")
            .map_err(|e| e.to_string())?
            .spawn()
            .map_err(|e| e.to_string())?
    };

    // 3. Store the new child
    *state.child.lock().unwrap() = Some(child);

    // 4. Start the new listener loop
    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    let line_str = String::from_utf8_lossy(&line).to_string();
                    if let Ok(json) = serde_json::from_str::<Value>(&line_str) {
                        app_handle.emit("sidecar-event", json).unwrap();
                    } else {
                        app_handle.emit("sidecar-event", line_str).unwrap();
                    }
                }
                CommandEvent::Stderr(line) => {
                    let line_str = String::from_utf8_lossy(&line).to_string();
                    app_handle.emit("sidecar-error", line_str).unwrap();
                }
                CommandEvent::Error(err) => {
                    app_handle.emit("sidecar-error", err).unwrap();
                }
                CommandEvent::Terminated(payload) => {
                    app_handle.emit("sidecar-terminated", payload.code).unwrap();
                }
                _ => {}
            }
        }
    });

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_log::Builder::default().build())
        .manage(SidecarState {
            child: Mutex::new(None),
        })
        .setup(|app| {
            let app_handle = app.handle().clone();
            let state = app.state::<SidecarState>();

            // Spawn the Python audio engine sidecar.
            //
            // Dev  (debug_assertions=true):  run the script directly via venv Python —
            //   lets you edit sidecar_main.py and restart without a PyInstaller rebuild.
            //
            // Prod (debug_assertions=false): run the PyInstaller binary bundled in
            //   src-tauri/binaries/ — no Python installation required on end-user machines.
            let (mut rx, child) = if cfg!(debug_assertions) {
                app.shell()
                    .command(find_venv_python().to_str().unwrap())
                    .args([find_sidecar_script().to_str().unwrap()])
                    .spawn()
                    .expect("failed to spawn python engine")
            } else {
                app.shell()
                    .sidecar("syncspeaker-sidecar")
                    .unwrap()
                    .spawn()
                    .unwrap()
            };

            *state.child.lock().unwrap() = Some(child);

            tauri::async_runtime::spawn(async move {
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stdout(line) => {
                            let line_str = String::from_utf8_lossy(&line).to_string();
                            if let Ok(json) = serde_json::from_str::<Value>(&line_str) {
                                app_handle.emit("sidecar-event", json).unwrap();
                            } else {
                                app_handle.emit("sidecar-event", line_str).unwrap();
                            }
                        }
                        CommandEvent::Stderr(line) => {
                            let line_str = String::from_utf8_lossy(&line).to_string();
                            app_handle.emit("sidecar-error", line_str).unwrap();
                        }
                        CommandEvent::Error(err) => {
                            app_handle.emit("sidecar-error", err).unwrap();
                        }
                        CommandEvent::Terminated(payload) => {
                            app_handle.emit("sidecar-terminated", payload.code).unwrap();
                        }
                        _ => {}
                    }
                }
            });

            // Apply Windows Acrylic blur — the frosted-glass effect behind the transparent window.
            //
            // Tint RGBA (20, 20, 25, 10): near-black hue, near-zero opacity.
            //   A very subtle tint lets the OS blur engine do the heavy lifting;
            //   a higher alpha would paint over the blur and kill the glass look.
            //
            // Success path — set_background_color(0,0,0,0): fully transparent so the
            //   blur layer from Acrylic shows through without a competing solid fill.
            //
            // Fallback Color(18, 18, 24, 200): opaque dark-navy used on Windows builds
            //   that don't support Acrylic (Win10 without Fluent updates, VMs, RDP).
            //   Keeps the app usable without crashing.
            if let Some(window) = app.get_webview_window("main") {
                match window_vibrancy::apply_acrylic(&window, Some((20, 20, 25, 10))) {
                    Ok(_) => {
                        let _ = window.set_background_color(Some(Color(0, 0, 0, 0)));
                    }
                    Err(_) => {
                        let _ = window.set_background_color(Some(Color(18, 18, 24, 200)));
                    }
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            send_sidecar_command,
            restart_sidecar,
            save_history_entry,
            get_history,
            clear_history,
            save_config,
            get_config
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
