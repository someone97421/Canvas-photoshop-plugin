#!/usr/bin/env node

import { createWriteStream } from 'fs';
import { readdir, stat, readFile, mkdir, unlink, copyFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import archiver from 'archiver';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function packagePSCCX() {
  try {
    // 获取脚本所在目录
    const scriptDir = __dirname;
    
    // 定义路径
    const pluginDir = join(scriptDir, '../packages/sdppp-photoshop/plugin');
    const staticDir = join(scriptDir, '../static');
    const zipPath = join(staticDir, 'sd-ppp2_PS.zip');
    const ccxPath = join(staticDir, 'sd-ppp2_PS.ccx');
    
    console.log('开始打包 Photoshop 插件...');
    console.log(`插件目录: ${pluginDir}`);
    console.log(`输出目录: ${staticDir}`);
    
    // 检查插件目录是否存在
    try {
      await stat(pluginDir);
    } catch (error) {
      throw new Error(`插件目录不存在: ${pluginDir}`);
    }
    
    // 创建输出目录（如果不存在）
    try {
      await stat(staticDir);
    } catch (error) {
      console.log(`创建输出目录: ${staticDir}`);
      await mkdir(staticDir, { recursive: true });
    }
    
    // 删除已存在的 .ccx 文件
    try {
      await stat(ccxPath);
      console.log('删除已存在的 .ccx 文件');
      await unlink(ccxPath);
    } catch (error) {
      // 文件不存在，继续
    }
    
    // 创建压缩文件
    const output = createWriteStream(zipPath);
    const archive = archiver('zip', {
      zlib: { level: 9 } // 设置压缩级别
    });
    
    // 监听压缩完成事件
    archive.pipe(output);
    
    const completed = new Promise((resolve, reject) => {
      output.on('close', resolve);
      output.on('error', reject);
      archive.on('error', reject);
    });
    
    // 添加插件目录的所有内容到压缩文件
    await addDirectoryToArchive(archive, pluginDir, '');
    
    // 完成压缩
    await archive.finalize();
    await completed;

    console.log(`压缩完成，文件大小: ${(archive.pointer() / 1024 / 1024).toFixed(2)} MB`);
    await copyFile(zipPath, ccxPath);
    await unlink(zipPath);
    console.log('复制完成: sd-ppp2_PS.zip -> sd-ppp2_PS.ccx');
    console.log('打包完成！');
    
  } catch (error) {
    console.error('打包失败:', error.message);
    process.exit(1);
  }
}

// 递归添加目录内容到压缩文件
async function addDirectoryToArchive(archive, dirPath, archivePath) {
  const items = await readdir(dirPath);
  
  for (const item of items) {
    const fullPath = join(dirPath, item);
    const itemStat = await stat(fullPath);
    const itemArchivePath = (archivePath ? join(archivePath, item) : item).replaceAll('\\', '/');
    
    if (itemStat.isDirectory()) {
      // 递归处理子目录
      await addDirectoryToArchive(archive, fullPath, itemArchivePath);
    } else {
      // 添加文件
      const fileContent = await readFile(fullPath);
      archive.append(fileContent, { name: itemArchivePath });
      console.log(`添加文件: ${itemArchivePath}`);
    }
  }
}

// 运行脚本
await packagePSCCX();
