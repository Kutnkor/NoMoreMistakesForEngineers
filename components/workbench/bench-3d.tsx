'use client';
// Editable 3D workbench. The scene is a projection of the same project state
// the 2D view renders; it never owns geometry of its own.
//
// Table mapping lives in lib/workbench/geometry.ts: world = (x, z, y).
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Button } from '@/components/ui/button';
import {
  fitCamera,
  intersectDragPlane,
  pointerIntent,
  type CameraPose,
  type NavigationMode,
} from '@/lib/workbench/navigation';
import { HOLES, HOLE_MAP } from '@/lib/breadboard/model';
import {
  effectiveTransform,
  endpointPoint,
  workbenchBounds,
} from '@/lib/workbench/geometry';
import type { PhysicalModel } from '@/lib/workbench/physical';
import type {
  BenchWire,
  ConnectionEndpoint,
  Instance,
  ModelLookup,
  Workbench,
} from '@/lib/workbench/types';
import { detailedModel } from './detailed-model';
import type { RuntimeFrame } from '@/lib/workbench/runtime/circuit';

export type Bench3DApi = {
  resetCamera: () => void;
  focus: (instanceId: string) => void;
  snapshot: () => string | null;
};

type Props = {
  cameraPose?: React.RefObject<CameraPose | null>;
  runtime: RuntimeFrame;
  workbench: Workbench;
  lookup: ModelLookup;
  selection: string | null;
  tool: 'select' | 'wire' | 'probe';
  wireStart: ConnectionEndpoint | null;
  dark: boolean;
  selectedWire: string | null;
  highlightNet: string | null;
  netOf: (e: ConnectionEndpoint) => string | null;
  showLabels: boolean;
  active: boolean;
  onSelectWire: (id: string | null) => void;
  onFocus: (id: string) => void;
  onEditWire: (id: string, patch: Partial<BenchWire>, done?: boolean) => void;
  onRewire: (id: string, side: 'a' | 'b') => void;
  apiRef?: React.RefObject<Bench3DApi | null>;
  onSelectInstance: (id: string | null) => void;
  onPickEndpoint: (e: ConnectionEndpoint) => void;
  onHoverEndpoint: (
    e: ConnectionEndpoint | null,
    screen?: { x: number; y: number },
  ) => void;
  onMove: (id: string, dx: number, dy: number, done: boolean) => void;
};

const MAT = new Map<string, THREE.MeshStandardMaterial>();
const material = (
  color: string,
  opts: Partial<THREE.MeshStandardMaterialParameters> = {},
) => {
  const key = color + JSON.stringify(opts);
  let m = MAT.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.62,
      metalness: 0.08,
      ...opts,
    });
    MAT.set(key, m);
  }
  return m;
};

// Shared geometries: repeated parts must not allocate per instance.
const GEO = {
  pin: new THREE.CylinderGeometry(0.32, 0.32, 2.6, 8),
  hole: new THREE.BoxGeometry(1.1, 0.6, 1.1),
  pick: new THREE.SphereGeometry(1, 8, 6),
  highlight: new THREE.SphereGeometry(0.9, 8, 6),
};

function labelSprite(text: string, size = 3, color = '#e8f4f7'): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.font = '500 36px monospace';
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.fillText(text, 256, 44);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    }),
  );
  sprite.scale.set(size * 8, size, 1);
  sprite.raycast = () => {};
  sprite.userData.label = true;
  return sprite;
}
function boardGroup(model: PhysicalModel, instance: Instance): THREE.Group {
  const g = detailedModel(model, instance);
  const { w, h, t } = model.body;
  if (model.kind !== 'breadboard') {
    const title = labelSprite(model.name, 3.2, '#18334c');
    title.position.set(w / 2, t + 12, h / 2);
    title.userData.nameLabel = true;
    g.add(title);
    for (const p of model.pins) {
      const label = labelSprite(p.label, 1.8, '#102b40');
      label.position.set(p.x, p.z + 4, p.y - 2);
      label.userData.pinLabel = true;
      g.add(label);
    }
  }
  const proxy = new THREE.Mesh(new THREE.BoxGeometry(w, t, h));
  proxy.position.set(w / 2, t / 2, h / 2);
  proxy.visible = false;
  proxy.userData.ownedMaterial = true;
  proxy.userData.pickable = 'body';
  g.add(proxy);
  g.userData.pickProxy = proxy;
  const outline = new THREE.BoxHelper(g, 0x0d9488);
  outline.userData.outline = true;
  outline.raycast = () => {};
  outline.visible = false;
  g.add(outline);
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}

export default function Bench3D(props: Props) {
  // Only the values used during render are destructured; the callbacks are read
  // from `latest` inside event handlers so the listeners can stay permanent.
  const {
    workbench,
    lookup,
    selection,
    dark,
    apiRef,
    selectedWire,
    highlightNet,
    netOf,
  } = props;
  const [navigation, setNavigation] = useState<NavigationMode>('edit');
  const [inputMode, setInputMode] = useState<'trackpad' | 'mouse'>('trackpad');
  const navigationRef = useRef({ navigation, inputMode, space: false });
  useEffect(() => {
    navigationRef.current.navigation = navigation;
    navigationRef.current.inputMode = inputMode;
  }, [navigation, inputMode]);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const state = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    groups: Map<string, THREE.Group>;
    wires: Map<string, THREE.Mesh>;
    pick: THREE.InstancedMesh | null;
    pickIndex: ConnectionEndpoint[];
    /** Base positions of the pick targets, so hit testing never rebuilds them. */
    pickPos: Float32Array;
    pickScale: number;
    raycaster: THREE.Raycaster;
    plane: THREE.Plane;
    drag: {
      id: string;
      last: THREE.Vector3;
      height: number;
      startX: number;
      startY: number;
      pointerId: number;
      moved: boolean;
      bend?: number;
    } | null;
    handles: THREE.Group;
    /** True while the camera is being dragged; hover picking is suspended. */
    orbiting: boolean;
    hoverQueued: boolean;
    frame: number;
    dirty: boolean;
    dispose: (o: THREE.Object3D) => void;
  } | null>(null);
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  });

  const frameScene = useCallback((top = false) => {
    const s = state.current;
    if (!s) return;
    s.controls.target.copy(
      fitCamera(
        s.camera,
        workbenchBounds(latest.current.workbench, latest.current.lookup),
        top ? new THREE.Vector3(0, 1, 0.016) : new THREE.Vector3(0.65, 1, 0.8),
      ),
    );
    s.controls.update();
    s.dirty = true;
  }, []);

  // ---------------- one-time setup ----------------
  useEffect(() => {
    const host = hostRef.current;
    const poseRef = latest.current.cameraPose;
    if (!host) return;
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    host.appendChild(renderer.domElement);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const environment = pmrem.fromScene(room, 0.04);
    scene.environment = environment.texture;
    scene.environmentIntensity = 0.5;
    room.dispose();
    pmrem.dispose();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 6000);
    camera.position.set(120, 170, 210);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.minPolarAngle = 0.015;
    controls.maxPolarAngle = Math.PI / 2 - 0.15;
    controls.minDistance = 12;
    controls.maxDistance = 2400;
    controls.rotateSpeed = 0.55;
    controls.panSpeed = 0.85;
    controls.zoomSpeed = 0.65;
    controls.screenSpacePanning = true;
    controls.zoomToCursor = true;
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.PAN,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.ROTATE,
    };
    controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };
    renderer.domElement.tabIndex = 0;
    renderer.domElement.setAttribute(
      'aria-label',
      '3D circuit workspace. F fits the scene, T shows the top view.',
    );

    scene.add(new THREE.HemisphereLight(0xf1f7ff, 0x738494, 2.0));
    const key = new THREE.DirectionalLight(0xfff5e7, 3.0);
    key.position.set(120, 220, 140);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -400;
    key.shadow.camera.right = 400;
    key.shadow.camera.top = 400;
    key.shadow.camera.bottom = -400;
    key.shadow.bias = -0.0004;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xc1dcff, 1.0);
    fill.position.set(-140, 120, -90);
    scene.add(fill);

    const table = new THREE.Mesh(
      new THREE.PlaneGeometry(2000, 2000),
      new THREE.MeshStandardMaterial({ color: 0xe8eef3, roughness: 0.95 }),
    );
    table.rotation.x = -Math.PI / 2;
    table.position.y = -0.3;
    table.receiveShadow = true;
    table.userData.pickable = 'table';
    scene.add(table);

    const dispose = (o: THREE.Object3D) => {
      o.traverse((c) => {
        const m = c as THREE.Mesh;
        if (
          c.userData.ownedMaterial &&
          (c instanceof THREE.Mesh || c instanceof THREE.LineSegments)
        ) {
          const m = c.material as THREE.MeshStandardMaterial;
          m.map?.dispose();
          m.dispose();
        }
        if (c instanceof THREE.Sprite) {
          c.material.map?.dispose();
          c.material.dispose();
        }
        if (m.geometry && !Object.values(GEO).includes(m.geometry as never))
          m.geometry.dispose();
      });
      o.removeFromParent();
    };

    state.current = {
      renderer,
      scene,
      camera,
      controls,
      groups: new Map(),
      wires: new Map(),
      handles: new THREE.Group(),
      pick: null,
      pickIndex: [],
      pickPos: new Float32Array(0),
      pickScale: 1,
      raycaster: new THREE.Raycaster(),
      plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
      drag: null,
      orbiting: false,
      hoverQueued: false,
      frame: 0,
      dirty: true,
      dispose,
    };

    scene.add(state.current.handles);
    const resize = () => {
      const w = host.clientWidth || 800,
        h = host.clientHeight || 520;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      if (state.current) state.current.dirty = true;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const moved = controls.update();
      if (latest.current.active && (moved || state.current?.dirty)) {
        const distance = camera.position.distanceTo(controls.target);
        for (const g of state.current?.groups.values() ?? [])
          g.traverse((o) => {
            if (o.userData.pinLabel)
              o.visible =
                latest.current.showLabels &&
                g.userData.instanceId === latest.current.selection &&
                distance < 260;
            if (o.userData.nameLabel) o.visible = latest.current.showLabels;
          });
        renderer.render(scene, camera);
        if (state.current) state.current.dirty = false;
      }
    };
    const saved = latest.current.cameraPose?.current;
    if (saved) {
      camera.position.fromArray(saved.position);
      controls.target.fromArray(saved.target);
      camera.lookAt(controls.target);
    } else
      controls.target.copy(
        fitCamera(
          camera,
          workbenchBounds(latest.current.workbench, latest.current.lookup),
        ),
      );
    controls.update();
    loop();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      if (poseRef)
        poseRef.current = {
          position: camera.position.toArray(),
          target: controls.target.toArray(),
        };
      controls.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (
          o.userData.ownedMaterial &&
          (o instanceof THREE.Mesh || o instanceof THREE.LineSegments)
        ) {
          const m = o.material as THREE.MeshStandardMaterial;
          m.map?.dispose();
          m.dispose();
        }
        if (o instanceof THREE.Sprite) {
          o.material.map?.dispose();
          o.material.dispose();
        }
        if (m.geometry && !Object.values(GEO).includes(m.geometry as never))
          m.geometry.dispose();
      });
      environment.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      state.current = null;
    };
  }, []);

  useEffect(() => {
    const s = state.current;
    if (s) {
      s.scene.background = new THREE.Color(dark ? 0x14161a : 0xf0f5fa);
      s.dirty = true;
    }
  }, [dark]);

  // ---------------- diff the project into the scene ----------------
  useEffect(() => {
    const s = state.current;
    if (!s) return;
    s.dirty = true;
    const seen = new Set<string>();
    const pickPoints: { p: THREE.Vector3; e: ConnectionEndpoint }[] = [];

    for (const inst of workbench.instances) {
      const model = lookup(inst.modelId);
      if (!model) continue;
      seen.add(inst.id);
      let g = s.groups.get(inst.id);
      if (
        !g ||
        g.userData.modelId !== inst.modelId ||
        g.userData.value !== inst.value
      ) {
        if (g) s.dispose(g);
        g = boardGroup(model, inst);
        g.userData.value = inst.value;
        g.userData.modelId = inst.modelId;
        g.userData.instanceId = inst.id;
        s.scene.add(g);
        s.groups.set(inst.id, g);
      }
      const pose = effectiveTransform(inst, model, workbench, lookup);
      g.position.set(
        pose.x,
        inst.mounted
          ? (lookup(
              workbench.instances.find(
                (i) => i.id === inst.mounted!.boardInstanceId,
              )?.modelId ?? '',
            )?.body.t ?? 0)
          : 0,
        pose.y,
      );
      g.rotation.y = (-pose.rot * Math.PI) / 180;
      g.updateMatrixWorld(true);
      // Local origin offset so rotation happens about the model origin.
      g.position.add(
        new THREE.Vector3(-model.origin.x, 0, -model.origin.y).applyAxisAngle(
          new THREE.Vector3(0, 1, 0),
          g.rotation.y,
        ),
      );
      g.updateMatrixWorld(true);
      if (inst.mounted)
        for (const child of g.children)
          if (child.userData.pinId) {
            const at = endpointPoint(
              {
                kind: inst.kind === 'board' ? 'board-pin' : 'component-pin',
                instanceId: inst.id,
                pinId: child.userData.pinId,
              },
              workbench,
              lookup,
            );
            if (at)
              child.position.copy(
                g.worldToLocal(new THREE.Vector3(at.x, at.z - 1.3, at.y)),
              );
          }
      g.userData.selected = selection === inst.id;
      g.children
        .filter((o) => o.userData.outline)
        .forEach((o) => {
          o.visible = selection === inst.id;
        });

      for (const p of model.pins)
        pickPoints.push({
          p: new THREE.Vector3(),
          e: {
            kind: model.kind === 'board' ? 'board-pin' : 'component-pin',
            instanceId: inst.id,
            pinId: p.id,
          },
        });
      if (model.kind === 'breadboard')
        for (const h of HOLES)
          pickPoints.push({
            p: new THREE.Vector3(),
            e: { kind: 'breadboard-hole', instanceId: inst.id, holeId: h.id },
          });
    }

    for (const [id, g] of s.groups)
      if (!seen.has(id)) {
        s.dispose(g);
        s.groups.delete(id);
      }

    // Reuse picking buffers while object/pin counts are unchanged.
    let mesh = s.pick;
    if (!mesh || mesh.count !== Math.max(1, pickPoints.length)) {
      if (mesh) {
        (mesh.material as THREE.Material).dispose();
        mesh.removeFromParent();
      }
      mesh = new THREE.InstancedMesh(
        GEO.pick,
        new THREE.MeshBasicMaterial({ visible: false }),
        Math.max(1, pickPoints.length),
      );
      s.scene.add(mesh);
      s.pick = mesh;
    }
    const m4 = new THREE.Matrix4();
    s.pickIndex = [];
    s.pickPos = new Float32Array(pickPoints.length * 3);
    const r0 = s.pickScale;
    pickPoints.forEach((pp, i) => {
      const wp = endpointPoint(pp.e, workbench, lookup);
      const x = wp ? wp.x : 0,
        y = wp ? wp.z : -999,
        z = wp ? wp.y : 0;
      s.pickPos[i * 3] = x;
      s.pickPos[i * 3 + 1] = y;
      s.pickPos[i * 3 + 2] = z;
      m4.makeScale(r0, r0, r0);
      m4.setPosition(x, y, z);
      mesh.setMatrixAt(i, m4);
      s.pickIndex.push(pp.e);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.userData.pickable = 'endpoint';
    mesh.frustumCulled = false;
    s.pick = mesh;
    mesh.computeBoundingSphere();

    // Wires.
    const liveWires = new Set(workbench.wires.map((w) => w.id));
    for (const [id, m] of s.wires)
      if (!liveWires.has(id)) {
        m.geometry.dispose();
        m.removeFromParent();
        s.wires.delete(id);
      }
    for (const wire of workbench.wires) {
      const a = endpointPoint(wire.a, workbench, lookup),
        b = endpointPoint(wire.b, workbench, lookup);
      if (!a || !b) continue;
      const va = new THREE.Vector3(a.x, a.z + 0.4, a.y),
        vb = new THREE.Vector3(b.x, b.z + 0.4, b.y);
      const lift = wire.lift ?? Math.min(22, va.distanceTo(vb) * 0.32 + 4);
      const route = wire.route.length
        ? wire.route.map(
            (p) => new THREE.Vector3(p.x, Math.max(va.y, vb.y) + lift, p.y),
          )
        : [
            va
              .clone()
              .lerp(vb, 0.28)
              .setY(Math.max(va.y, vb.y) + lift),
            va
              .clone()
              .lerp(vb, 0.72)
              .setY(Math.max(va.y, vb.y) + lift),
          ];
      const curve = new THREE.CatmullRomCurve3([va, ...route, vb]);
      const signature = JSON.stringify([
        va.toArray(),
        vb.toArray(),
        wire.route,
        lift,
      ]);
      const cached = s.wires.get(wire.id);
      const color =
        selectedWire === wire.id
          ? '#f59e0b'
          : highlightNet && netOf(wire.a) === highlightNet
            ? '#16a36b'
            : wire.color;
      if (cached && cached.userData.signature === signature) {
        cached.material = material(color, { roughness: 0.45 });
        continue;
      }
      const geo = new THREE.TubeGeometry(curve, 24, 0.5, 6, false);
      const existing = s.wires.get(wire.id);
      if (existing) {
        existing.geometry.dispose();
        existing.geometry = geo;
        existing.material = material(color, { roughness: 0.45 });
        existing.userData.signature = signature;
      } else {
        const mw = new THREE.Mesh(geo, material(color, { roughness: 0.45 }));
        mw.castShadow = true;
        mw.userData.signature = signature;
        mw.userData.pickable = 'wire';
        mw.userData.wireId = wire.id;
        s.scene.add(mw);
        s.wires.set(wire.id, mw);
      }
    }
    while (s.handles.children.length) s.dispose(s.handles.children[0]);
    if (highlightNet)
      for (const pp of pickPoints)
        if (netOf(pp.e) === highlightNet) {
          const at = endpointPoint(pp.e, workbench, lookup);
          if (!at) continue;
          const marker = new THREE.Mesh(
            GEO.highlight,
            material('#12b981', {
              emissive: '#12b981',
              emissiveIntensity: 0.2,
            }),
          );
          marker.position.set(at.x, at.z + 0.6, at.y);
          marker.raycast = () => {};
          s.handles.add(marker);
        }
    const selected = workbench.wires.find((w) => w.id === selectedWire);
    if (selected) {
      const a = endpointPoint(selected.a, workbench, lookup),
        b = endpointPoint(selected.b, workbench, lookup);
      if (a && b) {
        const pts = [
          { ...a, side: 'a' },
          { ...b, side: 'b' },
          ...selected.route.map((p, index) => ({
            ...p,
            z: Math.max(a.z, b.z) + (selected.lift ?? 18),
            side: String(index),
          })),
        ];
        for (const p of pts) {
          const handle = new THREE.Mesh(
            new THREE.SphereGeometry(1.8, 12, 8),
            material('#f59e0b'),
          );
          handle.position.set(p.x, p.z + 1, p.y);
          handle.userData = {
            pickable: 'handle',
            wireId: selected.id,
            side: p.side,
          };
          s.handles.add(handle);
        }
      }
    }
  }, [workbench, lookup, selection, selectedWire, highlightNet, netOf]);

  // ---------------- pointer interaction ----------------
  useEffect(() => {
    const s = state.current;
    const host = hostRef.current;
    if (!s || !host) return;
    const el = s.renderer.domElement;

    const ndc = (ev: PointerEvent) => {
      const r = el.getBoundingClientRect();
      return new THREE.Vector2(
        ((ev.clientX - r.left) / r.width) * 2 - 1,
        -((ev.clientY - r.top) / r.height) * 2 + 1,
      );
    };

    /** Nearest hit wins, so a pin behind a body is never picked. */
    const m4 = new THREE.Matrix4();
    const hit = (ev: PointerEvent) => {
      s.raycaster.setFromCamera(ndc(ev), s.camera);
      // Pick radius follows the zoom level: precise up close, grabbable far away.
      // The matrices are only rewritten when the radius actually changed, so a
      // pointer move over a dense scene costs one raycast, not 1800 writes.
      const dist = s.camera.position.distanceTo(s.controls.target);
      const pixelSize =
        (2 * dist * Math.tan(THREE.MathUtils.degToRad(s.camera.fov / 2))) /
        (el.clientHeight || 520);
      const r = Math.max(0.45, Math.min(1.05, pixelSize * 6));
      if (s.pick && Math.abs(r - s.pickScale) > s.pickScale * 0.06) {
        for (let i = 0; i < s.pick.count; i++) {
          m4.makeScale(r, r, r);
          m4.setPosition(
            s.pickPos[i * 3],
            s.pickPos[i * 3 + 1],
            s.pickPos[i * 3 + 2],
          );
          s.pick.setMatrixAt(i, m4);
        }
        s.pick.instanceMatrix.needsUpdate = true;
        s.pickScale = r;
      }
      // Explicit target list: the raycaster never walks lights, the table plane
      // grid or anything else that cannot be picked.
      const targets: THREE.Object3D[] = [];
      if (s.pick) targets.push(s.pick);
      targets.push(s.handles);
      for (const g of s.groups.values()) targets.push(g.userData.pickProxy);
      for (const m of s.wires.values()) targets.push(m);
      targets.push(
        ...s.scene.children.filter((o) => o.userData.pickable === 'table'),
      );
      const hits = s.raycaster.intersectObjects(targets, true);
      const handleHit = hits.find(
        (h) => h.object.userData.pickable === 'handle',
      );
      if (handleHit)
        return {
          kind: 'handle' as const,
          id: handleHit.object.userData.wireId as string,
          side: handleHit.object.userData.side as string,
          point: handleHit.point,
        };
      for (const h of hits) {
        const kind = h.object.userData.pickable;
        if (
          kind === 'endpoint' &&
          h.instanceId !== undefined &&
          h.instanceId !== null
        )
          return {
            kind: 'endpoint' as const,
            endpoint: s.pickIndex[h.instanceId],
            point: h.point,
          };
        if (kind === 'body') {
          let o: THREE.Object3D | null = h.object;
          while (o && !o.userData.instanceId) o = o.parent;
          if (o?.userData.instanceId)
            return {
              kind: 'instance' as const,
              id: o.userData.instanceId as string,
              point: h.point,
            };
        }
        if (kind === 'wire')
          return {
            kind: 'wire' as const,
            id: h.object.userData.wireId as string,
            point: h.point,
          };
        if (kind === 'table') return { kind: 'table' as const, point: h.point };
      }
      return null;
    };

    const block = (ev: Event) => {
      ev.preventDefault();
      ev.stopImmediatePropagation();
    };
    let editingPointer: number | null = null;
    const release = () => {
      const pointer = editingPointer;
      editingPointer = null;
      const drag = s.drag;
      s.drag = null;
      s.orbiting = false;
      s.controls.enabled = true;
      if (pointer !== null && el.hasPointerCapture(pointer))
        el.releasePointerCapture(pointer);
      if (drag?.moved) {
        if (drag.bend !== undefined)
          latest.current.onEditWire(drag.id, {}, true);
        else latest.current.onMove(drag.id, 0, 0, true);
      }
    };
    const onDown = (ev: PointerEvent) => {
      el.focus({ preventScroll: true });
      const nav = navigationRef.current;
      const intent = pointerIntent(
        nav.navigation,
        ev.button,
        nav.space,
        ev.shiftKey || ev.altKey || ev.ctrlKey || ev.metaKey,
      );
      if (intent !== 'edit') {
        release();
        s.controls.enabled = true;
        s.orbiting = true;
        s.controls.touches.ONE =
          intent === 'orbit' ? THREE.TOUCH.ROTATE : THREE.TOUCH.PAN;
        const modified = ev.shiftKey || ev.ctrlKey || ev.metaKey;
        s.controls.mouseButtons.LEFT =
          (intent === 'orbit') !== modified
            ? THREE.MOUSE.ROTATE
            : THREE.MOUSE.PAN;
        return;
      }
      if (ev.button !== 0) return;
      let h = hit(ev);
      const p = latest.current;
      if (h?.kind === 'endpoint' && p.tool === 'select')
        h = { kind: 'instance', id: h.endpoint.instanceId, point: h.point };
      if (h?.kind === 'table' || !h) {
        p.onSelectInstance(null);
        s.controls.enabled = true;
        s.orbiting = true;
        s.controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
        return;
      }
      block(ev);
      editingPointer = ev.pointerId;
      s.controls.enabled = false;
      el.setPointerCapture(ev.pointerId);
      const startDrag = (id: string, point: THREE.Vector3, bend?: number) => {
        s.raycaster.setFromCamera(ndc(ev), s.camera);
        const at = intersectDragPlane(s.raycaster.ray, point.y);
        if (at)
          s.drag = {
            id,
            last: at,
            height: point.y,
            startX: ev.clientX,
            startY: ev.clientY,
            pointerId: ev.pointerId,
            moved: false,
            bend,
          };
      };
      if (h.kind === 'handle') {
        if (h.side === 'a' || h.side === 'b') p.onRewire(h.id, h.side);
        else startDrag(h.id, h.point, Number(h.side));
      } else if (h.kind === 'wire') p.onSelectWire(h.id);
      else if (h.kind === 'endpoint') p.onPickEndpoint(h.endpoint);
      else if (h.kind === 'instance' && p.tool === 'select') {
        p.onSelectInstance(h.id);
        startDrag(h.id, h.point);
      }
    };
    const onMoveEv = (ev: PointerEvent) => {
      const p = latest.current,
        drag = s.drag;
      if (drag) {
        if (ev.pointerId !== drag.pointerId) return;
        block(ev);
        if (
          !drag.moved &&
          Math.hypot(ev.clientX - drag.startX, ev.clientY - drag.startY) < 4
        )
          return;
        drag.moved = true;
        s.raycaster.setFromCamera(ndc(ev), s.camera);
        const at = intersectDragPlane(s.raycaster.ray, drag.height);
        if (!at) return;
        if (drag.bend !== undefined) {
          const wire = p.workbench.wires.find((w) => w.id === drag.id);
          if (wire)
            p.onEditWire(
              wire.id,
              {
                route: wire.route.map((q, i) =>
                  i === drag.bend
                    ? {
                        x: q.x + at.x - drag.last.x,
                        y: q.y + at.z - drag.last.z,
                      }
                    : q,
                ),
              },
              false,
            );
        } else p.onMove(drag.id, at.x - drag.last.x, at.z - drag.last.z, false);
        drag.last.copy(at);
        return;
      }
      if (
        s.orbiting ||
        navigationRef.current.navigation !== 'edit' ||
        s.hoverQueued
      )
        return;
      s.hoverQueued = true;
      const cx = ev.clientX,
        cy = ev.clientY;
      requestAnimationFrame(() => {
        s.hoverQueued = false;
        if (s.orbiting || s.drag || state.current !== s) return;
        const h = hit({ clientX: cx, clientY: cy } as PointerEvent);
        p.onHoverEndpoint(h?.kind === 'endpoint' ? h.endpoint : null, {
          x: cx,
          y: cy,
        });
        el.style.cursor =
          h?.kind === 'endpoint' && p.tool !== 'select'
            ? 'crosshair'
            : h?.kind === 'instance' || h?.kind === 'endpoint'
              ? 'move'
              : 'grab';
      });
    };
    const doubleClick = (e: MouseEvent) => {
      const h = hit(e as PointerEvent);
      if (h?.kind === 'instance') latest.current.onFocus(h.id);
      else if (h?.kind === 'endpoint')
        latest.current.onFocus(h.endpoint.instanceId);
    };
    const leave = () => latest.current.onHoverEndpoint(null);
    const wheel = (ev: WheelEvent) => {
      if (s.drag) {
        block(ev);
        return;
      }
      if (
        navigationRef.current.inputMode === 'trackpad' &&
        !ev.ctrlKey &&
        !ev.metaKey
      ) {
        block(ev);
        const scale =
          ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? el.clientHeight : 1;
        s.controls.pan(-ev.deltaX * scale, -ev.deltaY * scale);
        s.dirty = true;
      }
    };
    const key = (ev: KeyboardEvent) => {
      if (document.activeElement !== el) return;
      if (ev.code === 'Space') {
        ev.preventDefault();
        navigationRef.current.space = true;
      }
      if (ev.key === 'Escape') release();
      if (ev.key.toLowerCase() === 'f') {
        ev.preventDefault();
        frameScene();
      }
      if (ev.key.toLowerCase() === 't') {
        ev.preventDefault();
        frameScene(true);
      }
    };
    const keyup = (ev: KeyboardEvent) => {
      if (ev.code === 'Space') navigationRef.current.space = false;
    };
    const blur = () => {
      navigationRef.current.space = false;
      release();
    };
    el.addEventListener('dblclick', doubleClick);
    el.addEventListener('pointerdown', onDown, true);
    el.addEventListener('pointermove', onMoveEv, true);
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('lostpointercapture', release);
    el.addEventListener('pointerleave', leave);
    el.addEventListener('wheel', wheel, { capture: true, passive: false });
    window.addEventListener('keydown', key);
    window.addEventListener('keyup', keyup);
    window.addEventListener('blur', blur);
    return () => {
      el.removeEventListener('dblclick', doubleClick);
      el.removeEventListener('pointerdown', onDown, true);
      el.removeEventListener('pointermove', onMoveEv, true);
      el.removeEventListener('pointerup', release);
      el.removeEventListener('pointercancel', release);
      el.removeEventListener('lostpointercapture', release);
      el.removeEventListener('pointerleave', leave);
      el.removeEventListener('wheel', wheel, true);
      window.removeEventListener('keydown', key);
      window.removeEventListener('keyup', keyup);
      window.removeEventListener('blur', blur);
    };
  }, [frameScene]);

  useEffect(() => {
    if (state.current) state.current.dirty = true;
  }, [props.showLabels, props.active]);

  useEffect(() => {
    const s = state.current;
    if (!s) return;
    for (const [id, g] of s.groups)
      g.traverse((o) => {
        if (o.userData.control === 'button')
          o.position.y = props.runtime.inputs?.buttons[id] ? 3.4 : 4;
        if (o.userData.control === 'pot')
          o.rotation.y =
            ((props.runtime.inputs?.pots[id] ?? 0.5) - 0.5) * Math.PI * 1.5;
        if (o instanceof THREE.Mesh && o.userData.lamp) {
          const m = o.material as THREE.MeshStandardMaterial;
          const value =
            o.userData.lamp === 'power'
              ? props.runtime.running
                ? 0.8
                : 0
              : o.userData.lamp === 'inactive'
                ? 0
                : (props.runtime.leds[id] ?? 0);
          m.emissiveIntensity = value * 3;
        }
      });
    s.dirty = true;
  }, [props.runtime, workbench]);

  useImperativeHandle(
    apiRef,
    () => ({
      resetCamera: () => frameScene(),
      focus: (id: string) => {
        const s = state.current;
        const inst = latest.current.workbench.instances.find(
          (i: Instance) => i.id === id,
        );
        if (!s || !inst) return;
        const model = latest.current.lookup(inst.modelId)!;
        const pose = effectiveTransform(
          inst,
          model,
          latest.current.workbench,
          latest.current.lookup,
        );
        const rot = pose.rot % 180 !== 0;
        const w = rot ? model.body.h : model.body.w,
          h = rot ? model.body.w : model.body.h;
        s.controls.target.copy(
          fitCamera(
            s.camera,
            { x: pose.x - w / 2, y: pose.y - h / 2, w, h },
            s.camera.position.clone().sub(s.controls.target),
            model.body.t + 12,
          ),
        );
        s.controls.update();
        s.dirty = true;
      },
      snapshot: () =>
        state.current?.renderer.domElement.toDataURL('image/png') ?? null,
    }),
    [frameScene],
  );

  return (
    <div className="wb-3d-wrap">
      <div ref={hostRef} className="wb-3d" data-testid="bench-3d" />
      <div className="wb-camera-controls" aria-label="3D navigation">
        {(['edit', 'pan', 'orbit'] as const).map((mode) => (
          <Button
            key={mode}
            size="sm"
            variant={navigation === mode ? 'default' : 'outline'}
            aria-pressed={navigation === mode}
            onClick={() => setNavigation(mode)}
          >
            {mode === 'edit'
              ? 'Edit parts'
              : mode === 'pan'
                ? 'Pan view'
                : 'Orbit view'}
          </Button>
        ))}
        <Button size="sm" variant="outline" onClick={() => frameScene()}>
          Fit · F
        </Button>
        <Button size="sm" variant="outline" onClick={() => frameScene(true)}>
          Top · T
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            const s = state.current;
            if (s) {
              s.controls.dollyIn(0.8);
              s.dirty = true;
            }
          }}
          aria-label="Zoom in"
        >
          ＋
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            const s = state.current;
            if (s) {
              s.controls.dollyOut(0.8);
              s.dirty = true;
            }
          }}
          aria-label="Zoom out"
        >
          −
        </Button>
        <select
          aria-label="Navigation input device"
          value={inputMode}
          onChange={(e) => setInputMode(e.target.value as 'mouse' | 'trackpad')}
        >
          <option value="trackpad">Trackpad</option>
          <option value="mouse">Mouse</option>
        </select>
      </div>
      <div className="wb-camera-help">
        {inputMode === 'trackpad'
          ? 'Two fingers: pan · Pinch: zoom'
          : 'Wheel: zoom · Middle drag: pan'}{' '}
        · Right drag: orbit · Space + drag: pan · Double-click: focus
      </div>
    </div>
  );
}

export { HOLE_MAP };
