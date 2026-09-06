'use client';
import {
  useEffect,
  useLayoutEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Button } from '@/components/ui/button';
import { RotateCcw } from 'lucide-react';
import {
  HOLES,
  HOLE_MAP,
  WIDTH,
  HEIGHT,
  pointOf,
  endpointHole,
  nearestHole,
  resistorBands,
  capacitorCode,
  formatValue,
  netColor,
  boardPlan,
  type Circuit,
  type Layout,
  type Point,
  type Component,
  type Placement,
  type Wire,
} from '@/lib/breadboard/model';
import type { BoardActions } from './board-2d';
export type Board3DApi = {
  png: () => string;
  reset: () => void;
  zoom: (factor: number) => void;
};
type Props = {
  circuit: Circuit;
  layout: Layout;
  selected: string | null;
  hovered: string | null;
  highlight: string | null;
  graph: Map<string, string>;
  actions: BoardActions;
  apiRef: React.RefObject<Board3DApi | null>;
  drawing: boolean;
};
type World = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  parts: Map<string, THREE.Group>;
  wires: Map<string, THREE.Mesh>;
  dynamic: THREE.Group;
  holes: THREE.InstancedMesh;
  outline: THREE.BoxHelper;
  request: () => void;
  disposeGroup: (group: THREE.Object3D) => void;
};
const xyz = (p: Point, y = 0.15) =>
  new THREE.Vector3(p.x - WIDTH / 2, y, p.y - HEIGHT / 2);
function wireGeometry(
  w: Wire,
  l: Layout,
  shift?: { ref: string; dx: number; dy: number },
) {
  const a = pointOf(endpointHole(w.a, l)),
    b = pointOf(endpointHole(w.b, l));
  if (shift && w.a.attach?.ref === shift.ref) {
    a.x += shift.dx;
    a.y += shift.dy;
  }
  if (shift && w.b.attach?.ref === shift.ref) {
    b.x += shift.dx;
    b.y += shift.dy;
  }
  const lift = 4 + Math.min(7, Math.hypot(a.x - b.x, a.y - b.y) * 0.08);
  const path = new THREE.CatmullRomCurve3([
    xyz(a),
    xyz(a, 3),
    xyz({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, lift),
    xyz(b, 3),
    xyz(b),
  ]);
  return new THREE.TubeGeometry(path, 30, 0.5, 7, false);
}
const mat = (color: THREE.ColorRepresentation) =>
  new THREE.MeshPhongMaterial({ color, shininess: 18, specular: '#353535' });
function mesh(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  parent: THREE.Object3D,
  x = 0,
  y = 0,
  z = 0,
) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
function lead(
  parent: THREE.Object3D,
  a: THREE.Vector3,
  b: THREE.Vector3,
  r = 0.22,
) {
  const v = b.clone().sub(a),
    m = mesh(
      new THREE.CylinderGeometry(r, r, v.length(), 7),
      mat('#a5aaa5'),
      parent,
    );
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize());
  return m;
}
function textSprite(text: string, color = '#304b4c', width = 9, height = 2.4) {
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 96;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 384, 96);
  ctx.font = '600 54px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, 192, 48);
  const texture = new THREE.CanvasTexture(canvas),
    s = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: texture, depthWrite: false }),
    );
  s.scale.set(width, height, 1);
  return s;
}
function topLabel(
  parent: THREE.Object3D,
  text: string,
  width: number,
  height: number,
  y: number,
  bg: string,
  fg: string,
) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 160);
  ctx.fillStyle = fg;
  ctx.font = '52px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 80);
  const texture = new THREE.CanvasTexture(canvas),
    plane = mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 1,
        side: THREE.DoubleSide,
      }),
      parent,
      0,
      y,
      0,
    );
  plane.rotation.x = -Math.PI / 2;
  plane.castShadow = false;
  return plane;
}
function partGroup(c: Component, p: Placement) {
  const g = new THREE.Group(),
    a = pointOf(p.pins['1']),
    b = pointOf(p.pins[c.type === 'ic_dip8' ? '4' : '2']),
    pinPoints = Object.values(p.pins).map(pointOf),
    center = {
      x: pinPoints.reduce((s, p) => s + p.x, 0) / pinPoints.length,
      y: pinPoints.reduce((s, p) => s + p.y, 0) / pinPoints.length,
    };
  g.position.copy(xyz(center, 0));
  g.rotation.y = -Math.atan2(b.y - a.y, b.x - a.x);
  if (c.type === 'ic_dip8') {
    mesh(new THREE.BoxGeometry(10.8, 2.7, 4.2), mat('#303738'), g, 0, 2.35, 0);
    topLabel(g, c.part ?? 'DIP-8', 8.2, 2.5, 3.71, '#303738', '#e8eadd');
    const dot = mesh(
      new THREE.CircleGeometry(0.35, 12),
      mat('#d9e1d6'),
      g,
      -4.25,
      3.73,
      1.35,
    );
    dot.rotation.x = -Math.PI / 2;
    const notch = new THREE.CatmullRomCurve3(
      Array.from({ length: 13 }, (_, i) => {
        const t = (i / 12) * Math.PI;
        return new THREE.Vector3(
          -5.4 + 0.65 * Math.sin(t),
          3.72,
          0.75 * Math.cos(t),
        );
      }),
    );
    mesh(new THREE.TubeGeometry(notch, 12, 0.12, 5, false), mat('#8d9490'), g);
    for (let i = 0; i < 8; i++) {
      const x = (i < 4 ? i : 7 - i) * 2.54 - 3.81,
        z = i < 4 ? 3.81 : -3.81;
      lead(g, new THREE.Vector3(x, 0.12, z), new THREE.Vector3(x, 1.2, z));
      lead(
        g,
        new THREE.Vector3(x, 1.2, z),
        new THREE.Vector3(x, 1.4, Math.sign(z) * 2.1),
      );
    }
  } else {
    const length = Math.hypot(a.x - b.x, a.y - b.y),
      bodyHalf =
        c.type === 'resistor' ? 3.7 : c.type === 'inductor' ? 3.5 : 1.5;
    for (const sign of [-1, 1]) {
      const h =
        c.type === 'capacitor_electrolytic' ? (sign < 0 ? 2 : 1.3) : 2.3;
      lead(
        g,
        new THREE.Vector3((sign * length) / 2, 0.12, 0),
        new THREE.Vector3((sign * length) / 2, h, 0),
      );
      lead(
        g,
        new THREE.Vector3((sign * length) / 2, h, 0),
        new THREE.Vector3(sign * bodyHalf, h, 0),
      );
    }
    if (c.type === 'resistor') {
      const body = mesh(
        new THREE.CylinderGeometry(1.35, 1.35, 7.4, 18),
        mat('#d6c08a'),
        g,
        0,
        2.3,
        0,
      );
      body.rotation.z = Math.PI / 2;
      try {
        resistorBands(c.value!, c.tolerance ?? 0.05).colors.forEach(
          (color, i) => {
            if (color === 'transparent') return;
            const band = mesh(
              new THREE.CylinderGeometry(1.375, 1.375, 0.52, 18),
              mat(color),
              g,
              [-2.6, -1.25, 0.15, 2.25][i],
              2.3,
              0,
            );
            band.rotation.z = Math.PI / 2;
          },
        );
      } catch {
        const s = textSprite(formatValue(c), '#3e4945', 8, 2);
        s.position.set(0, 4, 0);
        g.add(s);
      }
    } else if (c.type === 'capacitor_ceramic') {
      const disc = mesh(
        new THREE.CylinderGeometry(2.5, 2.5, 1.35, 24),
        mat('#bd8844'),
        g,
        0,
        4.1,
        0,
      );
      disc.rotation.x = Math.PI / 2;
      const s = textSprite(capacitorCode(c.value!), '#48341d', 4, 1.4);
      s.position.set(0, 4.1, 1);
      g.add(s);
    } else if (c.type === 'capacitor_film') {
      mesh(new THREE.BoxGeometry(6.5, 4, 2.6), mat('#b86945'), g, 0, 3.7, 0);
      topLabel(g, capacitorCode(c.value!), 5, 2, 5.72, '#b86945', '#fff5df');
    } else if (c.type === 'capacitor_electrolytic') {
      mesh(
        new THREE.CylinderGeometry(3, 3, 8, 24),
        mat('#3b5869'),
        g,
        0,
        5.7,
        0,
      );
      mesh(
        new THREE.CylinderGeometry(
          3.015,
          3.015,
          7.9,
          6,
          1,
          true,
          Math.PI / 2 - 0.27,
          0.54,
        ),
        mat('#dce1d5'),
        g,
        0,
        5.7,
        0,
      );
      mesh(
        new THREE.CylinderGeometry(2.7, 2.7, 0.12, 24),
        mat('#c8cfca'),
        g,
        0,
        9.76,
        0,
      );
      lead(
        g,
        new THREE.Vector3(-1.3, 9.84, -1.3),
        new THREE.Vector3(1.3, 9.84, 1.3),
        0.055,
      );
      lead(
        g,
        new THREE.Vector3(1.3, 9.84, -1.3),
        new THREE.Vector3(-1.3, 9.84, 1.3),
        0.055,
      );
      const s = textSprite('−', '#374f5b', 1.3, 1.5);
      s.position.set(3.1, 6.5, 0);
      g.add(s);
    } else if (c.type === 'inductor') {
      const core = mesh(
        new THREE.CylinderGeometry(1.5, 1.5, 7, 16),
        mat('#646b67'),
        g,
        0,
        2.3,
        0,
      );
      core.rotation.z = Math.PI / 2;
      const points = Array.from({ length: 129 }, (_, i) => {
        const t = i / 128;
        return new THREE.Vector3(
          -3.3 + 6.6 * t,
          2.3 + 1.7 * Math.cos(t * Math.PI * 16),
          1.7 * Math.sin(t * Math.PI * 16),
        );
      });
      mesh(
        new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3(points),
          128,
          0.22,
          6,
          false,
        ),
        mat('#b57a43'),
        g,
      );
    } else if (c.type === 'wire') {
      const path = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-length / 2, 0.15, 0),
        new THREE.Vector3(-length / 2, 3, 0),
        new THREE.Vector3(0, 5, 0),
        new THREE.Vector3(length / 2, 3, 0),
        new THREE.Vector3(length / 2, 0.15, 0),
      ]);
      mesh(new THREE.TubeGeometry(path, 24, 0.5, 7, false), mat('#388d6b'), g);
    }
  }
  const label = textSprite(c.ref, '#234b4f', 7, 2);
  label.position.set(0, c.type === 'capacitor_electrolytic' ? 12 : 7, -2);
  g.add(label);
  g.traverse((o) => (o.userData.ref = c.ref));
  return g;
}
export default function Board3D(props: Props) {
  const host = useRef<HTMLDivElement>(null),
    world = useRef<World | null>(null),
    propsRef = useRef(props),
    [error, setError] = useState(''),
    [fps, setFps] = useState<number | null>(null);
  useLayoutEffect(() => {
    propsRef.current = props;
  }, [props]);
  useImperativeHandle(
    props.apiRef,
    () => ({
      png: () => {
        const w = world.current;
        if (!w) throw Error('The 3D view is not ready yet.');
        w.controls.update();
        w.renderer.render(w.scene, w.camera);
        return w.renderer.domElement.toDataURL('image/png');
      },
      reset: () => {
        const w = world.current;
        if (w) {
          w.controls.reset();
          w.request();
        }
      },
      zoom: (factor) => {
        const w = world.current;
        if (!w) return;
        w.camera.position
          .sub(w.controls.target)
          .multiplyScalar(factor)
          .add(w.controls.target);
        w.controls.update();
        w.request();
      },
    }),
    [],
  );
  useEffect(() => {
    const el = host.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        preserveDrawingBuffer: false,
      });
    } catch {
      // oxlint-disable-next-line react/react-compiler -- This reports an external WebGL initialization failure once.
      setError(
        'WebGL could not start in this browser. You can use the 2D view.',
      );
      return;
    }
    const displayRatio = Math.min(devicePixelRatio, 1.5);
    renderer.setPixelRatio(displayRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    // Geometry is static between edits. Recompute contact shadows on placement,
    // rather than rendering another full shadow pass for every pointer frame.
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    renderer.domElement.setAttribute(
      'aria-label',
      'Rotatable 3D breadboard; drag a component by its body to move it',
    );
    renderer.domElement.setAttribute('role', 'img');
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#dce6e3');
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 1000);
    camera.position.set(13, 127, 129);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.minDistance = 35;
    controls.maxDistance = 290;
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.saveState();
    scene.add(new THREE.HemisphereLight('#fffdf2', '#84998f', 2.3));
    const sunlight = new THREE.DirectionalLight('#fffaf0', 2.3);
    sunlight.position.set(-55, 110, 65);
    sunlight.castShadow = true;
    sunlight.shadow.mapSize.set(1024, 1024);
    sunlight.shadow.camera.left = -105;
    sunlight.shadow.camera.right = 105;
    sunlight.shadow.camera.top = 70;
    sunlight.shadow.camera.bottom = -70;
    sunlight.shadow.camera.far = 300;
    sunlight.shadow.normalBias = 0.08;
    scene.add(sunlight);
    mesh(
      new THREE.BoxGeometry(WIDTH, 2.2, HEIGHT),
      mat('#f2f0e5'),
      scene,
      0,
      -1.1,
      0,
    );
    mesh(
      new THREE.BoxGeometry(WIDTH - 6, 0.12, 4.3),
      mat('#d5d5ca'),
      scene,
      0,
      0.04,
      25.81 - HEIGHT / 2,
    );
    const ground = mesh(
      new THREE.PlaneGeometry(1200, 1200),
      mat('#dae4e0'),
      scene,
      0,
      -2.5,
      0,
    );
    ground.rotation.x = -Math.PI / 2;
    ground.castShadow = false;
    const holeGeometry = new THREE.CircleGeometry(0.49, 9);
    holeGeometry.rotateX(-Math.PI / 2);
    const holes = new THREE.InstancedMesh(
      holeGeometry,
      new THREE.MeshBasicMaterial({ color: '#ffffff' }),
      HOLES.length,
    );
    holes.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    const bevelGeo = new THREE.RingGeometry(0.49, 0.74, 9);
    bevelGeo.rotateX(-Math.PI / 2);
    const bevels = new THREE.InstancedMesh(
        bevelGeo,
        new THREE.MeshBasicMaterial({ color: '#cdcdc3' }),
        HOLES.length,
      ),
      matrix = new THREE.Matrix4();
    HOLES.forEach((h, i) => {
      matrix.makeTranslation(h.x - WIDTH / 2, 0.13, h.y - HEIGHT / 2);
      holes.setMatrixAt(i, matrix);
      holes.setColorAt(i, new THREE.Color('#585f57'));
      bevels.setMatrixAt(i, matrix);
    });
    holes.instanceMatrix.needsUpdate = true;
    bevels.instanceMatrix.needsUpdate = true;
    scene.add(holes, bevels);
    // One texture atlas for column/row labels and the split rail stripes.
    const atlas = document.createElement('canvas');
    atlas.width = 2048;
    atlas.height = 640;
    const ctx = atlas.getContext('2d')!,
      sx = atlas.width / WIDTH,
      sy = atlas.height / HEIGHT;
    ctx.scale(sx, sy);
    ctx.font = '1.5px Arial';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#737c72';
    for (let col = 1; col <= 63; col++)
      ctx.fillText(String(col), 8 + (col - 1) * 2.54, 10.1);
    for (const row of 'ABCDEFGHIJ')
      ctx.fillText(row, 3.3, HOLE_MAP.get('1-' + row)!.y + 0.6);
    for (const [i, y] of [1.8, 8, 43.7, 50].entries()) {
      ctx.strokeStyle = ['#c95851', '#606760', '#9aaba1', '#507aaf'][i];
      ctx.lineWidth = 0.3;
      ctx.beginPath();
      ctx.moveTo(9, y);
      ctx.lineTo(WIDTH / 2 - 4, y);
      ctx.moveTo(WIDTH / 2 + 4, y);
      ctx.lineTo(WIDTH - 6, y);
      ctx.stroke();
      ctx.fillStyle = '#566961';
      ctx.fillText(['T+', 'T-', 'B+', 'B-'][i], 2.5, y + 1.2);
    }
    const texture = new THREE.CanvasTexture(atlas),
      labels = mesh(
        new THREE.PlaneGeometry(WIDTH, HEIGHT),
        new THREE.MeshBasicMaterial({
          map: texture,
          transparent: true,
          depthWrite: false,
        }),
        scene,
        0,
        0.16,
        0,
      );
    labels.rotation.x = -Math.PI / 2;
    labels.castShadow = false;
    labels.receiveShadow = false;
    const dynamic = new THREE.Group();
    scene.add(dynamic);
    const outline = new THREE.BoxHelper(
      new THREE.Object3D(),
      new THREE.Color('#00a0a6'),
    );
    outline.visible = false;
    scene.add(outline);
    let raf = 0,
      disposed = false,
      drag: null | {
        ref: string;
        origin: THREE.Vector3;
        position: THREE.Vector3;
        dx: number;
        dy: number;
        times: number[];
      } = null,
      down: { x: number; y: number } | null = null;
    const raycaster = new THREE.Raycaster(),
      mouse = new THREE.Vector2(),
      plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    function pointer(e: PointerEvent) {
      const r = renderer.domElement.getBoundingClientRect();
      mouse.set(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        (-(e.clientY - r.top) / r.height) * 2 + 1,
      );
      raycaster.setFromCamera(mouse, camera);
    }
    function planeHit() {
      const p = new THREE.Vector3();
      return raycaster.ray.intersectPlane(plane, p);
    }
    function request() {
      if (!raf && !disposed) raf = requestAnimationFrame(draw);
    }
    function draw(time: number) {
      raf = 0;
      if (disposed) return;
      controls.update();
      renderer.render(scene, camera);
      if (drag) {
        drag.times.push(time);
        // Adapt only when the recent frame time misses the 60 Hz target.
        // Fast GPUs keep full detail; slow software renderers use fewer pixels.
        const n = drag.times.length;
        if (n >= 12 && n % 12 === 0) {
          const averageMs = (time - drag.times[n - 12]) / 11;
          if (averageMs > 18.5 && renderer.getPixelRatio() > displayRatio * 0.5)
            renderer.setPixelRatio(
              Math.max(displayRatio * 0.5, renderer.getPixelRatio() * 0.7),
            );
        }
        request();
      }
    }
    function disposeGroup(group: THREE.Object3D) {
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        if (m.material)
          for (const mat of Array.isArray(m.material)
            ? m.material
            : [m.material]) {
            const tex = (mat as THREE.MeshStandardMaterial).map;
            if (tex) tex.dispose();
            mat.dispose();
          }
      });
    }
    const w: World = {
      renderer,
      scene,
      camera,
      controls,
      parts: new Map(),
      wires: new Map(),
      dynamic,
      holes,
      outline,
      request,
      disposeGroup,
    };
    world.current = w;
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      down = { x: e.clientX, y: e.clientY };
      pointer(e);
      const hit = raycaster
        .intersectObjects(dynamic.children, true)
        .find((h) => h.object.userData.ref);
      if (hit && !propsRef.current.drawing) {
        const ref = hit.object.userData.ref as string,
          part = w.parts.get(ref);
        if (!part) return;
        const point = planeHit();
        if (!point) return;
        propsRef.current.actions.onPart(ref);
        controls.enabled = false;
        e.stopImmediatePropagation();
        renderer.domElement.setPointerCapture(e.pointerId);
        drag = {
          ref,
          origin: point,
          position: part.position.clone(),
          dx: 0,
          dy: 0,
          times: [],
        };
        request();
      }
    };
    const onMove = (e: PointerEvent) => {
      pointer(e);
      if (drag) {
        const hit = planeHit();
        if (!hit) return;
        drag.dx = hit.x - drag.origin.x;
        drag.dy = hit.z - drag.origin.z;
        const group = w.parts.get(drag.ref)!;
        group.position.set(
          drag.position.x + drag.dx,
          drag.position.y,
          drag.position.z + drag.dy,
        );
        outline.setFromObject(group);
        for (const wire of propsRef.current.layout.wires) {
          if (
            wire.a.attach?.ref !== drag.ref &&
            wire.b.attach?.ref !== drag.ref
          )
            continue;
          const line = w.wires.get(wire.id);
          if (line) {
            line.geometry.dispose();
            line.geometry = wireGeometry(wire, propsRef.current.layout, drag);
          }
        }
        request();
        return;
      }
      const hit = raycaster
        .intersectObjects(dynamic.children, true)
        .find((h) => h.object.userData.ref || h.object.userData.wire);
      if (hit?.object.userData.ref) {
        propsRef.current.actions.onHover(hit.object.userData.ref);
        propsRef.current.actions.onNet(null);
      } else if (hit?.object.userData.wire) {
        const wire = propsRef.current.layout.wires.find(
          (wire) => wire.id === hit.object.userData.wire,
        );
        propsRef.current.actions.onHover(null);
        propsRef.current.actions.onNet(
          wire
            ? (propsRef.current.graph.get(
                endpointHole(wire.a, propsRef.current.layout),
              ) ?? null)
            : null,
        );
      } else {
        propsRef.current.actions.onHover(null);
        const hole = raycaster.intersectObject(holes)[0];
        propsRef.current.actions.onNet(
          hole?.instanceId !== undefined
            ? (propsRef.current.graph.get(HOLES[hole.instanceId].id) ?? null)
            : null,
        );
      }
    };
    const onUp = (e: PointerEvent) => {
      if (drag) {
        const d = drag;
        drag = null;
        w.parts.get(d.ref)!.position.copy(d.position);
        controls.enabled = true;
        renderer.setPixelRatio(displayRatio);
        if (Math.hypot(d.dx, d.dy) > 0.1)
          propsRef.current.actions.onMove(d.ref, d.dx, d.dy);
        if (d.times.length > 4)
          setFps(
            Math.round(
              (1000 * (d.times.length - 1)) / (d.times.at(-1)! - d.times[0]),
            ),
          );
        down = null;
        request();
        return;
      }
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) {
        down = null;
        return;
      }
      down = null;
      pointer(e);
      const hit = raycaster
        .intersectObjects(dynamic.children, true)
        .find((h) => h.object.userData.ref || h.object.userData.wire);
      if (hit && !propsRef.current.drawing) {
        propsRef.current.actions.onPart(
          hit.object.userData.ref ?? hit.object.userData.wire,
        );
        return;
      }
      const p = planeHit();
      if (p) {
        const q = { x: p.x + WIDTH / 2, y: p.z + HEIGHT / 2 },
          hole = nearestHole(q);
        if (Math.hypot(hole.x - q.x, hole.y - q.y) < 1.7)
          propsRef.current.actions.onHole(hole.id);
      }
    };
    const onCancel = () => {
      if (drag) {
        w.parts.get(drag.ref)?.position.copy(drag.position);
        for (const wire of propsRef.current.layout.wires) {
          const mesh = w.wires.get(wire.id);
          if (mesh) {
            mesh.geometry.dispose();
            mesh.geometry = wireGeometry(wire, propsRef.current.layout);
          }
        }
      }
      drag = null;
      down = null;
      controls.enabled = true;
      renderer.setPixelRatio(displayRatio);
      request();
    };
    renderer.domElement.addEventListener('pointerdown', onDown, true);
    renderer.domElement.addEventListener('pointermove', onMove);
    renderer.domElement.addEventListener('pointerup', onUp);
    renderer.domElement.addEventListener('pointercancel', onCancel);
    controls.addEventListener('change', request);
    const observer = new ResizeObserver(() => {
      const width = el.clientWidth,
        height = el.clientHeight;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      request();
    });
    observer.observe(el);
    request();
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      controls.dispose();
      disposeGroup(scene);
      renderer.dispose();
      renderer.domElement.remove();
      world.current = null;
    };
  }, []);
  useEffect(() => {
    const w = world.current;
    if (!w) return;
    // oxlint-disable-next-line unicorn/no-useless-spread -- Removing children mutates the original collection; iterate a snapshot.
    for (const child of [...w.dynamic.children]) {
      w.dynamic.remove(child);
      w.disposeGroup(child);
    }
    w.parts.clear();
    w.wires.clear();
    for (const c of props.circuit.components) {
      const p = props.layout.parts[c.ref];
      if (!p) continue;
      const group = partGroup(c, p);
      w.dynamic.add(group);
      w.parts.set(c.ref, group);
    }
    for (const wire of props.layout.wires) {
      if (
        !endpointHole(wire.a, props.layout) ||
        !endpointHole(wire.b, props.layout)
      )
        continue;
      const line = mesh(
        wireGeometry(wire, props.layout),
        mat(wire.color),
        w.dynamic,
      );
      line.userData.wire = wire.id;
      line.castShadow = false;
      w.wires.set(wire.id, line);
    }
    for (const port of boardPlan(props.circuit).ports) {
      const p = xyz(pointOf(port.hole), 0.3),
        dot = mesh(
          new THREE.CylinderGeometry(0.75, 0.75, 0.3, 10),
          mat(netColor(port.net, props.circuit)),
          w.dynamic,
          p.x,
          p.y,
          p.z,
        ),
        label = textSprite(port.label, '#28484c', 8, 2);
      dot.castShadow = false;
      label.position.set(p.x, 3.1, p.z - 2);
      w.dynamic.add(label);
    }
    w.outline.visible = false;
    w.renderer.shadowMap.needsUpdate = true;
    w.request();
  }, [props.circuit, props.layout, error]);
  useEffect(() => {
    const w = world.current;
    if (!w) return;
    const group = w.parts.get(props.hovered ?? props.selected ?? '');
    w.outline.visible = !!group;
    if (group) w.outline.setFromObject(group);
    HOLES.forEach((h, i) =>
      w.holes.setColorAt(
        i,
        new THREE.Color(
          props.highlight && props.graph.get(h.id) === props.highlight
            ? '#00a4a4'
            : '#585f57',
        ),
      ),
    );
    if (w.holes.instanceColor) w.holes.instanceColor.needsUpdate = true;
    for (const wire of props.layout.wires) {
      const mesh = w.wires.get(wire.id);
      if (mesh) {
        const m = mesh.material as THREE.MeshStandardMaterial;
        m.transparent = true;
        m.opacity =
          props.highlight &&
          props.graph.get(endpointHole(wire.a, props.layout)) !==
            props.highlight
            ? 0.3
            : 1;
      }
    }
    w.request();
  }, [
    props.hovered,
    props.selected,
    props.highlight,
    props.graph,
    props.layout,
  ]);
  return (
    <div className="bb-3d" ref={host}>
      {error ? (
        <p className="bb-3d-error" role="alert">
          {error}
        </p>
      ) : (
        <>
          <Button
            variant="outline"
            size="sm"
            className="bb-3d-reset"
            onClick={() => props.apiRef.current?.reset()}
          >
            <RotateCcw size={15} />
            Reset camera
          </Button>
          <output className="bb-3d-status">
            830 holes · 3D view ·{' '}
            {fps ? `last drag ${fps} fps` : 'rotate / zoom / move component'}
          </output>
        </>
      )}
    </div>
  );
}
