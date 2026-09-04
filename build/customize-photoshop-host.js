import { readFile, writeFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const hostPath = resolve(scriptDir, '../packages/sdppp-photoshop/plugin/sdppp/photoshop.html');
const marker = '<!-- canvas-host-customized-v6 -->';
const previousMarker = '<!-- canvas-host-customized-v5 -->';

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

  if (html.includes(previousMarker)) {
    html = addSettingsButton(html).replace(previousMarker, marker);
    await writeFile(hostPath, html);
    return;
  }

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
  html = addSettingsButton(html);
  await writeFile(hostPath, html);
}

function addSettingsButton(html) {
  const headerEnd = "})]})]});";
  const legacyButton = "jsxRuntimeExports['jsx']('button',{'id':'canvas-settings-button','title':'设置','onClick':()=>window.dispatchEvent(new Event('canvas-settings-open')),'className':'w-5 h-full flex items-center justify-center cursor-pointer','children':'⚙'})";
  const icon = "jsxRuntimeExports['jsxs']('svg',{'width':0x10,'height':0x10,'viewBox':'0 0 24 24','fill':'none','stroke':'currentColor','strokeWidth':0x2,'strokeLinecap':'round','strokeLinejoin':'round','children':[jsxRuntimeExports['jsx']('path',{'d':'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z'}),jsxRuntimeExports['jsx']('circle',{'cx':0xc,'cy':0xc,'r':0x3})]})";
  const eventButton = `jsxRuntimeExports['jsx']('button',{'id':'canvas-settings-button','title':'设置','aria-label':'设置','onClick':()=>window.dispatchEvent(new Event('canvas-settings-open')),'style':{'width':'28px','height':'100%','display':'flex','alignItems':'center','justifyContent':'center','padding':'0','border':'0','background':'transparent','color':'var(--uxp-host-text-color)','cursor':'pointer'},'children':${icon}})`;
  const button = `jsxRuntimeExports['jsx']('button',{'id':'canvas-settings-button','title':'设置','aria-label':'设置','onClick':()=>mcpMesh['store']['setState']({'canvasSettingsOpenNonce':Date.now()}),'style':{'width':'28px','height':'100%','display':'flex','alignItems':'center','justifyContent':'center','padding':'0','border':'0','background':'transparent','color':'var(--uxp-host-text-color)','cursor':'pointer'},'children':${icon}})`;
  const headerStart = html.indexOf('function Header(){');
  const headerEndIndex = html.indexOf('const sdkNode', headerStart);
  if (headerStart < 0 || headerEndIndex < 0) throw new Error('无法应用 Photoshop 宿主定制：设置按钮 Header');
  const header = html.slice(headerStart, headerEndIndex);
  if (header.includes(legacyButton)) {
    return html.slice(0, headerStart)
      + header.replace(legacyButton, button)
      + html.slice(headerEndIndex);
  }
  if (header.includes(eventButton)) {
    return html.slice(0, headerStart)
      + header.replace(eventButton, button)
      + html.slice(headerEndIndex);
  }
  if (header.includes("'id':'canvas-settings-button'")) return html;
  if (!header.includes(headerEnd)) throw new Error('无法应用 Photoshop 宿主定制：设置按钮位置');
  return html.slice(0, headerStart)
    + header.replace(headerEnd, `}),${button}]})]});`)
    + html.slice(headerEndIndex);
}
