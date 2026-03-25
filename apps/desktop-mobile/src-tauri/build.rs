use std::env;
use std::fs;
use std::path::PathBuf;

fn main() {
    let target_os = env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    let target_env = env::var("CARGO_CFG_TARGET_ENV").unwrap_or_default();

    if target_os == "windows" && target_env == "gnu" {
        // Find the architecture (x86_64, i686)
        let _arch = env::var("CARGO_CFG_TARGET_ARCH").unwrap_or_default();
        
        // Use the DLL from the current directory (src-tauri)
        let dll_path = PathBuf::from("WebView2Loader.dll");
        
        if dll_path.exists() {
            // Target path is where the .exe is built
            let out_dir = env::var("OUT_DIR").unwrap();
            let mut target_path = PathBuf::from(out_dir);
            // OUT_DIR is typically .../target/debug/build/.../out
            // We want it in /target/debug next to the executable
            target_path.pop(); // .../build/...
            target_path.pop(); // .../build
            target_path.pop(); // .../target/debug
            
            let dest_path = target_path.join("WebView2Loader.dll");
            let _ = fs::copy(&dll_path, &dest_path);
            
            // Also copy to the next level up just in case (sometimes needed for bundling)
            let mut release_path = target_path.clone();
            release_path.pop(); // .../target
            // We don't know if it's debug or release, but we can try to guess or just use target_path
        }
    }

    tauri_build::build()
}
