use std::fs;
use std::path::Path;

/// 读取文本文件内容
/// 返回文件内容字符串，如果文件不存在或无法读取则返回错误
#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    let path = Path::new(&path);
    if !path.exists() {
        return Err(format!("文件不存在: {}", path.display()));
    }
    fs::read_to_string(path).map_err(|e| format!("读取文件失败: {}", e))
}
