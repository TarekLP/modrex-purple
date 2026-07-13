// Tao 0.35.3 clamps a fullscreen window to the taskbar work area when the
// window was previously maximized. During borderless fullscreen Tao removes
// the overlapped-window styles but retains WS_MAXIMIZE, so consuming
// WM_NCCALCSIZE only for that native signature preserves the proposed monitor
// rectangle without changing normal maximize behavior.

use std::io;

use tauri::WebviewWindow;

type SubclassProc =
    Option<unsafe extern "system" fn(isize, u32, usize, isize, usize, usize) -> isize>;

const GWL_STYLE: i32 = -16;
const WM_NCDESTROY: u32 = 0x0082;
const WM_NCCALCSIZE: u32 = 0x0083;
const WS_MAXIMIZE: u32 = 0x0100_0000;
const WS_OVERLAPPEDWINDOW: u32 = 0x00cf_0000;
const SUBCLASS_ID: usize = 0x4d4f_4452;

#[link(name = "comctl32")]
extern "system" {
    fn SetWindowSubclass(hwnd: isize, callback: SubclassProc, id: usize, data: usize) -> i32;
    fn RemoveWindowSubclass(hwnd: isize, callback: SubclassProc, id: usize) -> i32;
    fn DefSubclassProc(hwnd: isize, message: u32, wparam: usize, lparam: isize) -> isize;
}

#[link(name = "user32")]
extern "system" {
    fn GetWindowLongPtrW(hwnd: isize, index: i32) -> isize;
}

fn needs_client_rect_override(style: u32, has_params: bool) -> bool {
    has_params && style & WS_MAXIMIZE != 0 && style & WS_OVERLAPPEDWINDOW == 0
}

unsafe extern "system" fn window_subclass(
    hwnd: isize,
    message: u32,
    wparam: usize,
    lparam: isize,
    _id: usize,
    _data: usize,
) -> isize {
    if message == WM_NCCALCSIZE {
        let style = unsafe { GetWindowLongPtrW(hwnd, GWL_STYLE) } as u32;
        if needs_client_rect_override(style, wparam != 0) {
            return 0;
        }
    }

    if message == WM_NCDESTROY {
        unsafe {
            RemoveWindowSubclass(hwnd, Some(window_subclass), SUBCLASS_ID);
        }
    }

    unsafe { DefSubclassProc(hwnd, message, wparam, lparam) }
}

pub fn install(window: &WebviewWindow) -> Result<(), Box<dyn std::error::Error>> {
    let hwnd = window.hwnd()?.0 as isize;
    let installed = unsafe { SetWindowSubclass(hwnd, Some(window_subclass), SUBCLASS_ID, 0) };
    if installed == 0 {
        return Err(io::Error::other("SetWindowSubclass failed for the main window").into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn overrides_only_maximized_fullscreen_client_calculation() {
        assert!(needs_client_rect_override(WS_MAXIMIZE, true));
        assert!(!needs_client_rect_override(0, true));
        assert!(!needs_client_rect_override(
            WS_MAXIMIZE | WS_OVERLAPPEDWINDOW,
            true
        ));
        assert!(!needs_client_rect_override(WS_MAXIMIZE, false));
    }
}
