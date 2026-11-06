#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{fs, path::PathBuf, sync::Mutex};
use tauri::{ipc::Response, AppHandle, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

#[derive(Default)]
struct Source(Mutex<Option<PathBuf>>);

#[tauri::command]
async fn choose_svg(app: AppHandle, source: State<'_, Source>) -> Result<Option<String>, String> {
    let Some(file) = app
        .dialog()
        .file()
        .add_filter("SVG", &["svg"])
        .blocking_pick_file()
    else {
        return Ok(None);
    };
    let path = file.into_path().map_err(|error| error.to_string())?;
    if !path
        .extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| ext.eq_ignore_ascii_case("svg"))
        || !path.is_file()
    {
        return Err("Selecciona un archivo .svg.".into());
    }
    let name = path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .into_owned();
    *source.0.lock().map_err(|error| error.to_string())? = Some(path);
    Ok(Some(name))
}

fn selected_path(source: &Source) -> Result<PathBuf, String> {
    source
        .0
        .lock()
        .map_err(|error| error.to_string())?
        .clone()
        .ok_or_else(|| "Selecciona un archivo .svg.".into())
}

#[tauri::command]
async fn read_svg(source: State<'_, Source>) -> Result<Response, String> {
    let path = selected_path(&source)?;
    let bytes = fs::read(path).map_err(|error| format!("No se pudo leer el SVG. {error}"))?;
    Ok(Response::new(bytes))
}

#[tauri::command]
async fn open_svg(app: AppHandle, source: State<'_, Source>) -> Result<(), String> {
    let path = selected_path(&source)?;
    app.opener()
        .open_path(path.to_string_lossy().into_owned(), None::<&str>)
        .map_err(|error| format!("Windows no pudo abrir el SVG. {error}"))
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(Source::default())
        .invoke_handler(tauri::generate_handler![choose_svg, read_svg, open_svg])
        .run(tauri::generate_context!())
        .expect("No se pudo iniciar Taller de cartón");
}
