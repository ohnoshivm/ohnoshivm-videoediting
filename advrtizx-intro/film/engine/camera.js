/* DOMINANT · engine/camera.js
   CameraRig: a plain data object a scene writes every update (pos, look, fov, roll, ortho, shake), plus pure helpers for
   cranes, orbits, whips and dolly-zoom-to-orthographic. The engine turns the rig into view/projection matrices per sub-frame. */
import * as THREE from 'three';
import { DEG, EASE, clamp, lerp } from './util.js';

const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), _e = new THREE.Vector3(), _m = new THREE.Matrix4();
const _q = new THREE.Quaternion(), _qs = new THREE.Quaternion(), _qm = new THREE.Quaternion(), _p = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);

export class CameraRig {
  constructor() { this.reset(); }
  /** Back to defaults. The engine calls this on ctx.cam before every sub-frame. */
  reset() {
    this.pos = [0, 2, 14];       // metres, world (y up)
    this.look = [0, 20, 0];      // look-at target
    this.fov = 40;               // vertical field of view in degrees (perspective)
    this.roll = 0;               // degrees about the view axis
    this.ortho = 0;              // 0 = perspective, 1 = true orthographic (uses orthoHeight)
    this.orthoHeight = 100;      // visible world height (m) when ortho = 1
    this.near = 1; this.far = 80000;
    this.shift = [0, 0];         // lens shift as a fraction of the frustum (architectural / rising front)
    this.shake = null;           // {yaw,pitch,roll,x,y,z} from util.shake()/rumble(): degrees + metres
    return this;
  }
  set(o) { Object.assign(this, o); return this; }
  clone() { const c = new CameraRig(); Object.assign(c, JSON.parse(JSON.stringify({ pos: this.pos, look: this.look, fov: this.fov, roll: this.roll, ortho: this.ortho, orthoHeight: this.orthoHeight, near: this.near, far: this.far, shift: this.shift }))); c.shake = this.shake; return c; }

  /** Writes matrixWorld, matrixWorldInverse, projectionMatrix on a three camera. jitter in NDC units (sub-pixel AA / motion-blur dither). */
  apply(cam, aspect, jx = 0, jy = 0) {
    const s = this.shake;
    _e.set(this.pos[0] + (s ? s.x : 0), this.pos[1] + (s ? s.y : 0), this.pos[2] + (s ? s.z : 0));
    _f.set(this.look[0] - this.pos[0], this.look[1] - this.pos[1], this.look[2] - this.pos[2]);
    if (_f.lengthSq() < 1e-12) _f.set(0, 0, -1);
    _f.normalize();
    if (Math.abs(_f.y) > 0.99995) _r.set(1, 0, 0); else _r.crossVectors(_f, UP).normalize();
    _u.crossVectors(_r, _f).normalize();
    _m.makeBasis(_r, _u, _f.clone().negate());
    _q.setFromRotationMatrix(_m);
    // roll about the view axis, then shake (camera-local yaw/pitch/roll)
    _qs.setFromAxisAngle(new THREE.Vector3(0, 0, 1), (this.roll + (s ? s.roll : 0)) * DEG); _q.multiply(_qs);
    if (s && (s.yaw || s.pitch)) {
      _qs.setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.yaw * DEG); _q.multiply(_qs);
      _qs.setFromAxisAngle(new THREE.Vector3(1, 0, 0), s.pitch * DEG); _q.multiply(_qs);
    }
    cam.matrixWorld.compose(_e, _q, new THREE.Vector3(1, 1, 1));
    cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
    cam.position.copy(_e); cam.quaternion.copy(_q);
    const near = this.near, far = this.far;
    if (this.ortho >= 0.999) {
      const hh = this.orthoHeight / 2, hw = hh * aspect;
      _p.makeOrthographic(-hw + this.shift[0] * hw * 2, hw + this.shift[0] * hw * 2, hh + this.shift[1] * hh * 2, -hh + this.shift[1] * hh * 2, near, far);
    } else {
      const top = near * Math.tan(this.fov * 0.5 * DEG), right = top * aspect;
      _p.makePerspective(-right + this.shift[0] * right * 2, right + this.shift[0] * right * 2, top + this.shift[1] * top * 2, -top + this.shift[1] * top * 2, near, far);
    }
    if (jx || jy) { // clip-space translation: x += jx*w, y += jy*w
      const e = _p.elements;
      for (let c = 0; c < 4; c++) { e[c * 4 + 0] += jx * e[c * 4 + 3]; e[c * 4 + 1] += jy * e[c * 4 + 3]; }
    }
    cam.projectionMatrix.copy(_p);
    cam.projectionMatrixInverse.copy(_p).invert();
    return cam;
  }
}

/* ───────────────────────────────── helpers ───────────────────────────────── */

/** Point on a sphere: azimuth (deg, 0 = +z axis, 90 = +x), elevation (deg above horizon). Returns [x,y,z]. */
export function orbit(center, radius, azDeg, elDeg) {
  const a = azDeg * DEG, e = elDeg * DEG;
  return [center[0] + radius * Math.sin(a) * Math.cos(e), center[1] + radius * Math.sin(e), center[2] + radius * Math.cos(a) * Math.cos(e)];
}

/** Whip-pan progress 0..1 over [a,b]: dead start, violent middle, dead stop. Pair with samples(t) >= 12 for the streak. */
export const whip = (t, a, b) => EASE.whip(clamp((t - a) / (b - a)));
/** Normalised whip speed 0..1 (peak in the middle): for roll kicks, FOV punch and blur strength. */
export function whipSpeed(t, a, b) {
  const u = clamp((t - a) / (b - a)), h = 1e-3; if (u <= 0 || u >= 1) return 0;
  const v = (EASE.whip(clamp(u + h)) - EASE.whip(clamp(u - h))) / (2 * h);
  return clamp(v / 3.2);
}

/** Dolly zoom: keep a subject plane's visible height `h` (metres) constant while the lens goes fov0 -> fov1 (degrees).
    p in 0..1 (apply your own ease). Returns {fov, dist}: place the camera `dist` metres from the subject along the view axis.
    With fov1 <= ~1.5 deg the image is orthographic for all practical purposes; set cam.ortho = 1 (orthoHeight = h) on the last frame(s). */
export function dollyZoom(p, { h, fov0 = 38, fov1 = 1, tangent = true }) {
  const t0 = Math.tan(fov0 * 0.5 * DEG), t1 = Math.tan(fov1 * 0.5 * DEG);
  const th = tangent ? lerp(t0, t1, p) : Math.tan(lerp(fov0, fov1, p) * 0.5 * DEG);
  return { fov: 2 * Math.atan(th) / DEG, dist: h * 0.5 / th };
}

/** Frame a vertical extent: distance for a camera with vertical fov (deg) to see `height` metres at the subject. */
export const distForHeight = (height, fov = 40) => (height * 0.5) / Math.tan(fov * 0.5 * DEG);
