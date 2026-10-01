"""dsp.py - DSP primitives for the TRUE ANGLE score (numpy + scipy only, no samples).

Everything here is deterministic. Randomness always comes from `rng_for(...)`, which
derives child generators from numpy's default_rng seed 345 (TREATMENT 5.1).
"""
from __future__ import annotations

import numpy as np
from scipy import ndimage, signal, special

SR = 48_000
FPS = 30
SPF = SR // FPS                 # 1600 samples per picture frame
DURATION_S = 60
N_TOTAL = DURATION_S * SR       # 2,880,000
SEED = 345


def f2s(frame: float) -> int:
    """Sample-accurate frame -> sample (TREATMENT 5.1): round(frame/30*48000)."""
    return int(round(frame / FPS * SR))


def dbl(x):
    return 10.0 ** (np.asarray(x, dtype=float) / 20.0)


def ldb(x):
    return 20.0 * np.log10(np.maximum(np.abs(x), 1e-12))


def rng_for(*key) -> np.random.Generator:
    """Deterministic child RNG of default_rng(345)."""
    return np.random.default_rng(np.random.SeedSequence(SEED, spawn_key=tuple(int(k) for k in key)))


# --------------------------------------------------------------------------------------
# Easing: real cubic-beziers (TREATMENT 2.6), solved x->t by dense table + interpolation
# --------------------------------------------------------------------------------------
class Bezier:
    def __init__(self, x1, y1, x2, y2, n=40001):
        t = np.linspace(0.0, 1.0, n)
        self.xs = 3 * (1 - t) ** 2 * t * x1 + 3 * (1 - t) * t ** 2 * x2 + t ** 3
        self.ys = 3 * (1 - t) ** 2 * t * y1 + 3 * (1 - t) * t ** 2 * y2 + t ** 3

    def __call__(self, p):
        return np.interp(np.clip(p, 0.0, 1.0), self.xs, self.ys)

    def inverse(self, y):
        """eased value -> time fraction (curves here are monotonic)."""
        return np.interp(np.clip(y, 0.0, 1.0), self.ys, self.xs)


class _Linear:
    def __call__(self, p):
        return np.clip(p, 0.0, 1.0)

    inverse = __call__


EASE = {
    "DRAFT": Bezier(0.65, 0, 0.35, 1),
    "SET": Bezier(0.16, 1, 0.3, 1),
    "LIFT": Bezier(0.7, 0, 0.84, 0),
    "HINGE": Bezier(0.83, 0, 0.17, 1),
    "BRAKE": Bezier(0.05, 0.7, 0.1, 1),
    "SCROLL": Bezier(0.7, 0, 0.05, 1),
    "TAUT": Bezier(0.3, 0, 0, 1),
    "SURVEY": _Linear(),
}


def ease_curve(name: str, n: int) -> np.ndarray:
    """Eased progress sampled at the n samples of an n-sample event."""
    x = (np.arange(n) + 0.5) / n
    return EASE[name](x)


def speed_curve(prog: np.ndarray) -> np.ndarray:
    """Normalised speed (derivative of eased progress), peak = 1."""
    v = np.gradient(prog)
    m = v.max()
    return v / m if m > 0 else v


# --------------------------------------------------------------------------------------
# Noise
# --------------------------------------------------------------------------------------
def white(n, rng):
    return rng.standard_normal(n)


def pink(n, rng):
    """1/f noise by FFT shaping, unit RMS."""
    m = n + (n % 2)
    X = np.fft.rfft(rng.standard_normal(m))
    f = np.arange(len(X), dtype=float)
    f[0] = 1.0
    X /= np.sqrt(f)
    X[0] = 0.0
    x = np.fft.irfft(X, m)[:n]
    return x / (np.std(x) + 1e-12)


def brown(n, rng):
    x = signal.lfilter([1.0], [1.0, -0.9995], rng.standard_normal(n))
    sos = signal.butter(2, 20.0, "highpass", fs=SR, output="sos")
    x = signal.sosfilt(sos, x)
    return x / (np.std(x) + 1e-12)


# --------------------------------------------------------------------------------------
# Filters
# --------------------------------------------------------------------------------------
def biquad_coefs(kind, fc, q=0.70710678):
    w0 = 2 * np.pi * fc / SR
    alpha = np.sin(w0) / (2 * q)
    c = np.cos(w0)
    if kind == "lp":
        b = [(1 - c) / 2, 1 - c, (1 - c) / 2]
    elif kind == "hp":
        b = [(1 + c) / 2, -(1 + c), (1 + c) / 2]
    elif kind == "bp":        # constant 0 dB peak gain
        b = [alpha, 0.0, -alpha]
    else:
        raise ValueError(kind)
    a = [1 + alpha, -2 * c, 1 - alpha]
    return np.array(b) / a[0], np.array(a) / a[0]


def biquad(x, kind, fc, q=0.70710678):
    b, a = biquad_coefs(kind, fc, q)
    return signal.lfilter(b, a, x, axis=0)


def butter(x, kind, fc, order=2):
    sos = signal.butter(order, fc, kind, fs=SR, output="sos")
    return signal.sosfilt(sos, x, axis=0)


def svf(x, fc, q=0.70710678, mode="lp"):
    """TPT state-variable filter with per-sample cutoff (exact under fast sweeps).
    mode: lp | bp (0 dB peak) | hp.  Pure-python loop; fine for the few seconds that sweep."""
    x = np.asarray(x, dtype=float)
    n = len(x)
    fc = np.broadcast_to(np.asarray(fc, dtype=float), (n,))
    qv = np.broadcast_to(np.asarray(q, dtype=float), (n,))
    g = np.tan(np.pi * np.clip(fc, 5.0, 0.45 * SR) / SR)
    k = 1.0 / qv
    a1 = 1.0 / (1.0 + g * (g + k))
    a2 = g * a1
    a3 = g * a2
    xl, a1l, a2l, a3l = x.tolist(), a1.tolist(), a2.tolist(), a3.tolist()
    v1o = [0.0] * n
    v2o = [0.0] * n
    ic1 = ic2 = 0.0
    for i in range(n):
        v3 = xl[i] - ic2
        v1 = a1l[i] * ic1 + a2l[i] * v3
        v2 = ic2 + a2l[i] * ic1 + a3l[i] * v3
        ic1 = 2.0 * v1 - ic1
        ic2 = 2.0 * v2 - ic2
        v1o[i] = v1
        v2o[i] = v2
    v1a = np.asarray(v1o)
    v2a = np.asarray(v2o)
    if mode == "lp":
        return v2a
    if mode == "bp":
        return k * v1a
    return x - k * v1a - v2a


# --------------------------------------------------------------------------------------
# Oscillators (band-limited by construction: additive only, never naive saws/squares)
# --------------------------------------------------------------------------------------
def phase_acc(f, n):
    f = np.broadcast_to(np.asarray(f, dtype=float), (n,))
    ph = np.empty(n)
    ph[0] = 0.0
    np.cumsum(f[:-1], out=ph[1:])
    return 2 * np.pi * ph / SR


def saw_add(f, n, nharm=10, phase0=0.0, max_hz=0.45 * SR):
    """Additive sawtooth, nharm partials, partials above max_hz dropped per-sample."""
    fa = np.broadcast_to(np.asarray(f, dtype=float), (n,))
    ph = phase_acc(fa, n) + phase0
    out = np.zeros(n)
    for k in range(1, nharm + 1):
        mask = (k * fa) < max_hz
        out += np.where(mask, np.sin(k * ph) / k, 0.0)
    return out * (2 / np.pi)


_JGRID = np.linspace(0.0, 8.0, 16001)
_JCACHE: dict = {}


def _jk(k, idx):
    """Bessel J_k(idx) by table interpolation (smooth in idx; exact to ~1e-8)."""
    ka = abs(k)
    if ka not in _JCACHE:
        _JCACHE[ka] = special.jv(ka, _JGRID)
    v = np.interp(idx, _JGRID, _JCACHE[ka])
    return v if (k >= 0 or ka % 2 == 0) else -v


def fm_add(fc, ratio, index, n, amp=None, max_hz=18000.0, kmax=9):
    """Band-limited FM: sum_k J_k(I(t)) sin(2 pi (fc + k fm) t), sidebands above max_hz dropped.
    `index` scalar or per-sample array; `amp` per-sample amplitude envelope."""
    t = np.arange(n) / SR
    fm = fc * ratio
    idx = np.broadcast_to(np.asarray(index, dtype=float), (n,))
    out = np.zeros(n)
    for k in range(-kmax, kmax + 1):
        fk = fc + k * fm
        if abs(fk) >= max_hz or abs(fk) < 1.0:
            continue
        out += _jk(k, idx) * np.sin(2 * np.pi * fk * t)
    if amp is not None:
        out = out * amp
    return out


# --------------------------------------------------------------------------------------
# Envelopes / fades / levels
# --------------------------------------------------------------------------------------
def expdecay(n, tau):
    return np.exp(-np.arange(n) / (tau * SR))


def fade_io(x, fi=0.001, fo=0.005):
    """Raised-cosine fade in/out (seconds). Works on mono or (n,2)."""
    x = np.array(x, dtype=float, copy=True)
    n = x.shape[0]
    a = min(int(round(fi * SR)), n // 2)
    b = min(int(round(fo * SR)), n // 2)
    shape = (-1,) + (1,) * (x.ndim - 1)
    if a > 0:
        x[:a] *= (0.5 - 0.5 * np.cos(np.pi * np.arange(a) / a)).reshape(shape)
    if b > 0:
        x[n - b:] *= (0.5 + 0.5 * np.cos(np.pi * (np.arange(b) + 1) / b)).reshape(shape)
    return x


def peak_to(x, db_target):
    p = float(np.max(np.abs(x)))
    return x * (float(dbl(db_target)) / p) if p > 0 else x


def curve_db(points, frame0, n):
    """Piecewise-linear (frame, dB) control points -> per-sample linear gain over an event
    that starts at `frame0` and lasts n samples. Holds the end values outside the points."""
    fr = np.array([p[0] for p in points], dtype=float)
    db_ = np.array([p[1] for p in points], dtype=float)
    t_frames = frame0 + np.arange(n) / SPF
    return dbl(np.interp(t_frames, fr, db_))


def curve_log(points, frame0, n):
    """Piecewise control points interpolated in log-domain (for filter cutoffs)."""
    fr = np.array([p[0] for p in points], dtype=float)
    v = np.log(np.array([p[1] for p in points], dtype=float))
    t_frames = frame0 + np.arange(n) / SPF
    return np.exp(np.interp(t_frames, fr, v))


# --------------------------------------------------------------------------------------
# Stereo
# --------------------------------------------------------------------------------------
def pan_gains(p):
    th = (np.asarray(p, dtype=float) + 1.0) * np.pi / 4.0
    return np.cos(th), np.sin(th)


def to_stereo(x, pan=0.0, haas_ms=0.0):
    """Equal-power pan (scalar or per-sample) + optional Haas delay on the far channel only,
    so the lead channel keeps the exact transient sample."""
    gl, gr = pan_gains(pan)
    L = x * gl
    R = x * gr
    d = int(round(haas_ms * SR / 1000.0))
    if d > 0:
        pm = float(np.mean(pan))
        if pm >= 0:   # right louder -> delay left (far) channel
            L = np.concatenate([np.zeros(d), L])[: len(x)]
        else:
            R = np.concatenate([np.zeros(d), R])[: len(x)]
    return np.stack([L, R], axis=1)


def bass_mono(st, fc=120.0):
    """Mono-ise everything below ~fc (zero-phase LR-style split; high band keeps its width)."""
    sos = signal.butter(2, fc, "lowpass", fs=SR, output="sos")
    low = signal.sosfiltfilt(sos, st, axis=0)
    mono = low.mean(axis=1, keepdims=True)
    return st - low + mono


# --------------------------------------------------------------------------------------
# Synthetic reverb: stereo, exponentially decaying band-split Gaussian noise
# --------------------------------------------------------------------------------------
def make_ir(t60, seed_key, predelay=0.012, lp_hz=7000.0, hp_hz=150.0):
    """TREATMENT 5.1: exponentially decaying Gaussian noise, LP 7 kHz, 12 ms predelay.
    Extras for realism: HF decays faster than LF, sparse early reflections, soft onset."""
    rng = rng_for(*seed_key)
    n = int((predelay + 1.15 * t60) * SR)
    t60 = t60 * 0.95          # calibration: the band-split noise measures ~5% long, so land on the nominal T60
    t = np.arange(n) / SR - predelay
    tt = np.maximum(t, 0.0)
    out = np.zeros((n, 2))
    k60 = 6.907755 / 1.0
    sos_lo = signal.butter(2, 400.0, "lowpass", fs=SR, output="sos")
    sos_mid = signal.butter(2, [400.0, 3000.0], "bandpass", fs=SR, output="sos")
    sos_hi = signal.butter(2, 3000.0, "highpass", fs=SR, output="sos")
    sos_lp = signal.butter(2, lp_hz, "lowpass", fs=SR, output="sos")
    sos_hp = signal.butter(2, hp_hz, "highpass", fs=SR, output="sos")
    for ch in range(2):
        w = rng.standard_normal(n)
        y = (signal.sosfilt(sos_lo, w) * np.exp(-k60 * tt / (t60 * 1.25))
             + signal.sosfilt(sos_mid, w) * np.exp(-k60 * tt / t60) * 1.4
             + signal.sosfilt(sos_hi, w) * np.exp(-k60 * tt / (t60 * 0.55)) * 0.9)
        y *= 1.0 - np.exp(-tt / 0.004)               # soft onset
        y[t < 0] = 0.0
        # early reflections: ~10 taps in the first 70 ms
        ref = np.zeros(n)
        times = predelay + 0.004 + np.sort(rng.uniform(0.0, 0.066, 10))
        for tr in times:
            i = int(tr * SR)
            ref[i] += rng.choice([-1.0, 1.0]) * rng.uniform(0.5, 1.0) * np.exp(-(tr - predelay) / 0.035) * 6.0
        ref = signal.sosfilt(signal.butter(1, 4500.0, "lowpass", fs=SR, output="sos"), ref)
        y = y + ref * np.std(y[: int(0.2 * SR)] if n > 0.2 * SR else y)
        y = signal.sosfilt(sos_lp, signal.sosfilt(sos_lp, y))   # LP 7 kHz (4th order)
        y = signal.sosfilt(sos_hp, y)
        out[:, ch] = y
    out /= np.sqrt(np.sum(out ** 2, axis=0, keepdims=True))      # unit energy per channel
    return out


# --------------------------------------------------------------------------------------
# Dynamics: compressor, soft clip, true-peak limiter
# --------------------------------------------------------------------------------------
def compressor_gain(x, thr_db=-18.0, ratio=2.0, attack_ms=10.0, release_ms=120.0, knee_db=6.0, ctrl=16):
    """Feed-forward linked peak compressor. Returns the per-sample linear gain curve."""
    n = x.shape[0]
    a = np.abs(x).max(axis=1)
    nb = (n + ctrl - 1) // ctrl
    pad = nb * ctrl - n
    if pad:
        a = np.concatenate([a, np.zeros(pad)])
    env_in = a.reshape(nb, ctrl).max(axis=1)
    att = np.exp(-1.0 / (attack_ms * 1e-3 * SR / ctrl))
    rel = np.exp(-1.0 / (release_ms * 1e-3 * SR / ctrl))
    env = np.empty(nb)
    e = 0.0
    ei = env_in.tolist()
    for i in range(nb):
        v = ei[i]
        c = att if v > e else rel
        e = v + c * (e - v)
        env[i] = e
    lvl = 20 * np.log10(np.maximum(env, 1e-9))
    over = lvl - thr_db
    slope = 1.0 - 1.0 / ratio
    gr = np.where(over <= -knee_db / 2, 0.0,
                  np.where(over >= knee_db / 2, slope * over,
                           slope * (over + knee_db / 2) ** 2 / (2 * knee_db)))
    gain_ctrl = 10 ** (-gr / 20.0)
    pos = (np.arange(nb) + 0.5) * ctrl
    g = np.interp(np.arange(n), pos, gain_ctrl)
    return g


def softclip_gain(x, drive=1.2):
    """Linked tanh(a x)/tanh(a) expressed as a per-sample gain on max(|L|,|R|) (so stems that
    share this gain still sum to the master exactly)."""
    m = np.abs(x).max(axis=1)
    safe = np.maximum(m, 1e-9)
    g = np.tanh(drive * safe) / (np.tanh(drive) * safe)
    g = np.where(m < 1e-9, drive / np.tanh(drive), g)
    return g


def _peak_release(d, lam, block=4096):
    n = len(d)
    out = np.empty(n)
    idx = np.arange(block)
    w_inv = lam ** (-idx.astype(float))
    w = lam ** idx.astype(float)
    carry = 0.0
    for s in range(0, n, block):
        blk = d[s:s + block].copy()
        m = len(blk)
        blk[0] = max(blk[0], carry * lam)
        v = np.maximum.accumulate(blk * w_inv[:m]) * w[:m]
        out[s:s + m] = v
        carry = v[-1]
    return out


def true_peak_linear(x, os=4):
    up = signal.resample_poly(x, os, 1, axis=0)
    return float(np.abs(up).max())


def limiter_gain(x, ceiling_db=-1.2, lookahead_ms=2.0, release_ms=90.0, os=4):
    """Look-ahead brick-wall limiter keyed on the 4x-oversampled (true) peak, linked stereo.
    gain = 1 - release_hold( moving_average( sliding_min(required) ) ): the moving average of the
    sliding minimum can never exceed the gain a peak demands, so the ceiling is guaranteed."""
    n = x.shape[0]
    ceil = float(dbl(ceiling_db))
    up = signal.resample_poly(x, os, 1, axis=0)
    pk = np.abs(up).max(axis=1)[: n * os].reshape(n, os).max(axis=1)
    need = np.minimum(1.0, ceil / np.maximum(pk, 1e-12))
    L = max(1, int(lookahead_ms * 1e-3 * SR))
    W = L + 1
    needp = np.concatenate([need, np.ones(L)])
    gmin = ndimage.minimum_filter1d(needp, size=W, origin=-(W // 2), mode="nearest")[:n]
    cs = np.concatenate([[0.0], np.concatenate([np.ones(L), gmin]).cumsum()])
    gs = (cs[L + 1:L + 1 + n] - cs[0:n]) / W      # mean of gmin[i-L .. i]
    d = 1.0 - gs
    lam = np.exp(-1.0 / (release_ms * 1e-3 * SR))
    d = _peak_release(d, lam)
    return 1.0 - d


# --------------------------------------------------------------------------------------
# ITU-R BS.1770-4 / EBU R128 loudness (K-weighting, 400 ms blocks, -70 abs / -10 rel gates)
# --------------------------------------------------------------------------------------
_K1B = [1.53512485958697, -2.69169618940638, 1.19839281085285]
_K1A = [1.0, -1.69065929318241, 0.73248077421585]
_K2B = [1.0, -2.0, 1.0]
_K2A = [1.0, -1.99004745483398, 0.99007225036621]


def k_weight(x):
    y = signal.lfilter(_K1B, _K1A, x, axis=0)
    return signal.lfilter(_K2B, _K2A, y, axis=0)


def integrated_lufs(x):
    z = k_weight(x)
    W, H = int(0.4 * SR), int(0.1 * SR)
    cs = np.vstack([np.zeros((1, z.shape[1])), np.cumsum(z ** 2, axis=0)])
    starts = np.arange(0, z.shape[0] - W + 1, H)
    ms = (cs[starts + W] - cs[starts]) / W            # (blocks, ch)
    e = ms.sum(axis=1)
    lj = -0.691 + 10 * np.log10(np.maximum(e, 1e-12))
    g1 = lj > -70.0
    if not g1.any():
        return -120.0
    rel = -0.691 + 10 * np.log10(np.mean(e[g1])) - 10.0
    g2 = lj > max(rel, -70.0)
    return -0.691 + 10 * np.log10(np.mean(e[g2]))
