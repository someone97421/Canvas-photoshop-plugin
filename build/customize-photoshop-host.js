import { readFile, writeFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const hostPath = resolve(scriptDir, '../packages/sdppp-photoshop/plugin/sdppp/photoshop.html');
const marker = '<!-- canvas-host-customized-v10 -->';
const iconPreviousMarker = '<!-- canvas-host-customized-v9 -->';
const brandPreviousMarker = '<!-- canvas-host-customized-v8 -->';
const previousMarker = '<!-- canvas-host-customized-v7 -->';

const replacements = [
  {
    name: '顶部品牌点击入口',
    before: "'onClick':()=>{var _0x2c9ca9=_0x944c83;AboutDialogStore[_0x2c9ca9(0x1b53)]({'show':!0x0});},",
    after: "'style':{'cursor':'default'},",
  },
  {
    name: '顶部品牌名称',
    before: "'children':_0x592a45})",
    after: "'children':'逐帧加载 FrameLoading'})",
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

  if (html.includes(iconPreviousMarker)) {
    html = replaceHeaderIcon(html).replace(iconPreviousMarker, marker);
    await writeFile(hostPath, html);
    return;
  }

  if (html.includes(previousMarker) || html.includes(brandPreviousMarker)) {
    html = addSettingsButton(html)
      .replace("'children':'这是一个画布'})", "'children':'逐帧加载 FrameLoading'})")
      .replace(previousMarker, marker)
      .replace(brandPreviousMarker, marker);
    html = replaceHeaderIcon(html);
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
  html = replaceHeaderIcon(html);
  await writeFile(hostPath, html);
}

function replaceHeaderIcon(html) {
  const headerStart = html.indexOf('function Header(){');
  const headerEnd = html.indexOf('const sdkNode', headerStart);
  if (headerStart < 0 || headerEnd < 0) throw new Error('无法应用 Photoshop 宿主定制：品牌图标 Header');
  const header = html.slice(headerStart, headerEnd);
  const previousIcon = "jsxRuntimeExports[_0x944c83(0x1f4f)](_0x944c83(0x16f5),{'width':0x37,'src':_0x4b04bb==_0x944c83(0x243e)||_0x4b04bb=='kPanelBrightnessMediumGray'?_0x944c83(0x13c):_0x944c83(0x4ee),'alt':_0x944c83(0x10cd),'className':_0x944c83(0x1634)})";
  const brandIcon = "jsxRuntimeExports['jsx']('img',{'src':'../icons/frameloading-logo.png','alt':'逐帧加载 FrameLoading','width':28,'height':28,'style':{'width':'28px','height':'28px','objectFit':'contain','flexShrink':0}})";
  if (!header.includes(previousIcon)) throw new Error('无法应用 Photoshop 宿主定制：顶部品牌图标');
  return html.slice(0, headerStart) + header.replace(previousIcon, brandIcon) + html.slice(headerEnd);
}

function addSettingsButton(html) {
  const headerEnd = "})]})]});";
  const button = "jsxRuntimeExports['jsx']('button',{'id':'canvas-settings-button','title':'设置','aria-label':'设置','onClick':()=>mcpMesh['store']['setState']({'canvasSettingsOpenNonce':Date.now()}),'style':{'width':'52px','minWidth':'52px','height':'28px','minHeight':'28px','flexShrink':0x0,'boxSizing':'border-box','display':'flex','alignItems':'center','justifyContent':'center','textAlign':'center','whiteSpace':'nowrap','overflow':'visible','margin':'0 4px','padding':'0 8px','border':'0','borderRadius':'4px','backgroundColor':'#d9d9d9','color':'#262626','cursor':'pointer','fontSize':'12px','lineHeight':'28px'},'children':'设置'})";
  const headerStart = html.indexOf('function Header(){');
  const headerEndIndex = html.indexOf('const sdkNode', headerStart);
  if (headerStart < 0 || headerEndIndex < 0) throw new Error('无法应用 Photoshop 宿主定制：设置按钮 Header');
  const header = html.slice(headerStart, headerEndIndex);
  const buttonStart = header.indexOf("jsxRuntimeExports['jsx']('button',{'id':'canvas-settings-button'");
  if (buttonStart >= 0) {
    const buttonEnd = header.indexOf(headerEnd, buttonStart);
    if (buttonEnd < 0) throw new Error('无法应用 Photoshop 宿主定制：设置按钮结束位置');
    return html.slice(0, headerStart)
      + header.slice(0, buttonStart)
      + button
      + header.slice(buttonEnd + 2)
      + html.slice(headerEndIndex);
  }
  if (!header.includes(headerEnd)) throw new Error('无法应用 Photoshop 宿主定制：设置按钮位置');
  return html.slice(0, headerStart)
    + header.replace(headerEnd, `}),${button}]})]});`)
    + html.slice(headerEndIndex);
}
