import {
  assemblyList,
  type Circuit,
  type Layout,
} from '@/lib/breadboard/model';
export async function svgPng(svg: SVGSVGElement) {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', '2400');
  clone.setAttribute('height', '824');
  clone.style.cssText = 'font-family:Arial,sans-serif;background:#eaf0ef';
  for (const halo of clone.querySelectorAll('.bb-part-halo')) {
    halo.setAttribute('fill', 'none');
    halo.setAttribute('stroke', 'none');
  }
  const text = new XMLSerializer().serializeToString(clone),
    url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(Error('Could not create PNG.'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = 2400;
    canvas.height = 824;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#eef1ed';
    ctx.fillRect(0, 0, 2400, 824);
    ctx.drawImage(img, 0, 0, 2400, 824);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}
export function downloadPng(url: string, name: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
}
export function guideHtml(c: Circuit, l: Layout, png: string) {
  const escape = (s: string) =>
      s.replace(
        /[&<>"']/g,
        (x) =>
          ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
          })[x]!,
      ),
    lines = assemblyList(c, l).split('\n');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>${escape(c.title)} — assembly guide</title><style>@page{size:A4 landscape;margin:8mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#183039;margin:0}header{display:flex;justify-content:space-between;align-items:center}h1{font-size:16pt;margin:0 0 3mm}small{font-size:9pt}img{display:block;width:100%;height:59mm;object-fit:contain;margin:1mm 0 3mm}ol{columns:2;column-gap:8mm;padding-left:5mm;margin:0;font-size:${lines.length > 45 ? '7.5' : '8.5'}pt;line-height:1.2}li{break-inside:avoid;margin:0 0 1mm}button{margin:10px;padding:10px;font:14px Arial}@media print{button{display:none}body{width:281mm}}@media screen{body{max-width:1120px;padding:24px;margin:auto;background:#fff}}</style><header><h1>${escape(c.title)}</h1><small>CIRCUIT FORGE · 830 holes · 2.54 mm</small></header><img alt="Breadboard assembly view" src="${png}"><ol>${lines
    .slice(1)
    .map((s) => `<li>${escape(s)}</li>`)
    .join(
      '',
    )}</ol><button onclick="window.print()">Print / Save as PDF</button></html>`;
}
