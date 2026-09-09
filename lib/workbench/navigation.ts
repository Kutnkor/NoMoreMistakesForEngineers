import { PerspectiveCamera, Vector3, Plane, Ray, MathUtils } from 'three';
export type CameraPose = { position: number[]; target: number[] };
export type NavigationMode = 'edit' | 'pan' | 'orbit';
export type PointerIntent = 'edit' | 'pan' | 'orbit';
export function pointerIntent(
  mode: NavigationMode,
  button: number,
  space: boolean,
  modifier: boolean,
): PointerIntent {
  if (button === 2 || modifier) return 'orbit';
  if (button === 1 || space || mode === 'pan') return 'pan';
  return mode === 'orbit' ? 'orbit' : 'edit';
}
export function intersectDragPlane(ray: Ray, height: number): Vector3 | null {
  if (Math.abs(ray.direction.y) < 0.02) return null;
  return ray.intersectPlane(
    new Plane(new Vector3(0, 1, 0), -height),
    new Vector3(),
  );
}
/** Fit all eight bounds corners in the actual viewport, including portrait panes. */
export function fitCamera(
  camera: PerspectiveCamera,
  b: { x: number; y: number; w: number; h: number },
  direction = new Vector3(0.65, 1, 0.8),
  height = 30,
) {
  const target = new Vector3(b.x + b.w / 2, height / 2, b.y + b.h / 2);
  const forward = direction.clone().normalize();
  const right = new Vector3()
    .crossVectors(new Vector3(0, 1, 0), forward)
    .normalize();
  const up = new Vector3().crossVectors(forward, right).normalize();
  const v = Math.tan(MathUtils.degToRad(camera.fov / 2)),
    h = v * Math.max(0.1, camera.aspect);
  let distance = 20;
  for (const x of [b.x, b.x + b.w])
    for (const z of [b.y, b.y + b.h])
      for (const y of [0, height]) {
        const p = new Vector3(x, y, z).sub(target);
        distance = Math.max(
          distance,
          p.dot(forward) +
            Math.max(Math.abs(p.dot(right)) / h, Math.abs(p.dot(up)) / v) *
              1.18,
        );
      }
  camera.position.copy(target).addScaledVector(forward, distance);
  camera.lookAt(target);
  camera.updateMatrixWorld();
  return target;
}
