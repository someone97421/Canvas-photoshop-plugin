import { readFile, writeFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const hostPath = resolve(scriptDir, '../packages/sdppp-photoshop/plugin/sdppp/photoshop.html');
const marker = '<!-- canvas-host-customized-v3 -->';

const replacements = [
  {
    name: '顶部品牌点击入口',
    before: "'onClick':()=>{var _0x2c9ca9=_0x944c83;AboutDialogStore[_0x2c9ca9(0x1b53)]({'show':!0x0});},",
    after: "'style':{'cursor':'default'},",
  },
  {
    name: '顶部品牌名称',
    before: "'children':_0x592a45})",
    after: "'children':'这是一个画布'})",
  },
  {
    name: '制作人弹窗挂载',
    before: "jsxRuntimeExports['jsx'](AboutDialog,{}),",
    after: '',
  },
];

const main = "function Main(){var _0x285042=_0x4aa918;const _0x284b3d=reactExports['useRef'](null);return jsxRuntimeExports[_0x285042(0x1f31)](_0x285042(0x16bd),{'className':_0x285042(0x96d),'children':[jsxRuntimeExports[_0x285042(0x1f4f)](SDPPPProvider,{'contentWebviewRef':_0x284b3d,'children':jsxRuntimeExports[_0x285042(0x1f4f)](Header,{})}),jsxRuntimeExports[_0x285042(0x1f4f)](_0x285042(0x13ae),{'className':_0x285042(0x201e),'ref':_0x284b3d,'id':_0x285042(0x3df)}),jsxRuntimeExports[_0x285042(0x1f4f)](Footer,{})]});}";

export async function customizePhotoshopHost() {
  let html = await readFile(hostPath, 'utf8');
  if (html.includes(marker)) return;

  for (const replacement of replacements) {
    if (!html.includes(replacement.before)) {
      throw new Error(`无法应用 Photoshop 宿主定制：${replacement.name}`);
    }
    html = html.replace(replacement.before, replacement.after);
  }

  const aboutSection = /function About\(\)\{.*?\}const ComfyConnectDialogStore=/;
  if (aboutSection.test(html)) {
    html = html.replace(aboutSection, 'const ComfyConnectDialogStore=');
  } else if (html.includes('function About()') || html.includes('AboutDialogStore')) {
    throw new Error('无法应用 Photoshop 宿主定制：制作人页面及弹窗定义');
  }

  const mainSection = /function Main\(\)\{.*?\}sdpppX\[/;
  if (!mainSection.test(html)) {
    throw new Error('无法应用 Photoshop 宿主定制：主页面渲染');
  }
  html = html.replace(mainSection, `${main}sdpppX[`);

  html = html.replace('<head>', `<head>\n${marker}`);
  await writeFile(hostPath, html);
}
