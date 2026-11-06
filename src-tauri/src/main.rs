#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{ipc::Response, AppHandle, Manager, State, WebviewWindow};
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
async fn choose_model(
    app: AppHandle,
    source: State<'_, Source>,
    code: String,
) -> Result<String, String> {
    let svg: &[u8] = match code.as_str() {
        "0201" => include_bytes!("../../assets/models/0201.svg"),
        "0203" => include_bytes!("../../assets/models/0203.svg"),
        "0427" => include_bytes!("../../assets/models/0427.svg"),
        "0452" => include_bytes!("../../assets/models/0452.svg"),
        _ => return Err("Este modelo no está en el catálogo.".into()),
    };
    let name = format!("FEFCO-{code}.svg");
    let directory = app
        .path()
        .app_cache_dir()
        .map_err(|error| error.to_string())?
        .join("modelos");
    fs::create_dir_all(&directory)
        .map_err(|error| format!("No se pudo preparar el catálogo. {error}"))?;
    let path = directory.join(&name);
    if !path.exists() {
        fs::write(&path, svg).map_err(|error| format!("No se pudo preparar el modelo. {error}"))?;
    }
    *source.0.lock().map_err(|error| error.to_string())? = Some(path);
    Ok(name)
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

fn extension(path: &Path) -> Option<&str> {
    path.extension().and_then(|value| value.to_str())
}

#[tauri::command]
async fn save_result(
    window: WebviewWindow,
    app: AppHandle,
    source: State<'_, Source>,
    path: PathBuf,
) -> Result<Option<String>, String> {
    let original = selected_path(&source)?;
    let (format, suffix) = match extension(&path).map(str::to_ascii_lowercase).as_deref() {
        Some("svg") => ("SVG", "svg"),
        Some("blend") => ("Blender", "blend"),
        _ => return Err("El resultado debe ser un archivo .svg o .blend.".into()),
    };
    if !path.is_absolute() || !path.is_file() {
        return Err("El archivo generado ya no está disponible.".into());
    }

    let name = path.file_name().unwrap_or_default().to_string_lossy();
    let Some(file) = app
        .dialog()
        .file()
        .set_parent(&window)
        .set_title("Guardar como")
        .set_file_name(name.as_ref())
        .add_filter(format, &[suffix])
        .blocking_save_file()
    else {
        return Ok(None);
    };
    let destination = file.into_path().map_err(|error| error.to_string())?;
    if !extension(&destination).is_some_and(|value| value.eq_ignore_ascii_case(suffix)) {
        return Err(format!(
            "Usa la extensión .{suffix} para guardar el resultado."
        ));
    }

    if let Ok(existing) = fs::canonicalize(&destination) {
        if fs::canonicalize(original).is_ok_and(|original| original == existing) {
            return Err("Elige otro nombre o ubicación para conservar el SVG original.".into());
        }
        if fs::canonicalize(&path).is_ok_and(|generated| generated == existing) {
            return Ok(Some(name.into_owned()));
        }
    }
    fs::copy(path.as_path(), &destination)
        .map_err(|error| format!("No se pudo guardar el archivo. {error}"))?;
    Ok(Some(
        destination
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned(),
    ))
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(Source::default())
        .invoke_handler(tauri::generate_handler![
            choose_svg,
            choose_model,
            read_svg,
            open_svg,
            save_result
        ])
        .run(tauri::generate_context!())
        .expect("No se pudo iniciar Taller de cartón");
}
