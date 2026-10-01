"""dsp.py - DSP primitives for the DOMINANT score (numpy + scipy; numba optional for speed).

Everything is deterministic: randomness only comes from `rng_for(...)` (SeedSequence-keyed children of one
master seed). Nothing here uses samples or licensed audio.

Layout
  grid / levels / rng .... f2s, dbl, ldb, rng_for
  noise ................... white / pink / brown
  filters ................. butterworth SOS helpers, TPT state-variable filter with per-sample cutoff (numba), RBJ biquads
  oscillators ............. band-limited wavetable saw / square / pulse (mip-mapped by harmonic count), FM, modal banks
  oversampling ............ 4x polyphase (Kaiser, ~100 dB) wrapper used for EVERY nonlinearity
  stereo .................. equal-power pan, mid/side width, Haas, bass-mono
  reverb .................. synthetic hall impulse responses (frequency dependent T60, pre-delay, decorrelated 2x2)
  dynamics ................ compressor gain, oversampled soft clip, 4x look-ahead true-peak limiter
  loudness ................ ITU-R BS.1770-4 K-weighted integrated / short-term loudness, true peak
"""
from __future__ import annotations

import os

import numpy as np
from scipy import fft as sfft
from scipy import ndimage, signal

# --------------------------------------------------------------------------------------
# numba (optional). ADVRTIZX_NO_NUMBA=1 forces the pure-python fallback (identical results, slower).
# --------------------------------------------------------------------------------------
HAVE_NUMBA = False
if os.environ.get("ADVRTIZX_NO_NUMBA", "") != "1":
    try:
        import numba

        HAVE_NUMBA = True

        def jit(fn):
            return numba.njit(cache=True)(fn)
    except Exception:  # pragma: no cover - numba missing
        pass
if not HAVE_NUMBA:
    def jit(fn):  # type: ignore[misc]
        return fn

# --------------------------------------------------------------------------------------
# grid
# --------------------------------------------------------------------------------------
SR = 48_000
FPS = 30
SPF = SR // FPS                    # 1600 samples per picture frame
DURATION_S = 60
N_TOTAL = DURATION_S * SR          # 2,880,000
SEED = 1125                        # 112.5 BPM
TWO_PI = 2.0 * np.pi


def f2s(frame) -> int:
    """Sample-accurate frame -> sample: round(frame * 1600)."""
    return int(round(float(frame) * SPF))


def s2f(sample) -> float:
    return float(sample) / SPF


def dbl(db):
    return 10.0 ** (np.asarray(db, dtype=float) / 20.0)


def ldb(x):
    return 20.0 * np.log10(np.maximum(np.abs(x), 1e-12))


def rng_for(*key) -> np.random.Generator:
    """Deterministic child generator keyed by ints (and stable strings)."""
    ks = []
    for k in key:
        if isinstance(k, str):
            k = sum((i + 1) * ord(c) for i, c in enumerate(k)) % 2_000_003
        ks.append(int(k))
    return np.random.default_rng(np.random.SeedSequence(SEED, spawn_key=tuple(ks)))


def midi_hz(m):
    return 440.0 * 2.0 ** ((np.asarray(m, dtype=float) - 69.0) / 12.0)


_NOTE = {"C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "F": 5, "F#": 6, "Gb": 6, "G": 7, "G#": 8,
         "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11}


def note_hz(name: str) -> float:
    """'A1' -> 55.0, 'C#4' -> 277.18, 'Bb2' ... (A4 = 440, equal temperament)."""
    pc = name[:-1]
    octv = int(name[-1])
    return float(midi_hz(12 * (octv + 1) + _NOTE[pc]))


# --------------------------------------------------------------------------------------
# noise
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
    """1/f^2 noise (leaky integrator + 20 Hz HP), unit RMS."""
    x = signal.lfilter([1.0], [1.0, -0.9995], rng.standard_normal(n))
    sos = signal.butter(2, 20.0, "highpass", fs=SR, output="sos")
    x = signal.sosfilt(sos, x)
    return x / (np.std(x) + 1e-12)


# --------------------------------------------------------------------------------------
# filters
# --------------------------------------------------------------------------------------
_SOS_CACHE: dict = {}


def _sos(kind, fc, order):
    key = (kind, tuple(np.atleast_1d(fc).tolist()), order)
    s = _SOS_CACHE.get(key)
    if s is None:
        s = signal.butter(order, fc, kind, fs=SR, output="sos")
        _SOS_CACHE[key] = s
    return s


def lp(x, fc, order=4):
    return signal.sosfilt(_sos("lowpass", float(fc), order), x, axis=0)


def hp(x, fc, order=4):
    return signal.sosfilt(_sos("highpass", float(fc), order), x, axis=0)


def bp(x, lo, hi, order=2):
    return signal.sosfilt(_sos("bandpass", (float(lo), float(hi)), order), x, axis=0)


def lp0(x, fc, order=4):
    """zero-phase low-pass (use on short, isolated event buffers only)."""
    return signal.sosfiltfilt(_sos("lowpass", float(fc), order), x, axis=0)


@jit
def _svf_core(x, g, k, mode, out):
    ic1 = 0.0
    ic2 = 0.0
    for i in range(x.shape[0]):
        gi = g[i]
        ki = k[i]
        a1 = 1.0 / (1.0 + gi * (gi + ki))
        a2 = gi * a1
        a3 = gi * a2
        v3 = x[i] - ic2
        v1 = a1 * ic1 + a2 * v3
        v2 = ic2 + a2 * ic1 + a3 * v3
        ic1 = 2.0 * v1 - ic1
        ic2 = 2.0 * v2 - ic2
        if mode == 0:
            out[i] = v2
        elif mode == 1:
            out[i] = ki * v1
        else:
            out[i] = x[i] - ki * v1 - v2


def svf(x, fc, q=0.70710678, mode="lp"):
    """Zavalishin TPT state-variable filter, per-sample cutoff/Q (exact under fast sweeps).
    mode: 'lp' | 'bp' (0 dB peak) | 'hp'. 12 dB/oct; cascade for steeper."""
    x = np.ascontiguousarray(x, dtype=np.float64)
    n = x.shape[0]
    fc = np.broadcast_to(np.asarray(fc, dtype=np.float64), (n,))
    q = np.broadcast_to(np.asarray(q, dtype=np.float64), (n,))
    g = np.ascontiguousarray(np.tan(np.pi * np.clip(fc, 5.0, 0.45 * SR) / SR))
    k = np.ascontiguousarray(1.0 / q)
    out = np.empty(n, dtype=np.float64)
    _svf_core(x, g, k, {"lp": 0, "bp": 1, "hp": 2}[mode], out)
    return out


def svf4(x, fc, q=0.70710678, mode="lp"):
    """24 dB/oct (two cascaded SVFs; Q applied to the second so the resonance stays musical)."""
    return svf(svf(x, fc, 0.70710678, mode), fc, q, mode)


def biquad_peq(x, fc, q, gain_db):
    """RBJ peaking EQ."""
    A = 10 ** (gain_db / 40.0)
    w0 = TWO_PI * fc / SR
    al = np.sin(w0) / (2 * q)
    c = np.cos(w0)
    b = np.array([1 + al * A, -2 * c, 1 - al * A])
    a = np.array([1 + al / A, -2 * c, 1 - al / A])
    return signal.lfilter(b / a[0], a / a[0], x, axis=0)


def biquad_shelf(x, fc, gain_db, kind="high", s=0.9):
    """RBJ shelving EQ."""
    A = 10 ** (gain_db / 40.0)
    w0 = TWO_PI * fc / SR
    c, sn = np.cos(w0), np.sin(w0)
    al = sn / 2 * np.sqrt((A + 1 / A) * (1 / s - 1) + 2)
    sq = 2 * np.sqrt(A) * al
    if kind == "high":
        b = [A * ((A + 1) + (A - 1) * c + sq), -2 * A * ((A - 1) + (A + 1) * c), A * ((A + 1) + (A - 1) * c - sq)]
        a = [(A + 1) - (A - 1) * c + sq, 2 * ((A - 1) - (A + 1) * c), (A + 1) - (A - 1) * c - sq]
    else:
        b = [A * ((A + 1) - (A - 1) * c + sq), 2 * A * ((A - 1) - (A + 1) * c), A * ((A + 1) - (A - 1) * c - sq)]
        a = [(A + 1) + (A - 1) * c + sq, -2 * ((A - 1) + (A + 1) * c), (A + 1) + (A - 1) * c - sq]
    b = np.array(b, float)
    a = np.array(a, float)
    return signal.lfilter(b / a[0], a / a[0], x, axis=0)


# --------------------------------------------------------------------------------------
# envelopes and fades
# --------------------------------------------------------------------------------------
def exp_env(n, tau, attack=0.0004):
    """exp(-t/tau) with a raised-cosine attack (seconds); exponent clamped so no denormals."""
    t = np.arange(n) / SR
    e = np.exp(-np.minimum(t / tau, 60.0))
    na = int(attack * SR)
    if na > 1:
        e[:na] *= 0.5 - 0.5 * np.cos(np.pi * np.arange(na) / na)
    return e


def fade_io(x, fi=0.001, fo=0.005):
    """raised-cosine fade in/out (seconds); works on (n,) and (n,2)."""
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


def smooth_curve(x, ms):
    """Hann-smoothed copy of a control curve (edge-padded)."""
    k = max(1, int(ms * 1e-3 * SR))
    if k < 2:
        return x
    w = np.hanning(2 * k + 1)
    w /= w.sum()
    return np.convolve(np.pad(x, k, mode="edge"), w, mode="valid")


def peak_to(x, db):
    p = float(np.max(np.abs(x)))
    return x * (float(dbl(db)) / p) if p > 0 else x


def lerp_curve(points, n, x0=0.0, x1=1.0):
    """piecewise-linear control curve over n samples from (pos, value) points with pos in [x0, x1]."""
    pos = np.array([p[0] for p in points], dtype=float)
    val = np.array([p[1] for p in points], dtype=float)
    u = x0 + (x1 - x0) * np.arange(n) / max(1, n - 1)
    return np.interp(u, pos, val)


# --------------------------------------------------------------------------------------
# oscillators: band-limited wavetables (additive by construction), FM, modal banks
# --------------------------------------------------------------------------------------
_WT_N = 4096
_WT_CACHE: dict = {}


def _wt(kind, nh):
    """band-limited single-cycle table with nh harmonics (Lanczos-windowed). 'saw': falling ramp in [-1, 1];
    'square': +-1."""
    key = (kind, nh)
    t = _WT_CACHE.get(key)
    if t is None:
        h = np.arange(1, nh + 1, dtype=float)
        sig = np.sinc(h / (nh + 1.0))                     # Lanczos sigma: tames Gibbs ripple at the band edge
        spec = np.zeros(_WT_N // 2 + 1, dtype=complex)
        if kind == "saw":
            amp = (2.0 / np.pi) / h
        elif kind == "square":
            amp = np.where(h % 2 == 1, (4.0 / np.pi) / h, 0.0)
        else:
            raise ValueError(kind)
        spec[1:nh + 1] = -1j * amp * sig * (_WT_N / 2.0)
        tab = np.fft.irfft(spec, _WT_N)
        t = np.append(tab, tab[0])
        _WT_CACHE[key] = t
    return t


def _nh_for(fmax):
    nh = int(0.46 * SR / max(float(fmax), 1.0))
    nh = max(1, min(nh, _WT_N // 2 - 2))
    # bucket to ~1/3 octave so the cache stays small
    b = int(round(np.log2(nh) * 3))
    return max(1, min(int(round(2 ** (b / 3.0))), _WT_N // 2 - 2))


def phase_acc(f, n, phase0=0.0):
    """cycles (not radians) per sample accumulated: phase[i] = phase0 + sum_{j<i} f[j]/SR."""
    f = np.broadcast_to(np.asarray(f, dtype=float), (n,))
    ph = np.empty(n)
    ph[0] = phase0
    if n > 1:
        np.cumsum(f[:-1] / SR, out=ph[1:])
        ph[1:] += phase0
    return ph


def _wt_read(tab, ph):
    x = (ph - np.floor(ph)) * _WT_N
    i = x.astype(np.int64)
    fr = x - i
    return tab[i] * (1.0 - fr) + tab[i + 1] * fr


def osc_saw(f, n, phase0=0.0):
    """Band-limited saw (rising ramp feel), harmonics kept below ~0.46*SR for the highest frequency used."""
    fmax = float(np.max(f)) if np.ndim(f) else float(f)
    tab = _wt("saw", _nh_for(fmax))
    return _wt_read(tab, phase_acc(f, n, phase0))


def osc_square(f, n, phase0=0.0):
    fmax = float(np.max(f)) if np.ndim(f) else float(f)
    tab = _wt("square", _nh_for(fmax))
    return _wt_read(tab, phase_acc(f, n, phase0))


def osc_pulse(f, n, width=0.5, phase0=0.0):
    """band-limited pulse = saw(x) - saw(x + w)."""
    fmax = float(np.max(f)) if np.ndim(f) else float(f)
    tab = _wt("saw", _nh_for(fmax))
    ph = phase_acc(f, n, phase0)
    w = np.broadcast_to(np.asarray(width, dtype=float), (n,))
    return 0.5 * (_wt_read(tab, ph) - _wt_read(tab, ph + w))


def modal_bank(freqs, taus, amps, n, rng=None, jitter=0.0, phases=None, start_sine=True):
    """Sum of exponentially decaying sinusoids (a struck body). All modes start at zero phase (sine) so
    the strike is a clean impulsive onset with no step. jitter = fractional random detune."""
    t = np.arange(n) / SR
    out = np.zeros(n)
    for i, (f, tau, a) in enumerate(zip(freqs, taus, amps)):
        if f >= 0.46 * SR:
            continue
        fj = f * (1.0 + (rng.uniform(-jitter, jitter) if (rng is not None and jitter) else 0.0))
        ph0 = 0.0 if phases is None else phases[i]
        m = min(n, int(min(tau * 12.0, n / SR + 1.0) * SR))
        tt = t[:m]
        out[:m] += a * np.sin(TWO_PI * fj * tt + ph0) * np.exp(-tt / tau)
    return out


def fm_tone(fc, ratio, index, n, os=2, amp=None, fb=0.0):
    """Two-operator FM computed at os-times oversampling then decimated (alias-safe). `index` scalar/array."""
    N = n * os
    t = np.arange(N) / (SR * os)
    idx = np.broadcast_to(np.asarray(index, dtype=float), (n,))
    if os > 1:
        idx = np.repeat(idx, os)
    fcv = np.asarray(fc, dtype=float)
    if fcv.ndim:
        fcv = np.repeat(fcv, os) if os > 1 else fcv
        ph_c = TWO_PI * np.cumsum(fcv) / (SR * os)
        ph_m = ph_c * ratio
    else:
        ph_c = TWO_PI * float(fcv) * t
        ph_m = ph_c * ratio
    y = np.sin(ph_c + idx * np.sin(ph_m))
    if os > 1:
        y = down(y, os)
    if amp is not None:
        y = y * amp
    return y


# --------------------------------------------------------------------------------------
# oversampling (4x polyphase with a Kaiser FIR, ~100 dB image rejection) - used by every nonlinearity
# --------------------------------------------------------------------------------------
def _os_fir(os):
    """unity-DC-gain Kaiser FIR (beta 9.5, ~98 dB) for the os-times rate; resample_poly applies the x`up` gain."""
    taps = 64 * os + 1
    return signal.firwin(taps, 0.90 / os, window=("kaiser", 9.5))


_OS_H = {os: _os_fir(os) for os in (2, 4, 8)}


def up(x, os=4):
    return signal.resample_poly(x, os, 1, window=_OS_H[os], axis=0)


def down(x, os=4):
    return signal.resample_poly(x, 1, os, window=_OS_H[os], axis=0)


def oversampled(x, fn, os=4):
    """y = D(fn(U(x))): run a memoryless nonlinearity at os-times the sample rate."""
    return down(fn(up(x, os)), os)


def tanh_os(x, drive=1.0, os=4):
    """normalised oversampled tanh: tanh(d x) / tanh(d) * (peak-preserving at |x| = 1)."""
    d = float(drive)
    return oversampled(x, lambda u: np.tanh(d * u) / np.tanh(d), os)


def asym_sat_os(x, drive=1.0, bias=0.15, os=4):
    """asymmetric (even + odd harmonic) saturation, DC-blocked; for sub weight."""
    d = float(drive)

    def fn(u):
        y = np.tanh(d * (u + bias)) - np.tanh(d * bias)
        return y / np.tanh(d)
    y = oversampled(x, fn, os)
    return signal.sosfilt(_sos("highpass", 12.0, 2), y, axis=0)


# --------------------------------------------------------------------------------------
# stereo
# --------------------------------------------------------------------------------------
def pan_gains(p):
    th = (np.asarray(p, dtype=float) + 1.0) * np.pi / 4.0
    return np.cos(th), np.sin(th)


def to_stereo(x, pan=0.0):
    gl, gr = pan_gains(pan)
    return np.stack([x * gl, x * gr], axis=1)


def haas(x, ms=0.4, side="r"):
    d = int(round(ms * SR / 1000.0))
    if d <= 0:
        return x
    y = x.copy()
    ch = 1 if side == "r" else 0
    y[:, ch] = np.concatenate([np.zeros(d), x[:-d, ch]])
    return y


def width(st, w):
    """mid/side width (1 = unchanged)."""
    m = 0.5 * (st[:, 0] + st[:, 1])
    s = 0.5 * (st[:, 0] - st[:, 1]) * w
    return np.stack([m + s, m - s], axis=1)


def bass_mono(st, fc=120.0):
    """Everything below ~fc to mono (zero-phase 4th-order split; the high band keeps its width)."""
    sos = _sos("lowpass", fc, 4)
    low = signal.sosfiltfilt(sos, st, axis=0)
    mono = low.mean(axis=1, keepdims=True)
    return st - low + mono


def decorrelate(x, rng, amount=1.0, lo=250.0):
    """mono -> stereo by complementary random-phase all-pass-ish FIR (keeps magnitude, scrambles phase)
    above `lo`; below it both channels stay identical (mono bass)."""
    n = len(x)
    m = 1 << int(np.ceil(np.log2(n + 8)))
    X = np.fft.rfft(x, m)
    f = np.fft.rfftfreq(m, 1.0 / SR)
    w = np.clip((f - lo) / lo, 0.0, 1.0)                   # 0 below lo, 1 above 2*lo
    ph = rng.uniform(-np.pi, np.pi, len(f)) * amount * w
    L = np.fft.irfft(X * np.exp(1j * ph), m)[:n]
    R = np.fft.irfft(X * np.exp(-1j * ph), m)[:n]
    return np.stack([L, R], axis=1)


# --------------------------------------------------------------------------------------
# reverb: synthetic hall impulse responses + convolution
# --------------------------------------------------------------------------------------
_HALL_CENTERS = np.array([62.5, 125.0, 250.0, 500.0, 1000.0, 2000.0, 4000.0, 8000.0, 16000.0])
_HALL_MULT = np.array([0.55, 0.80, 1.00, 1.00, 1.00, 0.86, 0.62, 0.40, 0.22])


def make_hall_ir(t60, predelay=0.020, seed=(100,), mult=None, length_factor=1.12, onset_ms=14.0,
                 er_count=28, er_span=0.090, er_level=0.20, hp_hz=110.0, lp_hz=11000.0):
    """Synthetic hall IR matrix (n, 4) = [LL, LR, RL, RR]: independent Gaussian noise per path, shaped by a
    frequency-dependent exponential decay (T60 per octave band: long mids, shorter lows/highs), a smooth
    diffuse build-up after the pre-delay and a sparse early-reflection group. Each path has energy 0.5, so
    a mono input yields a unit-energy, fully decorrelated stereo return."""
    rng = rng_for(*seed)
    mult = _HALL_MULT if mult is None else np.asarray(mult, float)
    n = sfft.next_fast_len(int((predelay + t60 * length_factor) * SR), real=True)
    tt = np.maximum(np.arange(n) / SR - predelay, 0.0)
    freqs = np.fft.rfftfreq(n, 1.0 / SR)
    lf = np.log2(np.maximum(freqs, 1.0) / 62.5)            # octave position relative to the first centre
    ir = np.zeros((n, 4))
    onset = 1.0 - np.exp(-tt / (onset_ms * 1e-3))
    onset[np.arange(n) / SR < predelay] = 0.0
    k60 = 6.907755
    for p in range(4):
        X = np.fft.rfft(rng.standard_normal(n))
        y = np.zeros(n)
        for b in range(len(_HALL_CENTERS)):
            d = lf - b
            w = np.where(np.abs(d) < 1.0, np.cos(0.5 * np.pi * d) ** 2, 0.0)
            if b == 0:
                w = np.where(d < 0, 1.0, w)
            if b == len(_HALL_CENTERS) - 1:
                w = np.where(d > 0, 1.0, w)
            xb = np.fft.irfft(X * w, n)
            y += xb * np.exp(-np.minimum(k60 * tt / (t60 * mult[b]), 60.0))
        y *= onset
        # early reflections
        er = np.zeros(n)
        times = predelay + 0.003 + np.sort(rng.uniform(0.0, er_span - 0.003, er_count))
        for tr in times:
            i = int(tr * SR)
            er[i] += rng.choice([-1.0, 1.0]) * rng.uniform(0.4, 1.0) * np.exp(-(tr - predelay) / 0.045)
        er = signal.sosfilt(_sos("lowpass", 5500.0, 2), er)
        y = y / (np.sqrt(np.sum(y ** 2)) + 1e-12) + er_level * er / (np.sqrt(np.sum(er ** 2)) + 1e-12)
        y = signal.sosfilt(_sos("highpass", hp_hz, 2), y)
        y = signal.sosfilt(_sos("lowpass", lp_hz, 2), y)
        ir[:, p] = y / (np.sqrt(np.sum(y ** 2)) + 1e-12) * np.sqrt(0.5)
    return ir


def conv_stereo(st, ir, out_len=None):
    """wet_L = LL*L + RL*R ; wet_R = LR*L + RR*R, full tail kept (or clipped to out_len)."""
    L, R = st[:, 0], st[:, 1]
    n = len(st) if out_len is None else out_len
    outL = signal.fftconvolve(L, ir[:, 0])[:n] + signal.fftconvolve(R, ir[:, 2])[:n]
    outR = signal.fftconvolve(L, ir[:, 1])[:n] + signal.fftconvolve(R, ir[:, 3])[:n]
    return np.stack([outL, outR], axis=1)


def reverse_swell(src_mono, ir, length_s, tail_fade_ms=3.0):
    """reverse-reverb swell: conv(src, hall) -> keep `length_s` -> reverse. The result ramps up from silence
    to its loudest point at the very end (place it so that end lands on the hit)."""
    n = int(length_s * SR)
    st = np.stack([src_mono, src_mono], axis=1)
    wet = conv_stereo(st, ir, out_len=max(n, len(src_mono)))[:n]
    rev = wet[::-1].copy()
    return fade_io(rev, 0.02, tail_fade_ms * 1e-3)


# --------------------------------------------------------------------------------------
# dynamics
# --------------------------------------------------------------------------------------
def compressor_gain(x, thr_db=-18.0, ratio=2.0, attack_ms=10.0, release_ms=120.0, knee_db=6.0, ctrl=16):
    """Feed-forward linked peak compressor; returns the per-sample linear gain curve."""
    n = x.shape[0]
    a = np.abs(x).max(axis=1)
    nb = (n + ctrl - 1) // ctrl
    pad = nb * ctrl - n
    if pad:
        a = np.concatenate([a, np.zeros(pad)])
    env_in = a.reshape(nb, ctrl).max(axis=1)
    att = np.exp(-1.0 / (attack_ms * 1e-3 * SR / ctrl))
    rel = np.exp(-1.0 / (release_ms * 1e-3 * SR / ctrl))
    env = _smooth_env(env_in, att, rel)
    lvl = 20 * np.log10(np.maximum(env, 1e-9))
    over = lvl - thr_db
    slope = 1.0 - 1.0 / ratio
    gr = np.where(over <= -knee_db / 2, 0.0,
                  np.where(over >= knee_db / 2, slope * over, slope * (over + knee_db / 2) ** 2 / (2 * knee_db)))
    gain_ctrl = 10 ** (-gr / 20.0)
    pos = (np.arange(nb) + 0.5) * ctrl
    return np.interp(np.arange(n), pos, gain_ctrl)


@jit
def _smooth_env(env_in, att, rel):
    out = np.empty_like(env_in)
    e = 0.0
    for i in range(env_in.shape[0]):
        v = env_in[i]
        c = att if v > e else rel
        e = v + c * (e - v)
        out[i] = e
    return out


def softclip_gain(x, knee=0.7, os=4):
    """Linked, 4x-oversampled soft clipper expressed as a gain curve on max(|L|,|R|):
    below `knee` the gain is 1 (transparent), above it a tanh shoulder rounds the peak to <= 1.0.
    The conservative (min) gain over the 4 oversampled points is kept per sample."""
    n = x.shape[0]
    u = signal.resample_poly(x, os, 1, window=_OS_H[os], axis=0)
    m = np.abs(u).max(axis=1)
    over = np.maximum(m - knee, 0.0)
    head = 1.0 - knee
    y = np.where(m <= knee, m, knee + head * np.tanh(over / head))
    g = np.where(m > 1e-9, y / np.maximum(m, 1e-9), 1.0)
    g = g[: n * os].reshape(n, os).min(axis=1)
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
    up_ = signal.resample_poly(x, os, 1, axis=0)
    return float(np.abs(up_).max())


def limiter_gain(x, ceiling_db=-1.25, lookahead_ms=2.0, release_ms=90.0, os=4):
    """Look-ahead brick-wall limiter keyed on the 4x-oversampled (true) peak, linked stereo.
    gain = 1 - release_hold( moving_average( sliding_min(required) ) ): the moving average of a sliding minimum
    can never exceed the gain a peak demands, so the ceiling is guaranteed (checked by measurement)."""
    n = x.shape[0]
    ceil = float(dbl(ceiling_db))
    up_ = signal.resample_poly(x, os, 1, axis=0)
    pk = np.abs(up_).max(axis=1)[: n * os].reshape(n, os).max(axis=1)
    need = np.minimum(1.0, ceil / np.maximum(pk, 1e-12))
    L = max(1, int(lookahead_ms * 1e-3 * SR))
    W = L + 1
    needp = np.concatenate([need, np.ones(L)])
    gmin = ndimage.minimum_filter1d(needp, size=W, origin=-(W // 2), mode="nearest")[:n]
    cs = np.concatenate([[0.0], np.concatenate([np.ones(L), gmin]).cumsum()])
    gs = (cs[L + 1:L + 1 + n] - cs[0:n]) / W
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


def _block_energy(z, win_s, hop_s):
    W, H = int(win_s * SR), int(hop_s * SR)
    cs = np.vstack([np.zeros((1, z.shape[1])), np.cumsum(z ** 2, axis=0)])
    starts = np.arange(0, z.shape[0] - W + 1, H)
    ms = (cs[starts + W] - cs[starts]) / W
    return ms.sum(axis=1), starts


def integrated_lufs(x):
    z = k_weight(x)
    e, _ = _block_energy(z, 0.4, 0.1)
    lj = -0.691 + 10 * np.log10(np.maximum(e, 1e-12))
    g1 = lj > -70.0
    if not g1.any():
        return -120.0
    rel = -0.691 + 10 * np.log10(np.mean(e[g1])) - 10.0
    g2 = lj > max(rel, -70.0)
    return -0.691 + 10 * np.log10(np.mean(e[g2]))


def momentary_series(x, win_s=0.4, hop_s=0.1):
    z = k_weight(x)
    e, starts = _block_energy(z, win_s, hop_s)
    return -0.691 + 10 * np.log10(np.maximum(e, 1e-12)), (starts + int(win_s * SR) // 2) / SR


def short_term_series(x):
    return momentary_series(x, 3.0, 1.0)


def loudness_range(x):
    """EBU Tech 3342 LRA: 3 s short-term, -70 abs and -20 rel gates, 10th-95th percentile."""
    st, _ = short_term_series(x)
    z = k_weight(x)
    e, _ = _block_energy(z, 3.0, 1.0)
    g1 = st > -70.0
    if not g1.any():
        return 0.0
    rel = -0.691 + 10 * np.log10(np.mean(e[g1])) - 20.0
    g2 = st[st > max(rel, -70.0)]
    if len(g2) < 2:
        return 0.0
    return float(np.percentile(g2, 95) - np.percentile(g2, 10))
