#[cfg(target_os = "windows")]
use std::sync::Mutex;
#[cfg(target_os = "windows")]
use std::time::{Duration, Instant};

use tauri::Manager;

#[cfg(target_os = "windows")]
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
#[cfg(target_os = "windows")]
use tauri_plugin_shell::ShellExt;

#[cfg(target_os = "windows")]
struct SidecarState(Mutex<Option<CommandChild>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let builder = tauri::Builder::default();

  #[cfg(target_os = "windows")]
  let builder = builder.plugin(tauri_plugin_shell::init());

  builder
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      #[cfg(target_os = "windows")]
      {
        if let Err(error) = start_sidecar(app) {
          log::error!("Could not start the Clipshed server: {error}");
          return Err(error);
        }

        let config = app
          .config()
          .app
          .windows
          .first()
          .cloned()
          .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::NotFound, "No window configuration"))?;
        let window = tauri::WebviewWindowBuilder::from_config(app.handle(), &config)?.build()?;
        window.show()?;
      }

      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|app_handle, event| {
      #[cfg(target_os = "windows")]
      if let tauri::RunEvent::Exit = event {
        if let Some(state) = app_handle.try_state::<SidecarState>() {
          if let Ok(mut guard) = state.0.lock() {
            if let Some(child) = guard.take() {
              let _ = child.kill();
            }
          }
        }
      }
    });
}

#[cfg(target_os = "windows")]
fn start_sidecar(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
  use std::path::PathBuf;

  let project_root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..");
  let debug = cfg!(debug_assertions);
  let resource_dir = if debug {
    project_root.clone()
  } else {
    app.path().resource_dir()?
  };

  let server_script = if debug {
    project_root.join("desktop/sidecar.cjs")
  } else {
    resource_dir.join("server/sidecar.cjs")
  };
  let ffmpeg_dir = if debug {
    project_root.join("bin")
  } else {
    resource_dir.join("bin")
  };
  let web_dist = if debug {
    project_root.join("web/dist")
  } else {
    resource_dir.join("web")
  };
  let qjs_path = ffmpeg_dir.join("qjs.exe");

  let local_app_data = std::env::var_os("LOCALAPPDATA")
    .map(PathBuf::from)
    .or_else(|| app.path().app_local_data_dir().ok())
    .ok_or_else(|| {
      std::io::Error::new(
        std::io::ErrorKind::NotFound,
        "LOCALAPPDATA is unavailable",
      )
    })?;
  let app_home = local_app_data.join("Clipshed");
  let data_dir = app_home.join("data");
  let bin_dir = app_home.join("bin");

  std::fs::create_dir_all(&data_dir)?;
  std::fs::create_dir_all(&bin_dir)?;

  let managed_ytdlp = bin_dir.join("yt-dlp.exe");
  let bundled_ytdlp = ffmpeg_dir.join("yt-dlp.exe");
  if !managed_ytdlp.exists() && bundled_ytdlp.exists() {
    std::fs::copy(&bundled_ytdlp, &managed_ytdlp)?;
  }

  for name in ["ffmpeg.exe", "ffprobe.exe", "qjs.exe"] {
    let _ = std::fs::remove_file(bin_dir.join(name));
  }

  let ffmpeg_path = ffmpeg_dir.join("ffmpeg.exe");
  let index_path = web_dist.join("index.html");
  for required in [&server_script, &ffmpeg_path, &managed_ytdlp, &qjs_path, &index_path] {
    if !required.exists() {
      log::warn!("Missing Clipshed runtime file: {}", required.display());
    }
  }

  let command = app
    .shell()
    .sidecar("node")?
    .arg(server_script.to_string_lossy().to_string())
    .env("CLIPSHED_ROOT", app_home.to_string_lossy().to_string())
    .env("DATA_DIR", data_dir.to_string_lossy().to_string())
    .env("BIN_DIR", bin_dir.to_string_lossy().to_string())
    .env("FFMPEG_DIR", ffmpeg_dir.to_string_lossy().to_string())
    .env("QJS_PATH", qjs_path.to_string_lossy().to_string())
    .env("WEB_DIST", web_dist.to_string_lossy().to_string())
    .env("CLIPSHED_VERSION", app.package_info().version.to_string())
    .env("HOST", "127.0.0.1")
    .env("PORT", "43123")
    .env("NODE_ENV", "production");

  let (mut rx, child) = command.spawn()?;
  app.manage(SidecarState(Mutex::new(Some(child))));

  tauri::async_runtime::spawn(async move {
    while let Some(event) = rx.recv().await {
      match event {
        CommandEvent::Stdout(line) => {
          log::info!("[clipshed-server] {}", String::from_utf8_lossy(&line).trim());
        }
        CommandEvent::Stderr(line) => {
          log::warn!("[clipshed-server] {}", String::from_utf8_lossy(&line).trim());
        }
        CommandEvent::Terminated(payload) => {
          log::warn!("[clipshed-server] exited: {:?}", payload.code);
        }
        _ => {}
      }
    }
  });

  let deadline = Instant::now() + Duration::from_secs(20);
  while Instant::now() < deadline {
    if std::net::TcpStream::connect_timeout(
      &"127.0.0.1:43123".parse()?,
      Duration::from_millis(300),
    )
    .is_ok()
    {
      return Ok(());
    }
    std::thread::sleep(Duration::from_millis(150));
  }

  Err(std::io::Error::new(
    std::io::ErrorKind::TimedOut,
    "Clipshed server did not start on 127.0.0.1:43123",
  )
  .into())
}
