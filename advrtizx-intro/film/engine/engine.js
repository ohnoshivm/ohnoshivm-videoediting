/* DOMINANT · engine/engine.js
   The renderer. A frame is a pure function of time:
     seek(f):  for k in 0..K-1 sub-frames across a 180-degree shutter ->  scenes.update(t_k)  ->  shadow pass -> MSAA scene pass(es)
               -> 2D overlay composite -> float32 accumulation          then   post (vignette, grain, the ONE sRGB encode) -> RGBA8.
   K is chosen per frame by the scenes (samples(t) hook): 1 on static holds, 8-32 on whips and slams. Everything is linear light until the post pass.
   No Math.random / Date / performance / rAF anywhere in here. */
import * as THREE from 'three';
import { U, GLSL_SRGB, makeMaterial } from './gfx.js';
import { CameraRig } from './camera.js';
import { defaultEnv, applyEnv, mergeEnv, sunVector } from './env.js';
import { RED_LIN, halton, hash01, makeRng, clamp } from './util.js';

export const W0 = 1920, H0 = 1080, FPS = 30, FRAMES = 1800;

const FS_VERT = /* glsl */ `
out vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const ACCUM_FRAG = /* glsl */ `
precision highp float;
${GLSL_SRGB}
uniform sampler2D tScene; uniform sampler2D tOverlay; uniform float uWeight; uniform float uOverlayOn;
in vec2 vUv; out vec4 outColor;
void main() {
  vec3 c = texture(tScene, vUv).rgb;
  if (uOverlayOn > 0.5) { vec4 o = texture(tOverlay, vUv); c = mix(c, srgbDecode(o.rgb), o.a); }
  outColor = vec4(c * uWeight, 1.0);
}`;

const POST_FRAG = /* glsl */ `
precision highp float;
${GLSL_SRGB}
uniform sampler2D tAccum; uniform vec2 uRes; uniform float uSeed; uniform float uGrain; uniform float uVig;
in vec2 vUv; out vec4 outColor;
float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h12(i), h12(i + vec2(1, 0)), f.x), mix(h12(i + vec2(0, 1)), h12(i + vec2(1, 1)), f.x), f.y); }
void main() {
  vec3 c = texture(tAccum, vUv).rgb;
  // vignette inside the palette: white loses its whiteness toward the corners (the red stays exactly red)
  vec2 q = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  float v = smoothstep(0.45, 1.30, length(q)) * uVig;
  float wh = min(c.g, c.b);
  c.gb -= vec2(wh * 0.50 * v);
  c.r *= 1.0 - 0.09 * v * smoothstep(0.04, 0.5, wh);
  vec3 e = srgbEncode(c);
  if (uGrain > 0.0) {
    vec2 px = gl_FragCoord.xy; vec2 sd = vec2(uSeed * 0.7311, uSeed * 1.3173);
    float n1 = h12(px + sd * 97.0) + h12(px * 1.0 + sd * 41.0 + 17.0) - 1.0;           // triangular, 1 px
    float n2 = vnoise(px * 0.62 + sd * 53.0) * 2.0 - 1.0;                               // soft clumps
    float n = n1 * 0.62 + n2 * 0.55;
    float amp = uGrain * (1.0 / 255.0) * mix(1.1, 4.6, smoothstep(0.0, 0.55, wh));
    e += n * amp;
  }
  outColor = vec4(e, 1.0);
}`;

const COPY_FRAG = /* glsl */ `
precision highp float; uniform sampler2D tSrc; in vec2 vUv; out vec4 outColor;
void main() { outColor = vec4(texture(tSrc, vUv).rgb, 1.0); }`;

export class Engine {
  /** opts: {canvas, scale (render scale, 1 = 1920x1080), msaa, kMin, kMax, kOverride, shutter, present} */
  constructor(opts = {}) {
    this.opts = { scale: 1, msaa: 4, kMin: 1, kMax: 32, kOverride: 0, shutter: 0.5, timeJitter: 0.55, present: false, ...opts };
    this.W = Math.round(W0 * this.opts.scale); this.H = Math.round(H0 * this.opts.scale);
    this.scenes = []; this.gated = new Set(); this.stats = { subframes: 0, K: 1 };
    this.ctx = null; this.f = 0;
  }

  async init(canvas, makeCtxExtras) {
    const { W, H } = this;
    this.canvas = canvas; canvas.width = W; canvas.height = H;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, depth: false, stencil: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    r.setPixelRatio(1); r.setSize(W, H, false); r.autoClear = false; r.toneMapping = THREE.NoToneMapping; r.outputColorSpace = THREE.LinearSRGBColorSpace;
    r.shadowMap.enabled = false;
    const gl = r.getContext(); const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    this.glInfo = { renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), version: gl.getParameter(gl.VERSION), maxSamples: gl.getParameter(gl.MAX_SAMPLES) };
    if (!r.capabilities.isWebGL2) throw new Error('WebGL2 required');
    if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('EXT_color_buffer_float required');
    gl.getExtension('EXT_float_blend');

    const samples = Math.min(this.opts.msaa, this.glInfo.maxSamples);
    const common = { depthBuffer: false, stencilBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false, colorSpace: THREE.NoColorSpace };
    this.rtScene = new THREE.WebGLRenderTarget(W, H, { ...common, type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: true, stencilBuffer: true, samples });   // stencil: planar reflections
    this.rtRefl = new THREE.WebGLRenderTarget(W, H, { ...common, type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: true, samples });   // planar reflection (see towers.js mirror twins)
    U.uReflTex.value = this.rtRefl.texture; U.uRes.value.set(W, H);
    this.rtAccum = new THREE.WebGLRenderTarget(W, H, { ...common, type: THREE.FloatType, format: THREE.RGBAFormat });
    this.rtOut = new THREE.WebGLRenderTarget(W, H, { ...common, type: THREE.UnsignedByteType, format: THREE.RGBAFormat });
    this.shadowRTs = new Map();
    // a valid (tiny) depth texture is ALWAYS bound to uShadowMap, otherwise draws are rejected when shadows are off
    this.dummyShadow = this.shadowRT(4); r.setRenderTarget(this.dummyShadow); r.clearDepth(); r.setRenderTarget(null);
    U.uShadowMap.value = this.dummyShadow.depthTexture;

    // full-screen passes
    const tri = new THREE.BufferGeometry(); tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const pass = (frag, uniforms, extra = {}) => { const m = makeMaterial({ vert: FS_VERT, frag, uniforms, depthTest: false, depthWrite: false, ...extra }); const mesh = new THREE.Mesh(tri, m); mesh.frustumCulled = false; const s = new THREE.Scene(); s.add(mesh); return { scene: s, mat: m }; };
    this.overlayCanvas = document.createElement('canvas'); this.overlayCanvas.width = W; this.overlayCanvas.height = H;
    this.overlayG = this.overlayCanvas.getContext('2d', { alpha: true, willReadFrequently: false });
    this.overlayTex = new THREE.CanvasTexture(this.overlayCanvas); this.overlayTex.colorSpace = THREE.NoColorSpace; this.overlayTex.generateMipmaps = false;
    this.overlayTex.minFilter = THREE.NearestFilter; this.overlayTex.magFilter = THREE.NearestFilter;
    this.accumPass = pass(ACCUM_FRAG, { tScene: { value: this.rtScene.texture }, tOverlay: { value: this.overlayTex }, uWeight: { value: 1 }, uOverlayOn: { value: 0 } },
      { blending: THREE.CustomBlending, transparent: true });
    this.accumPass.mat.blendEquation = THREE.AddEquation; this.accumPass.mat.blendSrc = THREE.OneFactor; this.accumPass.mat.blendDst = THREE.OneFactor;
    this.accumPass.mat.blendEquationAlpha = THREE.AddEquation; this.accumPass.mat.blendSrcAlpha = THREE.OneFactor; this.accumPass.mat.blendDstAlpha = THREE.OneFactor;
    this.postPass = pass(POST_FRAG, { tAccum: { value: this.rtAccum.texture }, uRes: { value: new THREE.Vector2(W, H) }, uSeed: { value: 0 }, uGrain: { value: 1 }, uVig: { value: 0.4 } });
    this.copyPass = pass(COPY_FRAG, { tSrc: { value: this.rtOut.texture } });

    // world
    this.root = new THREE.Scene(); this.root.background = null;
    this.cam3 = new THREE.PerspectiveCamera(40, W / H, 1, 80000); this.cam3.matrixAutoUpdate = false; this.cam3.matrixWorldAutoUpdate = false;
    this.shadowCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100); this.shadowCam.matrixAutoUpdate = false; this.shadowCam.matrixWorldAutoUpdate = false; this.shadowCam.layers.set(1);
    this.env = defaultEnv(); this.cam = new CameraRig(); this.views = null; this.overlayFns = [];
    this.clearCol = new THREE.Color(...RED_LIN);

    const this_ = this;
    this.ctx = {
      THREE, engine: this, renderer: r, U, W, H, scale: this.opts.scale, aspect: W / H, FPS, FRAMES,
      get cam() { return this_.cam; }, get env() { return this_.env; },
      get views() { return this_.views; }, set views(v) { this_.views = v; },
      makeCam: () => new CameraRig(), rng: makeRng, scene3d: this.root,
      gate: (obj) => { this.gated.add(obj); return obj; },
      defaultEnv,
    };
    if (makeCtxExtras) await makeCtxExtras(this.ctx);
    return this;
  }

  /* ──────────────────────────── scenes ──────────────────────────── */

  /** factory(ctx) -> {id,start,end,update,overlay?,samples?} (may be async). Registration order = draw/priority order (later wins). */
  async registerScene(factory, name = '') {
    const root = new THREE.Group(); root.name = name || 'scene'; this.root.add(root);
    const sctx = Object.create(this.ctx); sctx.root = root; sctx.name = name;
    const sc = await factory(sctx);
    sc.root = root; sc.ctx = sctx; sc.name = sc.id || name;
    this.scenes.push(sc);
    return sc;
  }
  activeScenes(f) { return this.scenes.filter((s) => f >= s.start - 1e-6 && f < s.end + 1 - 1e-6); }

  /* ──────────────────────────── shadow ──────────────────────────── */

  shadowRT(size) {
    let rt = this.shadowRTs.get(size);
    if (!rt) {
      const depth = new THREE.DepthTexture(size, size); depth.type = THREE.UnsignedIntType; depth.format = THREE.DepthFormat;
      depth.compareFunction = THREE.LessEqualCompare; depth.minFilter = THREE.LinearFilter; depth.magFilter = THREE.LinearFilter; depth.generateMipmaps = false;
      rt = new THREE.WebGLRenderTarget(size, size, { depthBuffer: true, depthTexture: depth, format: THREE.RedFormat, type: THREE.UnsignedByteType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false });
      this.shadowRTs.set(size, rt);
    }
    return rt;
  }
  renderShadow(env) {
    const sh = env.shadow;
    if (!sh.on) { U.uShadowParams.value.w = 0; U.uShadowMap.value = this.dummyShadow.depthTexture; return; }
    const rt = this.shadowRT(sh.size), R = sh.radius, d = sunVector(env.sun), c = sh.center;
    const cam = this.shadowCam, eye = new THREE.Vector3(c[0] + d.x * R * 1.05, c[1] + d.y * R * 1.05, c[2] + d.z * R * 1.05);
    const m = new THREE.Matrix4().lookAt(eye, new THREE.Vector3(...c), Math.abs(d.y) > 0.98 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0)); m.setPosition(eye);
    cam.matrixWorld.copy(m); cam.matrixWorldInverse.copy(m).invert();
    cam.projectionMatrix.makeOrthographic(-R, R, R, -R, 0.1, R * 2.2); cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
    const swapped = [];
    this.root.traverseVisible((o) => { if (o.isMesh && o.userData.shadowMaterial && o.layers.isEnabled(1)) { swapped.push([o, o.material]); o.material = o.userData.shadowMaterial; } });
    const r = this.renderer;
    r.setRenderTarget(rt); r.setViewport(0, 0, sh.size, sh.size); r.setScissorTest(false); r.clearDepth();
    r.render(this.root, cam);
    for (const [o, mat] of swapped) o.material = mat;
    U.uShadowMat.value.copy(cam.projectionMatrix).multiply(cam.matrixWorldInverse);
    U.uShadowMap.value = rt.depthTexture;
    U.uShadowParams.value.set(sh.bias, sh.normalBias, 1 / sh.size, 1);
  }

  /* ──────────────────────────── reflection ──────────────────────────── */

  hasReflectors() { let any = false; this.root.traverseVisible((o) => { if (!any && o.isMesh && o.layers.isEnabled(2)) any = true; }); return any; }
  /** Renders the mirror twins (layer 2) with the current camera into rtReflect over the given viewport rect (px, GL origin). */
  renderReflection(vp, clear) {
    const r = this.renderer;
    r.setRenderTarget(this.rtRefl); r.setClearColor(0x000000, 0);
    if (vp) { r.setViewport(...vp); r.setScissorTest(true); r.setScissor(...vp); } else { r.setViewport(0, 0, this.W, this.H); r.setScissorTest(false); }
    if (clear) r.clear(true, true, false); else r.clearDepth();
    this.cam3.layers.set(2); r.render(this.root, this.cam3); this.cam3.layers.set(0);
    r.setScissorTest(false);
  }

  /* ──────────────────────────── frame ──────────────────────────── */

  pickK(f, act) {
    const o = this.opts; if (o.kOverride) return o.kOverride;
    let k = 1;
    for (const s of act) if (s.samples) { const v = s.samples(f); if (v > k) k = v; }
    return Math.max(o.kMin, Math.min(o.kMax, Math.round(k)));
  }

  /** Render frame f (fractional OK) to rtOut. Pure function of f. */
  seek(f) {
    const r = this.renderer, { W, H } = this, o = this.opts;
    this.f = f;
    const act = this.activeScenes(f);
    const K = this.pickK(f, act); this.stats.K = K; this.stats.subframes += K;
    r.setRenderTarget(this.rtAccum); r.setViewport(0, 0, W, H); r.setScissorTest(false); r.setClearColor(0x000000, 0); r.clear(true, false, false);
    const fi = Math.round(f * 1000);
    for (let k = 0; k < K; k++) {
      // 180-degree shutter centred on f; stratified jitter turns ghosting steps into noise
      const u = K > 1 ? 0.5 + (hash01(fi * 131 + k, 7) - 0.5) * o.timeJitter : 0.5;
      const t = f + o.shutter * ((k + u) / K - 0.5);
      const jx = K > 1 ? (halton(k + 1, 2) - 0.5) : 0, jy = K > 1 ? (halton(k + 1, 3) - 0.5) : 0;
      this.subframe(t, act, jx, jy, 1 / K);
    }
    // post
    const env = this.lastEnv;
    this.postPass.mat.uniforms.uSeed.value = (fi % 100003) / 1000; this.postPass.mat.uniforms.uGrain.value = env.post.grain; this.postPass.mat.uniforms.uVig.value = env.post.vignette;
    r.setRenderTarget(this.rtOut); r.setViewport(0, 0, W, H); r.setScissorTest(false); r.render(this.postPass.scene, this.fsCam);
    if (o.present) { r.setRenderTarget(null); r.setViewport(0, 0, W, H); r.render(this.copyPass.scene, this.fsCam); }
  }

  subframe(t, act, jx, jy, weight) {
    const r = this.renderer, { W, H } = this;
    // reset per-sub-frame state, let scenes set ALL of it from t
    Object.assign(this.env, defaultEnv()); this.cam.reset(); this.views = null;
    for (const s of this.scenes) s.root.visible = false;
    for (const g of this.gated) g.visible = true;
    let overlay = false; const overlayScenes = [];
    for (const s of act) { s.root.visible = true; s.update(t); if (s.overlay) overlayScenes.push(s); }
    const env = this.lastEnv = this.env;
    // time uniform for GPU animations (kits read uTime)
    U.uTime.value = t;
    applyEnv(env);
    // shadow (once per sub-frame for single-view scenes)
    const views = this.views && this.views.length ? this.views : null;
    if (!views) this.renderShadow(env);
    // scene pass
    r.setRenderTarget(this.rtScene); r.setClearColor(this.clearCol, 1);
    r.setScissorTest(false); r.setViewport(0, 0, W, H); r.clear(true, true, true);
    const aspect = W / H;
    const reflOn = this.hasReflectors(); U.uReflOn.value = reflOn ? 1 : 0;
    if (!views) {
      this.cam.apply(this.cam3, aspect, (jx * 2) / W, (jy * 2) / H);
      if (reflOn) { this.renderReflection(null, true); r.setRenderTarget(this.rtScene); }
      r.render(this.root, this.cam3);
    } else {
      const saved = new Map(); for (const g of this.gated) saved.set(g, g.visible);
      for (const v of views) {
        const [vx, vy, vw, vh] = v.rect, px = Math.round(vx * W), pw = Math.round((vx + vw) * W) - px, py = Math.round(vy * H), ph = Math.round((vy + vh) * H) - py;
        const bottom = H - py - ph;
        for (const g of this.gated) g.visible = v.only ? v.only.includes(g) : saved.get(g);
        const venv = mergeEnv(env, v.env); applyEnv(venv);
        this.renderShadow(venv);
        r.setRenderTarget(this.rtScene);
        r.setViewport(px, bottom, pw, ph); r.setScissorTest(true); r.setScissor(px, bottom, pw, ph);
        if (v.bg) { r.setClearColor(new THREE.Color(...v.bg), 1); r.clear(true, true, true); r.setClearColor(this.clearCol, 1); } else { r.clearDepth(); r.clearStencil(); }
        (v.cam || this.cam).apply(this.cam3, pw / ph, (jx * 2) / pw, (jy * 2) / ph);
        if (reflOn) { this.renderReflection([px, bottom, pw, ph], v === views[0]); r.setRenderTarget(this.rtScene); r.setViewport(px, bottom, pw, ph); r.setScissorTest(true); r.setScissor(px, bottom, pw, ph); }
        r.render(this.root, this.cam3);
      }
      for (const [g, vis] of saved) g.visible = vis;
      r.setScissorTest(false); r.setViewport(0, 0, W, H);
    }
    // 2D overlay (type that slams in 2D): drawn per sub-frame so it is motion-blurred with everything else
    if (overlayScenes.length) {
      const g = this.overlayG; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H); g.setTransform(W / W0, 0, 0, W / W0, 0, 0);
      for (const s of overlayScenes) { g.save(); const used = s.overlay(t, g); g.restore(); if (used !== false) overlay = true; }
      if (overlay) this.overlayTex.needsUpdate = true;
    }
    // accumulate
    const am = this.accumPass.mat.uniforms; am.uWeight.value = weight; am.uOverlayOn.value = overlay ? 1 : 0;
    r.setRenderTarget(this.rtAccum); r.setViewport(0, 0, W, H); r.setScissorTest(false);
    r.render(this.accumPass.scene, this.fsCam);
  }

  /* ──────────────────────────── capture ──────────────────────────── */

  /** RGBA8 bytes of the last rendered frame, bottom row first (GL order). */
  readPixels(buf) {
    const { W, H } = this; buf = buf || new Uint8Array(W * H * 4);
    this.renderer.readRenderTargetPixels(this.rtOut, 0, 0, W, H, buf);
    return buf;
  }
}
