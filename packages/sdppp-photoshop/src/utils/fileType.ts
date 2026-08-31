export const isVideo = (url: string): boolean => {
  const videoExtensions = ['.mp4', '.webm', '.ogg', '.avi', '.mov', '.wmv', '.flv', '.mkv'];
  const urlLower = url.toLowerCase();
  const hasExt = (s: string) => videoExtensions.some(ext => s.endsWith(ext));

  // 支持 data:video/ 内联资源
  if (urlLower.startsWith('data:video/')) return true;

  // 若 query 中存在 filename=xxx，优先用其值判断后缀
  let filenameFromParam: string | null = null;
  const qIndex = urlLower.indexOf('?');
  if (qIndex >= 0) {
    const hashIndex = urlLower.indexOf('#', qIndex);
    const query = urlLower.slice(qIndex + 1, hashIndex >= 0 ? hashIndex : undefined);
    for (const part of query.split('&')) {
      if (!part) continue;
      const [rawKey, rawVal] = part.split('=');
      if (!rawKey) continue;
      const key = decodeURIComponent(rawKey);
      if (key === 'filename') {
        const val = rawVal ? decodeURIComponent(rawVal) : '';
        if (val) filenameFromParam = val.toLowerCase();
      }
    }
  }
  if (filenameFromParam && hasExt(filenameFromParam)) return true;

  // 再判断去掉 query 的路径后缀
  const pathWithoutQuery = qIndex >= 0 ? urlLower.slice(0, qIndex) : urlLower;
  if (hasExt(pathWithoutQuery)) return true;

  // 兼容旧逻辑：最后退回到 includes 检查
  return videoExtensions.some(ext => urlLower.includes(ext));
};

export const isImage = (url: string): boolean => {
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.tiff', '.tif'];
  const urlLower = url.toLowerCase();
  const checkExt = (s: string) => imageExtensions.some(ext => s.endsWith(ext));

  // 允许内联 base64 图片
  if (urlLower.startsWith('data:image/')) return true;

  // 如果包含 filename=xxx 的查询参数，优先用其值判断后缀
  let filenameFromParam: string | null = null;
  const qIndex = urlLower.indexOf('?');
  if (qIndex >= 0) {
    const hashIndex = urlLower.indexOf('#', qIndex);
    const query = urlLower.slice(qIndex + 1, hashIndex >= 0 ? hashIndex : undefined);
    for (const part of query.split('&')) {
      if (!part) continue;
      const [rawKey, rawVal] = part.split('=');
      if (!rawKey) continue;
      const key = decodeURIComponent(rawKey);
      if (key === 'filename') {
        const val = rawVal ? decodeURIComponent(rawVal) : '';
        if (val) filenameFromParam = val.toLowerCase();
      }
    }
  }
  if (filenameFromParam && checkExt(filenameFromParam)) return true;

  // 正常路径：先去掉 query 再判断后缀
  const pathWithoutQuery = qIndex >= 0 ? urlLower.slice(0, qIndex) : urlLower;
  if (checkExt(pathWithoutQuery)) return true;

  return false;
};
