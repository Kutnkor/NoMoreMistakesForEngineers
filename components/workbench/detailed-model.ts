import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { HOLES } from '@/lib/breadboard/model';
import { megaCAD } from '@/lib/workbench/cad/mega-rev3e';
import { unoCAD } from '@/lib/workbench/cad/uno-rev3e';
import type { PhysicalModel } from '@/lib/workbench/physical';
import type { Instance } from '@/lib/workbench/types';
import { resistorBands, capacitorCode } from './draw';

const mats = new Map<string, T.MeshStandardMaterial>();
function mat(color: string, metalness = 0, roughness = 0.5) {
  const key = `${color}/${metalness}/${roughness}`;
  if (!mats.has(key))
    mats.set(key, new T.MeshStandardMaterial({ color, metalness, roughness }));
  return mats.get(key)!;
}
const metal = mat('#bdc7d1', 0.82, 0.28),
  black = mat('#171c23', 0.08, 0.46),
  gold = mat('#c1a35c', 0.75, 0.3);
function box(
  g: T.Group,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  m: T.Material,
  r = 0.1,
) {
  const mesh = new T.Mesh(
    new RoundedBoxGeometry(
      Math.max(w, 0.02),
      Math.max(h, 0.02),
      Math.max(d, 0.02),
      2,
      Math.min(r, w / 3, h / 3, d / 3),
    ),
    m,
  );
  mesh.position.set(x, y, z);
  mesh.userData.pickable = 'body';
  g.add(mesh);
  return mesh;
}
function cylinder(
  g: T.Group,
  x: number,
  y: number,
  z: number,
  r: number,
  h: number,
  m: T.Material,
  rTop = r,
) {
  const mesh = new T.Mesh(new T.CylinderGeometry(rTop, r, h, 24), m);
  mesh.position.set(x, y, z);
  mesh.userData.pickable = 'body';
  g.add(mesh);
  return mesh;
}
function lead(
  g: T.Group,
  points: T.Vector3[],
  radius = 0.22,
  m: T.Material = metal,
) {
  const curve = new T.CatmullRomCurve3(points);
  const mesh = new T.Mesh(new T.TubeGeometry(curve, 16, radius, 6, false), m);
  g.add(mesh);
  return mesh;
}
function shapeRect(w: number, h: number, r = 0.6) {
  const s = new T.Shape();
  s.moveTo(r, 0);
  s.lineTo(w - r, 0);
  s.quadraticCurveTo(w, 0, w, r);
  s.lineTo(w, h - r);
  s.quadraticCurveTo(w, h, w - r, h);
  s.lineTo(r, h);
  s.quadraticCurveTo(0, h, 0, h - r);
  s.lineTo(0, r);
  s.quadraticCurveTo(0, 0, r, 0);
  return s;
}
function circleHole(shape: T.Shape, x: number, y: number, r: number) {
  const hole = new T.Path();
  hole.absarc(x, y, r, 0, Math.PI * 2, true);
  shape.holes.push(hole);
}
function plate(
  g: T.Group,
  shape: T.Shape,
  top: number,
  depth: number,
  m: T.Material,
) {
  const geo = new T.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
    curveSegments: 12,
  });
  geo.rotateX(Math.PI / 2);
  const mesh = new T.Mesh(geo, m);
  mesh.position.y = top;
  mesh.userData.pickable = 'body';
  g.add(mesh);
  return mesh;
}
function marking(
  g: T.Group,
  text: string,
  x: number,
  z: number,
  y: number,
  width: number,
  height: number,
  color = '#e6ece6',
) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '500 48px monospace';
  ctx.fillText(text, 256, 64, 500);
  const texture = new T.CanvasTexture(c);
  texture.colorSpace = T.SRGBColorSpace;
  const material = new T.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
  });
  const mesh = new T.Mesh(new T.PlaneGeometry(width, height), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, y, z);
  mesh.userData.ownedMaterial = true;
  mesh.raycast = () => {};
  g.add(mesh);
}
function lamp(
  g: T.Group,
  x: number,
  y: number,
  z: number,
  color: string,
  r: number,
  kind = 'signal',
) {
  const m = new T.MeshStandardMaterial({
    color,
    roughness: 0.17,
    metalness: 0.05,
    emissive: color,
    emissiveIntensity: 0,
  });
  const mesh = cylinder(g, x, y, z, r, 0.7, m);
  mesh.userData.lamp = kind;
  mesh.userData.ownedMaterial = true;
  return mesh;
}
function socket(g: T.Group, x: number, z: number, top: number) {
  // Four walls leave an actual opening; contacts sit below the connection point.
  const outer = 1.22,
    inner = 0.55,
    wall = outer - inner;
  box(g, x - outer + wall / 2, top - 3.5, z, wall, 7, 2.44, black, 0.12);
  box(g, x + outer - wall / 2, top - 3.5, z, wall, 7, 2.44, black, 0.12);
  box(g, x, top - 3.5, z - outer + wall / 2, 1.1, 7, wall, black, 0.1);
  box(g, x, top - 3.5, z + outer - wall / 2, 1.1, 7, wall, black, 0.1);
  box(g, x, top - 1.5, z, 0.5, 0.15, 0.5, gold, 0.03);
}
function usb(
  g: T.Group,
  x: number,
  z: number,
  y: number,
  w: number,
  d: number,
  style: string,
) {
  const height = style === 'b' ? 10.8 : style === 'mini' ? 3.8 : 3;
  // Front faces the nearest x edge, with an open metal shell and plastic tongue.
  box(g, x, y + height - 0.25, z, w, 0.5, d, metal, 0.18);
  box(g, x, y + 0.25, z, w, 0.5, d, metal, 0.18);
  box(g, x, y + height / 2, z - d / 2 + 0.25, w, height, 0.5, metal, 0.18);
  box(g, x, y + height / 2, z + d / 2 - 0.25, w, height, 0.5, metal, 0.18);
  box(g, x + w / 2 - 0.2, y + height / 2, z, 0.4, height, d, metal);
  box(
    g,
    x + w * 0.15,
    y + height * 0.43,
    z,
    w * 0.6,
    height * 0.32,
    d * 0.58,
    mat('#182230'),
    0.15,
  );
  for (let k = 0; k < (style === 'b' ? 4 : 5); k++)
    box(
      g,
      x - w * 0.15,
      y + height * 0.61,
      z - d * 0.22 + k * d * 0.1,
      w * 0.46,
      0.13,
      0.25,
      gold,
      0.025,
    );
  for (const side of [-1, 1])
    box(
      g,
      x,
      y + height + 0.06,
      z + side * d * 0.26,
      w * 0.28,
      0.1,
      0.8,
      mat('#747e89', 0.8, 0.32),
    );
}
function barrel(
  g: T.Group,
  x: number,
  z: number,
  y: number,
  w: number,
  d: number,
) {
  box(g, x + 1, y + 4.6, z, w - 2, 9.2, d, black, 0.35);
  const ring = new T.Mesh(
    new T.TorusGeometry(d * 0.33, d * 0.15, 12, 32),
    black,
  );
  ring.rotation.y = Math.PI / 2;
  ring.position.set(x - w / 2, y + 4.8, z);
  g.add(ring);
  const core = cylinder(g, x - w / 2 + 0.2, y + 4.8, z, 1, 3, metal);
  core.rotation.z = Math.PI / 2;
  const cavity = cylinder(
    g,
    x - w / 2 + 1.8,
    y + 4.8,
    z,
    d * 0.32,
    0.1,
    mat('#030509'),
  );
  cavity.rotation.z = Math.PI / 2;
}
function chip(
  g: T.Group,
  x: number,
  z: number,
  y: number,
  w: number,
  d: number,
  label: string,
  height = 1.6,
  pads?: { x: number; y: number }[],
) {
  box(g, x, y + height / 2, z, w, height, d, black, 0.3);
  if (pads)
    for (const p of pads) {
      const px = Math.max(x - w / 2, Math.min(x + w / 2, p.x)),
        pz = Math.max(z - d / 2, Math.min(z + d / 2, p.y));
      lead(
        g,
        [
          new T.Vector3(px, y + height * 0.65, pz),
          new T.Vector3((px + p.x) / 2, y + 0.4, (pz + p.y) / 2),
          new T.Vector3(p.x, y + 0.12, p.y),
        ],
        w / d > 3 ? 0.22 : 0.12,
      );
    }
  else {
    const dip = w / d > 3;
    const count = dip ? 14 : Math.max(4, Math.min(16, Math.floor(w / 0.8)));
    for (const side of [-1, 1])
      for (let k = 0; k < count; k++) {
        const xx = x - w * 0.45 + (k * w * 0.9) / (count - 1);
        lead(
          g,
          [
            new T.Vector3(xx, y + height * 0.65, z + (side * d) / 2),
            new T.Vector3(xx, y + 0.35, z + side * (d / 2 + 0.55)),
            new T.Vector3(xx, y + 0.15, z + side * (d / 2 + 1)),
          ],
          dip ? 0.22 : 0.12,
        );
      }
    if (!dip)
      for (const side of [-1, 1])
        for (let k = 0; k < Math.max(4, Math.floor(d / 0.8)); k++) {
          const zz = z - d * 0.42 + k * 0.8;
          box(
            g,
            x + side * (w / 2 + 0.4),
            y + 0.23,
            zz,
            0.8,
            0.15,
            0.3,
            metal,
            0.03,
          );
        }
  }
  cylinder(
    g,
    x - w * 0.38,
    y + height + 0.015,
    z - d * 0.26,
    0.35,
    0.025,
    mat('#555b5c'),
  );
  marking(
    g,
    label,
    x,
    z,
    y + height + 0.03,
    w * 0.84,
    Math.min(d * 0.6, 2.2),
    '#a3a9ab',
  );
}
function can(
  g: T.Group,
  x: number,
  z: number,
  y: number,
  d: number,
  height: number,
) {
  cylinder(g, x, y + height / 2, z, d / 2, height, mat('#273442', 0.3, 0.3));
  cylinder(g, x, y + height, z, d * 0.47, 0.12, metal);
  for (const angle of [-Math.PI / 4, Math.PI / 4]) {
    const slit = box(
      g,
      x,
      y + height + 0.09,
      z,
      d * 0.7,
      0.04,
      0.12,
      mat('#69717a'),
      0.01,
    );
    slit.rotation.y = angle;
  }
  marking(
    g,
    '− − −',
    x + d * 0.34,
    z,
    y + height + 0.15,
    0.8,
    d * 0.65,
    '#e5e7df',
  );
}
function pcbArtwork(
  g: T.Group,
  model: PhysicalModel,
  shape: T.Shape,
  cad: typeof unoCAD | typeof megaCAD,
) {
  const { w, h, t } = model.body;
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = Math.round((2048 * h) / w);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(canvas.width / w, canvas.height / h);
  ctx.fillStyle = model.body.color;
  ctx.fillRect(0, 0, w, h);
  // Official planar copper is subtle under solder mask, not imaginary signal wiring.
  ctx.strokeStyle = '#13898b';
  ctx.lineCap = 'round';
  for (const [x1, y1, x2, y2, width] of cad.traces) {
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  ctx.strokeStyle = '#e1ede5';
  for (const [x1, y1, x2, y2, width] of cad.silk) {
    ctx.lineWidth = Math.max(0.07, width);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  ctx.fillStyle = '#e8eee7';
  for (const p of model.pins) {
    ctx.save();
    ctx.translate(p.x, p.y < 10 ? p.y + 3 : p.y - 3);
    ctx.rotate(-Math.PI / 2);
    ctx.font = '0.9px monospace';
    ctx.fillText(p.label, 0, 0);
    ctx.restore();
  }
  for (const text of cad.texts) {
    ctx.save();
    ctx.translate(text.x, text.y);
    ctx.rotate((-text.angle * Math.PI) / 180);
    ctx.font = `${text.size}px sans-serif`;
    ctx.fillText(text.text, 0, 0);
    ctx.restore();
  }
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 8;
  const material = new T.MeshStandardMaterial({
    map: texture,
    roughness: 0.43,
    metalness: 0.15,
    side: T.DoubleSide,
  });
  const geometry = new T.ShapeGeometry(shape, 12),
    position = geometry.getAttribute('position'),
    uv = geometry.getAttribute('uv');
  for (let i = 0; i < position.count; i++)
    uv.setXY(i, position.getX(i) / w, 1 - position.getY(i) / h);
  geometry.rotateX(Math.PI / 2);
  const surface = new T.Mesh(geometry, material);
  surface.position.y = t + 0.02;
  surface.userData.ownedMaterial = true;
  surface.userData.pickable = 'body';
  g.add(surface);
}
function uno(g: T.Group, model: PhysicalModel) {
  const cad = model.id === 'mega-2560' ? megaCAD : unoCAD;
  const shape = new T.Shape(cad.outline.map((p) => new T.Vector2(p[0], p[1])));
  for (const h of cad.mounts) circleHole(shape, h.x, h.y, h.d / 2);
  plate(g, shape, model.body.t, model.body.t, mat('#087c80', 0.12, 0.44));
  pcbArtwork(g, model, shape, cad);
  const y = model.body.t;
  for (const p of cad.pads) {
    if (p.drill) {
      const rim = new T.Mesh(
        new T.RingGeometry(
          p.drill / 2,
          Math.max(p.w / 2, p.drill / 2 + 0.1),
          14,
        ),
        gold,
      );
      rim.rotation.x = -Math.PI / 2;
      rim.position.set(p.x, y + 0.05, p.y);
      g.add(rim);
    } else box(g, p.x, y + 0.06, p.y, p.w, 0.12, p.h, metal, 0.04);
  }
  for (const e of cad.elements) {
    const x = e.x + e.w / 2,
      z = e.y + e.h / 2;
    if (e.kind === 'header') {
      if (
        [
          'POWER',
          'AD',
          'IOH',
          'IOL',
          'PWML',
          'ADCL',
          'ADCH',
          'COMMUNICATION',
          'JP6',
          'XIO',
        ].includes(e.name)
      )
        continue;
      box(g, x, y + 1.2, z, e.w, 2.4, e.h, black);
      for (const p of e.pads)
        box(g, p.x, y + 4, p.y, 0.64, 5.8, 0.64, gold, 0.05);
    } else if (e.kind === 'usb') usb(g, x, z, y, e.w, e.h, 'b');
    else if (e.kind === 'barrel') barrel(g, x, z, y, e.w, e.h);
    else if (e.kind === 'ic')
      chip(g, x, z, y, e.w, e.h, e.value, e.height, e.pads);
    else if (e.kind === 'can') can(g, x, z, y, 6.3, e.height);
    else if (e.kind === 'led') {
      box(g, x, y + 0.35, z, e.w, 0.7, e.h, mat('#d3d1b2'));
      lamp(
        g,
        x,
        y + 0.75,
        z,
        e.name === 'ON' ? '#79e74c' : '#ffad32',
        0.48,
        e.name === 'ON' ? 'power' : e.name === 'L' ? 'signal' : 'inactive',
      );
      marking(g, e.name, x + 2, z, y + 0.03, 2, 1);
    } else if (e.kind === 'button') {
      box(g, x, y + 0.8, z, e.w, 1.6, e.h, metal);
      cylinder(g, x, y + 2, z, 1.5, 1.5, mat('#f2ede3'));
    } else if (e.kind === 'crystal') {
      box(g, x, y + 0.8, z, e.w, 1.6, e.h, metal, 0.4);
      marking(g, '16.000', x, z, y + 1.65, e.w * 0.8, 0.9, '#36404a');
    } else
      box(
        g,
        x,
        y + e.height / 2,
        z,
        Math.max(0.5, e.w * 0.7),
        e.height,
        Math.max(0.5, e.h * 0.7),
        mat(
          e.name.startsWith('C')
            ? '#a88a5c'
            : e.name === 'F1'
              ? '#bba745'
              : '#232833',
        ),
      );
  }
}
function breadboard(g: T.Group, m: PhysicalModel) {
  const { w, h, t } = m.body;
  const plastic = mat('#f0f1ed', 0.02, 0.55);
  box(g, w / 2, (t - 1.2) / 2, h / 2, w, t - 1.2, h, plastic, 1.4);
  const top = shapeRect(w, h, 1.4);
  for (const p of HOLES) {
    const hole = new T.Path();
    hole.moveTo(p.x - 0.6, p.y - 0.6);
    hole.lineTo(p.x - 0.6, p.y + 0.6);
    hole.lineTo(p.x + 0.6, p.y + 0.6);
    hole.lineTo(p.x + 0.6, p.y - 0.6);
    hole.closePath();
    top.holes.push(hole);
  }
  const channel = new T.Path();
  channel.moveTo(4, 24.6);
  channel.lineTo(4, 29);
  channel.lineTo(w - 4, 29);
  channel.lineTo(w - 4, 24.6);
  channel.closePath();
  top.holes.push(channel);
  plate(g, top, t, 1.2, plastic);
  const contacts = new T.InstancedMesh(
    new T.BoxGeometry(0.65, 0.14, 0.82),
    mat('#706b5c', 0.65, 0.4),
    HOLES.length,
  );
  const matrix = new T.Matrix4();
  HOLES.forEach((p, i) => {
    matrix.makeTranslation(p.x, t - 1.1, p.y);
    contacts.setMatrixAt(i, matrix);
  });
  g.add(contacts);
  for (const row of ['T+', 'T-', 'B+', 'B-']) {
    const ps = HOLES.filter((p) => p.row === row);
    for (const half of [ps.slice(0, 25), ps.slice(25)]) {
      const a = half[0],
        b = half[half.length - 1];
      box(
        g,
        (a.x + b.x) / 2,
        t + 0.03,
        a.y + (row.endsWith('+') ? -1.7 : 1.7),
        b.x - a.x + 2.5,
        0.06,
        0.24,
        mat(row.endsWith('+') ? '#d85459' : '#3585b9'),
        0.02,
      );
    }
  }
  for (const row of 'ABCDEFGHIJ') {
    const p = HOLES.find((p) => p.row === row);
    if (p) {
      marking(g, row, 3.4, p.y, t + 0.035, 1.8, 1.3, '#65717a');
      marking(g, row, w - 3, p.y, t + 0.035, 1.8, 1.3, '#65717a');
    }
  }
  for (let col = 1; col <= 63; col++)
    if (col === 1 || col % 5 === 0) {
      const p = HOLES.find((p) => p.id === `${col}-A`);
      if (p)
        for (const z of [11, 43.3])
          marking(g, String(col), p.x, z, t + 0.035, 2, 1.2, '#65717a');
    }
  for (const z of [9.8, 43.8])
    box(g, w / 2, t - 0.2, z, w - 3, 0.5, 0.25, mat('#d0d6d4'), 0.02);
  // Molded tongue/groove edges and base seam.
  for (const x of [w * 0.18, w * 0.5, w * 0.82])
    for (const z of [-0.5, h + 0.5])
      box(g, x, t / 2, z, 5, 2.2, 1.5, plastic, 0.3);
}
function part(g: T.Group, m: PhysicalModel, i: Instance) {
  const { w, h, t, color } = m.body,
    x = w / 2,
    z = h / 2;
  for (const p of m.pins)
    lead(g, [
      new T.Vector3(x, Math.max(1, t / 2), z),
      new T.Vector3(p.x, 0.7, p.y),
      new T.Vector3(p.x, p.z, p.y),
    ]);
  if (m.id === 'part-resistor') {
    const body = cylinder(g, x, 1.6, z, 1.3, w * 0.56, mat('#d4bd92'));
    body.rotation.z = Math.PI / 2;
    resistorBands(i.value ?? 10000, i.tolerance ?? 0.05).forEach((c, k) => {
      const b = cylinder(
        g,
        w * 0.3 + k * w * 0.12,
        1.6,
        z,
        1.315,
        w * 0.055,
        mat(c),
      );
      b.rotation.z = Math.PI / 2;
    });
  } else if (m.id === 'part-led') {
    const material = new T.MeshPhysicalMaterial({
      color: '#d83028',
      roughness: 0.15,
      transparent: true,
      opacity: 0.78,
      clearcoat: 1,
      emissive: '#ff3218',
      emissiveIntensity: 0,
    });
    const base = cylinder(g, x, 2, z, 2.75, 0.7, material);
    base.userData.ownedMaterial = true;
    const barrel = cylinder(g, x, 3, z, 2.5, 2, material);
    barrel.userData.lamp = 'signal';
    const dome = new T.Mesh(
      new T.SphereGeometry(2.5, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
      material,
    );
    dome.position.set(x, 4, z);
    dome.userData.lamp = 'signal';
    dome.userData.pickable = 'body';
    g.add(dome);
    box(g, x - 0.55, 3, z, 0.8, 2.4, 0.7, metal);
    box(g, x + 0.5, 2.8, z, 0.25, 2, 0.3, metal);
  } else if (m.id.includes('capacitor')) {
    if (m.id.includes('electrolytic'))
      can(g, x, z, 0.6, Math.min(w, h), Math.max(6, t));
    else if (m.id.includes('ceramic')) {
      const disc = cylinder(
        g,
        x,
        3,
        z,
        Math.min(w, h) * 0.45,
        1.7,
        mat('#b77436', 0.08, 0.3),
      );
      disc.rotation.x = Math.PI / 2;
      marking(g, capacitorCode(i.value ?? 1e-7), x, z, 4.5, w * 0.7, 1.5);
    } else {
      box(g, x, 3, z, w * 0.85, 5, h * 0.8, mat(color), 0.65);
      marking(g, capacitorCode(i.value ?? 1e-7), x, z, 5.6, w * 0.7, 1.5);
    }
  } else if (m.id === 'part-button') {
    box(g, x, 1.5, z, w * 0.8, 2.8, h * 0.8, black, 0.3);
    box(g, x, 3, z, w * 0.78, 0.3, h * 0.78, metal);
    const cap = cylinder(g, x, 4, z, 1.7, 1.8, black);
    cap.userData.control = 'button';
    for (const a of [-1, 1])
      for (const b of [-1, 1])
        cylinder(g, x + a * w * 0.29, 3.25, z + b * h * 0.29, 0.4, 0.2, metal);
  } else if (m.id === 'part-potentiometer') {
    box(g, x, 1.8, z, w, 3.4, h, mat('#166ec6'), 0.6);
    cylinder(g, x, 4, z, 2.5, 1.5, mat('#b8d7ec', 0.25, 0.25));
    const slot = box(g, x, 4.8, z, 3.2, 0.12, 0.65, black);
    slot.userData.control = 'pot';
    marking(g, '103', x, z + h * 0.32, 3.55, 3.4, 1.4);
  } else if (m.id === 'part-inductor') {
    cylinder(g, x, 2.5, z, 2.6, 3.5, black);
    const pts = [];
    for (let k = 0; k <= 250; k++) {
      const a = (k / 250) * Math.PI * 20;
      pts.push(
        new T.Vector3(
          x + Math.cos(a) * 2.8,
          0.8 + (k / 250) * 3.4,
          z + Math.sin(a) * 2.8,
        ),
      );
    }
    lead(g, pts, 0.18, mat('#b76b2d', 0.8, 0.3));
  } else if (m.id === 'part-ic-dip8')
    chip(g, x, z, 0.7, w * 0.8, h * 0.55, 'DIP-8', 2.5);
  else box(g, x, t / 2, z, w, t, h, mat(color), 0.5);
}
function accessory(g: T.Group, m: PhysicalModel) {
  const { w, h, t, color } = m.body;
  const v = m.accessoryVisual,
    x = w / 2,
    z = h / 2;
  const white = mat('#edf0e9', 0.05, 0.38);
  // Dimensions are illustrative; documented terminal identities remain shared.
  box(g, x, t / 2, z, w, t, h, mat(color, 0.15, 0.4), 0.6);
  if (v === 'sonar') {
    for (const cx of [10, w - 10]) {
      cylinder(g, cx, 7, 8, 7.8, 11, metal);
      cylinder(g, cx, 12.55, 8, 6.8, 0.12, black);
      for (let k = -4; k <= 4; k++) {
        const span = Math.sqrt(6.3 ** 2 - k ** 2);
        box(g, cx, 12.7, 8 + k, span * 2, 0.15, 0.18, metal, 0.03);
        box(g, cx + k, 12.7, 8, 0.18, 0.15, span * 2, metal, 0.03);
      }
    }
    marking(g, 'HC-SR04', x, 16, 1.68, 10, 2);
  } else if (v === 'servo') {
    box(g, x, 18, z, w - 2, 5, h - 1, mat('#2989d2'), 1);
    cylinder(g, 7, 23, 5, 3.8, 5, white);
    box(g, 11, 26, 5, 20, 1.2, 3, white, 1);
    cylinder(g, 7, 26.7, 5, 0.9, 0.2, metal);
    for (const cx of [2, 20]) cylinder(g, cx, 26.65, 5, 0.55, 0.2, black);
    marking(g, 'MICRO SERVO', 16, 7, 20.6, 7, 2);
  } else if (v === 'imu') {
    chip(g, x, 6, t, 5, 5, 'MPU', 1);
    for (const cx of [2, 16]) box(g, cx, 2.2, 6, 2, 1, 1, mat('#c5b397'));
    marking(g, 'MPU6050', x, 11, 1.68, 12, 2);
  } else if (v === 'lcd') {
    box(g, x, 4, z - 1, w - 8, 5, h - 7, black, 1.5);
    box(g, x, 6.55, z - 1, w - 16, 0.1, h - 15, mat('#174569', 0.15, 0.23));
    for (let row = 0; row < 2; row++)
      for (let col = 0; col < 16; col++)
        box(
          g,
          11 + col * 3.75,
          6.65,
          11 + row * 8,
          2.7,
          0.08,
          5,
          mat('#2c7095'),
          0.05,
        );
  } else if (v === 'pir') {
    cylinder(g, x, 3, z - 2, 10, 3, white);
    const dome = new T.Mesh(
      new T.SphereGeometry(9, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      mat('#e4eae4', 0, 0.7),
    );
    dome.position.set(x, 4.5, z - 2);
    g.add(dome);
    const facets = new T.LineSegments(
      new T.WireframeGeometry(dome.geometry),
      new T.LineBasicMaterial({
        color: '#bac7c1',
        transparent: true,
        opacity: 0.35,
      }),
    );
    facets.position.copy(dome.position);
    facets.userData.ownedMaterial = true;
    g.add(facets);
  } else if (v === 'ldr') {
    cylinder(g, 7, 3, 6, 4.5, 1.5, mat('#d5a16c'));
    for (let k = 0; k < 5; k++)
      box(g, 7, 3.8, 3.4 + k * 1.2, 5, 0.1, 0.25, mat('#7b4726'));
    box(g, 22, 4, 5.5, 6, 5, 7, mat('#237cca'), 0.4);
    cylinder(g, 22, 6.6, 5.5, 1.8, 0.3, metal);
    box(g, 22, 6.8, 5.5, 2.7, 0.1, 0.4, black);
  } else if (v === 'joystick') {
    box(g, x, 5, z - 2, 20, 7, 17, metal, 1);
    cylinder(g, x, 11, z - 2, 3, 9, black);
    cylinder(g, x, 16, z - 2, 9, 4, black, 8);
    cylinder(g, x, 18.1, z - 2, 6.5, 0.2, mat('#323b42'));
  } else if (v === 'encoder') {
    box(g, 12.5, 5, 8, 15, 7, 12, metal, 0.7);
    cylinder(g, 12.5, 10, 8, 4.5, 4, black);
    cylinder(g, 12.5, 16, 8, 2.8, 10, metal);
    for (let k = 0; k < 12; k++) {
      const a = (k * Math.PI) / 6;
      box(
        g,
        12.5 + Math.cos(a) * 2.7,
        17,
        8 + Math.sin(a) * 2.7,
        0.22,
        7,
        0.22,
        black,
        0.03,
      );
    }
  } else if (v === 'buzzer') {
    cylinder(g, x, 4.5, z - 0.5, 5.5, 9, black);
    cylinder(g, x, 9.05, z - 0.5, 1.4, 0.12, mat('#03070a'));
    marking(g, '+', 8.5, 3.8, 9.12, 2, 2);
  } else if (v === 'thermometer') {
    cylinder(g, x, 3.5, 1.8, 2.2, 5, black);
    box(g, x, 3.5, 2.8, 4.4, 5, 1.3, black, 0.2);
    marking(g, '18B20', x, 1.8, 6.05, 3.5, 1);
  } else if (v === 'keypad') {
    for (let i = 0; i < 16; i++) {
      const cx = 11.5 + (i % 4) * 15,
        cz = 12 + Math.floor(i / 4) * 16;
      box(
        g,
        cx,
        2.2,
        cz,
        13,
        1.2,
        14,
        mat(i % 4 === 3 ? '#da6e3f' : '#286486'),
        2,
      );
      marking(g, '123A456B789C*0#D'[i], cx, cz, 2.85, 6, 6);
    }
  } else if (v === 'pixel') {
    box(g, x, 2, 1.9, 4, 1.4, 3.3, white, 0.2);
    cylinder(g, x, 2.75, 1.9, 1.3, 0.1, mat('#bfc5bb', 0.2, 0.22));
    ['#e76565', '#66b58e', '#6797cf'].forEach((c, i) =>
      box(g, 1.75 + i * 0.7, 2.85, 1.9, 0.5, 0.1, 0.7, mat(c)),
    );
  }
}

export function detailedModel(
  model: PhysicalModel,
  instance: Instance,
): T.Group {
  const g = new T.Group(),
    { w, h, t, color } = model.body;
  if (['uno-rev3', 'mega-2560'].includes(model.id)) uno(g, model);
  else if (model.kind === 'breadboard') breadboard(g, model);
  else if (model.kind === 'part') part(g, model, instance);
  else if (model.accessoryVisual) accessory(g, model);
  else {
    const shape = shapeRect(w, h, model.body.radius ?? 1);
    for (const hole of model.mounts ?? [])
      circleHole(shape, hole.x, hole.y, hole.d / 2);
    plate(g, shape, t, t, mat(color, 0.15, 0.4));
    for (const f of model.features ?? []) {
      const x = 'w' in f ? f.x + f.w / 2 : f.x,
        z = 'h' in f ? f.y + f.h / 2 : f.y;
      if (f.kind === 'usb') usb(g, x, z, t, f.w, f.h, f.style);
      else if (f.kind === 'barrel') barrel(g, x, z, t, f.w, f.h);
      else if (f.kind === 'ic') chip(g, x, z, t, f.w, f.h, f.label ?? 'IC');
      else if (f.kind === 'shield') {
        box(g, x, t + 1.5, z, f.w, 3, f.h, metal, 0.4);
        marking(g, f.label ?? 'RF', x, z, t + 3.05, f.w * 0.8, 2);
      } else if (f.kind === 'crystal')
        box(g, x, t + 1, z, f.w, 2, f.h, metal, 0.6);
      else if (f.kind === 'button') {
        box(g, x, t + 0.7, z, f.d + 1, 1.4, f.d + 1, metal);
        cylinder(g, x, t + 2, z, f.d / 2, 1.6, black);
      } else if (f.kind === 'silk')
        marking(
          g,
          f.text,
          x,
          z,
          t + 0.035,
          (f.size ?? 2) * f.text.length * 0.65,
          f.size ?? 2,
        );
      else if (f.kind === 'led')
        lamp(
          g,
          x,
          t + 0.6,
          z,
          f.color,
          0.65,
          f.label === 'L' ? 'signal' : 'power',
        );
      else if (f.kind === 'antenna')
        for (let k = 0; k < 6; k++) {
          box(
            g,
            f.x + (k * f.w) / 6,
            t + 0.04,
            z,
            0.4,
            0.06,
            f.h * 0.75,
            gold,
            0.01,
          );
          if (k < 5)
            box(
              g,
              f.x + ((k + 0.5) * f.w) / 6,
              t + 0.04,
              z + (k % 2 ? 1 : -1) * f.h * 0.375,
              f.w / 6,
              0.06,
              0.4,
              gold,
              0.01,
            );
        }
    }
    if (model.id === 'module-ssd1306') {
      box(
        g,
        w / 2,
        t + 0.9,
        h / 2,
        w * 0.88,
        1.8,
        h * 0.8,
        mat('#020b15', 0.22, 0.13),
        0.6,
      );
      box(
        g,
        w / 2,
        t + 1.85,
        h / 2,
        w * 0.76,
        0.08,
        h * 0.54,
        mat('#071d2a', 0.3, 0.12),
      );
    }
    if (model.id === 'module-dht22') {
      box(g, w / 2, t + 3, h / 2, w * 0.85, 6, h * 0.7, mat('#e8eeea'), 0.8);
      for (let k = 0; k < 7; k++)
        box(
          g,
          w * 0.2 + k * w * 0.1,
          t + 6.02,
          h / 2,
          w * 0.04,
          0.04,
          h * 0.5,
          mat('#808d87'),
          0.01,
        );
    }
  }
  if (model.kind !== 'breadboard')
    for (const p of model.pins) {
      if (['uno-rev3', 'mega-2560'].includes(model.id))
        socket(g, p.x, p.y, p.z);
      else if (model.kind !== 'part') {
        box(g, p.x, t + 0.6, p.y, 2.2, 1.2, 2.2, black, 0.13);
        const pin = box(
          g,
          p.x,
          Math.max(t, p.z) - 1.3,
          p.y,
          0.64,
          2.6,
          0.64,
          gold,
          0.04,
        );
        pin.userData.pinId = p.id;
      }
    }
  g.traverse((o) => {
    if (o instanceof T.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}
