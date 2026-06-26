/**
 * Tauri command 封装
 * 提供类型安全的 Rust 后端调用
 */
import { invoke } from '@tauri-apps/api/core';

/**
 * 读取文本文件内容
 * @param path 文件绝对路径
 * @returns 文件内容字符串
 */
export async function readTextFile(path: string): Promise<string> {
  return invoke<string>('read_text_file', { path });
}
