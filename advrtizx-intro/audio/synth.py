"""synth.py - the instrument recipes of the DOMINANT score. Everything is synthesised; no samples.

Contract
  * every recipe returns float64 (n, 2) stereo (or (n,) for the *_mono helpers) whose FIRST sample is the event's own
    sample: sample-accurate, no pre-roll. Transients start at sample 0 of the returned buffer.
  * nominal peak ~1.0 before the mixer's dB gain. All nonlinearities run through dsp.oversampled (4x).
  * deterministic: randomness only via dsp.rng_for(key..., seed).
  * every event has a short raised-cosine fade at its start (0.05-1 ms for transients, longer for pads) and a
    fade at its end, so nothing clicks except the intentional strikes themselves.

Contents
  1 impact (monumental) .. tuned sub boom, concrete/steel modal body, crack, rumble, air, debris, groan
  2 floor_slam, roar ..... the Act I pile driver
  3 lock ................. steel clamp, partials 1 : 2.76 : 5.40 : 8.93
  4 whoosh ............... whip / fall / dive / soft (noise through a sweeping band-pass, Doppler bend)
  5 braam, stab .......... band-limited saw stacks, fast filter envelope, oversampled drive, growl
  6 kick, taiko, snare, clap, hat, tick, anvil
  7 bass_note, pedal
  8 pad, shimmer
  9 shepard, noise_riser, reverse swell
 10 bell, stamp, click, tick_tiny
 11 wind, drone
"""
from __future__ import annotations

import numpy as np
from scipy import signal

import dsp
from dsp import (SR, TWO_PI, bp, down, exp_env, fade_io, hp, lp, modal_bank, note_hz, osc_pulse, osc_saw, osc_square, pan_gains,
                 phase_acc, rng_for, svf, svf4, tanh_os, to_stereo, up, white, pink, brown, dbl, haas)


# ======================================================================================
# helpers
# ======================================================================================
def _t(n):
    return np.arange(n) / SR


def _pitch_phase(f0, n, a=0.80, tau1=0.030, b=0.20, tau2=0.11):
    """phase (radians) of f(t) = f0 (1 + a e^{-t/tau1} + b e^{-t/tau2}); f(0) = 2 f0 for a + b = 1. With the defaults the
    pitch has fallen 88 % of the way to f0 after 100 ms and is within 7 cents of f0 after 0.4 s (tuned, not glided)."""
    t = _t(n)
    return TWO_PI * f0 * (t + a * tau1 * (1 - np.exp(-t / tau1)) + b * tau2 * (1 - np.exp(-t / tau2)))


def _pan_apply(st, pan):
    """constant-power balance of an already-stereo buffer (pan 0 = unchanged)."""
    if not pan:
        return st
    gl, gr = pan_gains(pan)
    return st * np.array([gl * np.sqrt(2.0), gr * np.sqrt(2.0)])


def _mono2(x):
    return np.stack([x, x], axis=1)


def _stereo_from_two(a, b, width=1.0):
    """two decorrelated mono signals -> stereo with adjustable width (1 = fully independent)."""
    m = 0.5 * (a + b)
    return np.stack([m + (a - m) * width, m + (b - m) * width], axis=1)


def _add(dst, src, at=0, gain=1.0, tailfade=0.006):
    """mix src into dst at sample `at`; the end of src gets a short raised-cosine fade so a truncated layer
    can never click (layers whose decay already finished are unaffected)."""
    n = len(src)
    if tailfade and n > 8:
        src = fade_io(src, 0.0, min(tailfade, n / SR * 0.5))
    e = min(len(dst), at + n)
    if e > at:
        dst[at:e] += src[:e - at] * gain


def _norm_peak(x, peak=1.0):
    p = float(np.max(np.abs(x)))
    return x * (peak / p) if p > 0 else x


def _noise_burst(n, rng, lo, hi, tau, order=2):
    """band-limited noise with exp decay (tau seconds)."""
    x = bp(white(n, rng), lo, hi, order)
    return x * np.exp(-np.minimum(_t(n) / tau, 60.0))


def _pair_noise_burst(n, rng, lo, hi, tau, order=2, width=1.0):
    return _stereo_from_two(_noise_burst(n, rng, lo, hi, tau, order), _noise_burst(n, rng, lo, hi, tau, order), width)


def _modes_stereo(freqs, taus, amps, n, rng, jitter=0.012, width=1.0):
    a = modal_bank(freqs, taus, amps, n, rng, jitter=jitter)
    b = modal_bank(freqs, taus, amps, n, rng, jitter=jitter)
    return _stereo_from_two(a, b, width)


STEEL = (1.0, 2.76, 5.40, 8.93, 13.34)                                       # plate/bell-like inharmonic modes
CONCRETE = (1.0, 1.52, 2.11, 2.83, 3.31, 4.17, 5.02, 6.35)                  # slab modes


# ======================================================================================
# 1  MONUMENTAL IMPACT
# ======================================================================================
def impact(f0=55.0, size=1.0, seed=0, t60=2.6, tail=3.6, steel_f=None, pan=0.0, crack=1.0, air=1.0, debris=1.0,
           sub0=0.0, mid=1.0, groan=0.0, body_decay=1.0, drive=1.7, sub_gain=0.92):
    """Tuned sub boom + inharmonic modal body + crack + air + rumble tail (+ debris, groan). `f0` is the sub's
    resting pitch (A1 = 55 Hz for A impacts, D1 = 36.71 Hz for D impacts). Peak ~1.0."""
    rng = rng_for(10, seed)
    n = int(tail * SR)
    t = _t(n)
    tau_a = t60 / 6.9078

    # --- sub boom: pitch 2x -> 1x (fast 35 ms + slow 280 ms components), saturated for small-speaker audibility
    ph = _pitch_phase(f0, n)
    env = exp_env(n, tau_a, attack=0.0006)
    sub = np.sin(ph) * env + 0.42 * np.sin(2 * ph) * exp_env(n, tau_a * 0.50, attack=0.0006)
    if sub0:
        sub += sub0 * np.sin(0.5 * ph) * exp_env(n, tau_a * 1.15, attack=0.004)
    sub_x = tanh_os(sub / np.max(np.abs(sub)), drive, q="lf")

    # --- body: low-passed noise punch + concrete modal bank (tuned: first mode = 2 f0) + steel ring
    nb = min(n, int(3.2 * SR))
    punch = lp(white(nb, rng), 650.0, 4) * np.exp(-np.minimum(_t(nb) / (0.075 * body_decay), 60.0))
    punch = hp(punch, 38.0, 2)
    cf = 2 * f0 * np.array(CONCRETE)
    ct = 0.17 * body_decay / (1.0 + 0.42 * np.arange(len(cf)))
    ca = 1.0 / (1.0 + 0.55 * np.arange(len(cf)))
    concrete = fade_io(_modes_stereo(cf, ct, ca, nb, rng, jitter=0.012, width=0.8), 0.0, 0.2)
    sf = steel_f if steel_f is not None else 4 * f0
    steel = _modes_stereo(sf * np.array(STEEL), np.array([0.38, 0.23, 0.14, 0.08, 0.045]) * body_decay,
                          np.array([1.0, 0.8, 0.6, 0.45, 0.3]), nb, rng, jitter=0.004, width=1.0)
    steel = fade_io(steel, 0.0, 0.2)

    # --- crack (2-10 kHz, 5-20 ms) + a snap
    nc = int(0.045 * SR)
    ck = _pair_noise_burst(nc, rng, 2200.0, 10000.0, 0.0045, 2, 1.0)
    sn = _stereo_from_two(hp(white(nc, rng), 4500.0, 2), hp(white(nc, rng), 4500.0, 2)) * np.exp(-_t(nc) / 0.0012)[:, None]
    ck = ck / (np.max(np.abs(ck)) + 1e-12) + 0.6 * sn / (np.max(np.abs(sn)) + 1e-12)

    # --- air blast: noise through a low-pass that dives 7 kHz -> 250 Hz
    na = int(1.4 * SR)
    ua = _t(na)
    fc = 250.0 + 6750.0 * np.exp(-ua / 0.11)
    a1 = svf4(white(na, rng), fc, 0.8, "lp")
    a2 = svf4(white(na, rng), fc, 0.8, "lp")
    air_x = _stereo_from_two(a1, a2, 1.0) * exp_env(na, 0.30, attack=0.0015)[:, None]

    # --- low rumble tail: noise < 130 Hz and 130-500 Hz, decays 2-3.5 s
    rum = lp(white(n, rng), 130.0, 4)
    rum = hp(rum, 22.0, 2) * exp_env(n, tail / 3.6, attack=0.02)
    rum /= np.max(np.abs(rum[: int(0.5 * SR)])) + 1e-12
    mid_n = int(min(n, 2.4 * SR))
    rl = bp(white(mid_n, rng), 130.0, 520.0, 2) * exp_env(mid_n, 0.75, attack=0.01)
    rr = bp(white(mid_n, rng), 130.0, 520.0, 2) * exp_env(mid_n, 0.75, attack=0.01)
    roll = _stereo_from_two(rl, rr, 1.0)
    roll /= np.max(np.abs(roll)) + 1e-12

    out = np.zeros((n, 2))
    _add(out, _mono2(sub_x), 0, sub_gain)
    _add(out, _mono2(punch / (np.max(np.abs(punch)) + 1e-12)), 0, 0.50 * mid)
    _add(out, concrete / (np.max(np.abs(concrete)) + 1e-12), 0, 0.30 * mid)
    _add(out, steel / (np.max(np.abs(steel)) + 1e-12), 0, 0.22 * mid)
    _add(out, ck, 0, 0.34 * crack)
    _add(out, air_x / (np.max(np.abs(air_x)) + 1e-12), 0, 0.20 * air)
    _add(out, _mono2(rum), 0, 0.30)
    _add(out, roll, 0, 0.10 * mid)

    if debris > 0:
        out += debris * _debris(n, rng, dur=min(2.8, tail - 0.4), level=0.05)
    if groan > 0:
        out += groan * _groan(n, rng, dur=min(3.2, tail))
    out = fade_io(out, 0.00004, 0.25)
    out = _pan_apply(out, pan)
    return _norm_peak(out, 1.0)


def _debris(n, rng, dur=2.5, level=0.05):
    """falling-rubble grains: Poisson-ish clicks of band-limited noise, density and level decaying."""
    out = np.zeros((n, 2))
    t, k = 0.06, 0
    while t < dur and k < 220:
        lam = 70.0 * np.exp(-t / 0.7) + 6.0
        t += rng.exponential(1.0 / lam)
        L = int(rng.uniform(0.003, 0.022) * SR)
        i = int(t * SR)
        if i + L >= n:
            break
        fc = float(np.exp(rng.uniform(np.log(500.0), np.log(5200.0))))
        g = white(L, rng) * np.hanning(L)
        g = signal.lfilter(*signal.iirpeak(fc / (SR / 2), 4.0), g)
        g = g / (np.max(np.abs(g)) + 1e-12) * float(np.exp(rng.uniform(np.log(0.05), np.log(1.0)))) * np.exp(-t / 1.2)
        gl, gr = pan_gains(rng.uniform(-0.8, 0.8))
        out[i:i + L, 0] += g * gl * np.sqrt(2.0)
        out[i:i + L, 1] += g * gr * np.sqrt(2.0)
        k += 1
    return out * level / (np.max(np.abs(out)) + 1e-12) * 1.0


def _groan(n, rng, dur=3.0):
    """metal-stress groan: noise through two narrow resonances sliding downward (a huge structure settling)."""
    m = int(dur * SR)
    u = _t(m)
    out = np.zeros((n, 2))
    for ch in range(2):
        g = np.zeros(m)
        for f_a, f_b, q, a in ((640.0, 410.0, 22.0, 1.0), (1180.0, 760.0, 30.0, 0.7), (310.0, 210.0, 18.0, 0.8)):
            fc = f_b + (f_a - f_b) * np.exp(-u / (dur * 0.35))
            g += a * svf(white(m, rng), fc, q, "bp")
        g *= np.sin(np.pi * np.minimum(u / dur, 1.0)) ** 1.5 * np.exp(-u / (dur * 0.55))
        out[:m, ch] = g
    return out * 0.10 / (np.max(np.abs(out)) + 1e-12)


# ======================================================================================
# 2  FLOOR SLAM + ROAR (Act I pile driver)
# ======================================================================================
def floor_slam(pitch_hz, spacing_s, k=0, n_total=22, seed=0):
    """One module locking home. The tuned clank carries the rising dominant arpeggio; the thud keeps the weight;
    decay lengths shrink with the spacing so the hits stay distinct, then merge into the roar."""
    rng = rng_for(20, seed)
    L = float(np.clip(spacing_s * 4.0, 0.16, 0.85))
    n = int(L * SR)
    t = _t(n)
    u = k / max(1, n_total - 1)
    tscale = float(np.clip(spacing_s / 0.2, 0.40, 1.0))

    f_t = 50.0 + 95.0 * u
    ph = TWO_PI * f_t * (t + 0.012 * 0.9 * (1 - np.exp(-t / 0.012)))
    thud = np.sin(ph) * exp_env(n, float(np.clip(spacing_s * 0.9, 0.03, 0.13)), attack=0.0004)
    thud = tanh_os(thud, 1.9, q="lf")

    clank = _modes_stereo(pitch_hz * np.array(STEEL[:4]), np.array([0.095, 0.058, 0.036, 0.021]) * tscale,
                          np.array([1.0, 0.65, 0.42, 0.28]), n, rng, jitter=0.0025, width=0.9)
    nbd = int(min(n, 0.15 * SR))
    body = _stereo_from_two(bp(white(nbd, rng), 140.0, 950.0, 2), bp(white(nbd, rng), 140.0, 950.0, 2), 0.7)
    body *= np.exp(-_t(nbd) / (0.032 * tscale))[:, None]
    nc = int(0.03 * SR)
    ck = _pair_noise_burst(nc, rng, 2500.0, 9000.0, 0.0028, 2, 1.0)
    ck /= np.max(np.abs(ck)) + 1e-12

    out = np.zeros((n, 2))
    _add(out, _mono2(thud), 0, 0.85)
    _add(out, clank / (np.max(np.abs(clank)) + 1e-12), 0, 0.52)
    _add(out, body / (np.max(np.abs(body)) + 1e-12), 0, 0.42)
    _add(out, ck, 0, 0.45)
    out = fade_io(out, 0.00004, min(0.04, L * 0.3))
    pan = 0.22 * np.sin(k * 2.399)
    return _norm_peak(_pan_apply(out, pan), 1.0)


def roar(dur_s, seed=0):
    """The per-frame hits merge: a rising growl (detuned saws A2 -> A4, driven), noise sweep, sub rumble and a
    30 Hz flutter (one frame per hit). Hard-cut by the caller at TOP_LOCK."""
    rng = rng_for(21, seed)
    n = int(dur_s * SR)
    u = np.arange(n) / n
    t = _t(n)
    f = 110.0 * 4.0 ** (u ** 1.25)                                   # A2 -> A4, accelerating
    g = np.zeros(n)
    for c in (-11, -4, 4, 11):
        g += osc_saw(f * 2 ** (c / 1200.0), n, phase0=float(rng.uniform(0, 1)))
    g = tanh_os(g / 4.0, 2.4, q="mid")
    g = svf4(g, 450.0 + 4800.0 * u ** 1.5, 1.2, "lp")
    nz = np.stack([svf4(white(n, rng), 300.0 + 6500.0 * u ** 1.6, 0.9, "lp") for _ in range(2)], axis=1)
    nz /= np.std(nz) + 1e-12
    rum = lp(brown(n, rng), 160.0, 4)
    rum /= np.std(rum) + 1e-12
    flutter = 1.0 - 0.38 * (0.5 + 0.5 * np.sin(TWO_PI * 30.0 * t)) * (0.3 + 0.7 * u)
    amp = dbl(-26.0 + 26.0 * u ** 1.3)
    st = (np.stack([g, g], axis=1) * 0.55 + nz * 0.50 + _mono2(rum) * 0.35) * (amp * flutter)[:, None]
    st = fade_io(st, 0.004, 0.0)
    return _norm_peak(st, 1.0)


# ======================================================================================
# 3  LOCK - a colossal steel clamp
# ======================================================================================
def lock(seed=0, f0=110.0, ring_s=0.9):
    """Metallic modal ring with partials ~ 1 : 2.76 : 5.40 : 8.93 x f0 (A2) layered with the same family on A3,
    a two-stage click (slam + latch), a short body knock and an A1 weight. Dry; the caller truncates the ring."""
    rng = rng_for(30, seed)
    n = int(ring_s * SR)
    t = _t(n)
    ringA = _modes_stereo(f0 * np.array(STEEL[:4]), np.array([0.34, 0.20, 0.115, 0.062]),
                          np.array([1.0, 0.85, 0.60, 0.40]), n, rng, jitter=0.0015, width=1.0)
    ringB = _modes_stereo(2 * f0 * np.array(STEEL[:4]), np.array([0.26, 0.15, 0.085, 0.045]),
                          np.array([0.60, 0.55, 0.40, 0.28]), n, rng, jitter=0.0015, width=1.0)
    # split every partial in two slightly detuned twins (slow shimmer, no pure-sine feel)
    ringC = _modes_stereo(f0 * 1.0021 * np.array(STEEL[:4]), np.array([0.30, 0.18, 0.10, 0.055]),
                          np.array([0.55, 0.45, 0.3, 0.2]), n, rng, jitter=0.002, width=1.0)
    ring = ringA / (np.max(np.abs(ringA)) + 1e-12) + 0.7 * ringB / (np.max(np.abs(ringB)) + 1e-12) \
        + 0.5 * ringC / (np.max(np.abs(ringC)) + 1e-12)
    ring /= np.max(np.abs(ring)) + 1e-12

    nk = int(0.004 * SR)
    click = _stereo_from_two(hp(white(nk, rng), 2500.0, 2), hp(white(nk, rng), 2500.0, 2), 1.0)
    click *= (np.exp(-_t(nk) / 0.0008) * 1.0)[:, None]
    click /= np.max(np.abs(click)) + 1e-12
    nl = int(0.012 * SR)
    latch = _noise_burst(nl, rng, 1400.0, 4200.0, 0.0035, 2)
    latch = _mono2(latch / (np.max(np.abs(latch)) + 1e-12))
    nw = int(0.18 * SR)
    knock = bp(white(nw, rng), 170.0, 900.0, 2) * np.exp(-_t(nw) / 0.028)
    thump_t = _t(int(0.6 * SR))
    thump = np.sin(TWO_PI * 55.0 * (thump_t + 0.02 * (1 - np.exp(-thump_t / 0.02)))) * exp_env(len(thump_t), 0.11, 0.0006)
    thump = fade_io(tanh_os(thump, 1.8, q="lf"), 0.0, 0.08)

    out = np.zeros((n, 2))
    _add(out, ring, 0, 0.55)
    _add(out, click, 0, 0.75)
    _add(out, latch, int(0.024 * SR), 0.34)
    _add(out, _mono2(knock / (np.max(np.abs(knock)) + 1e-12)), 0, 0.45)
    _add(out, _mono2(thump), 0, 0.80)
    out = fade_io(out, 0.00003, 0.02)
    return _norm_peak(out, 1.0)


# ======================================================================================
# 4  WHOOSH family
# ======================================================================================
def whoosh(dur_s, kind="whip", pan0=-0.85, pan1=0.85, seed=0, f_lo=450.0, f_hi=7200.0, q=1.7, peak_at=0.78,
           low=0.30, end_fade_ms=5.0, start_fade_ms=2.0):
    """Noise through a sweeping resonant band-pass.
      whip : Doppler pass-by - centre rises exponentially to the closest point (peak_at) then falls; level swells
             to the pass and drops fast; pans pan0 -> pan1 (camera whips right).
      fall : dive - centre falls f_hi -> f_lo while the level crescendos into the end (the object arrives).
      dive : like fall but longer, with a driven saw 'plunge' tone sliding down an octave pair.
      soft : narrow, airy, bell-shaped: the sentence setting."""
    rng = rng_for(40, seed)
    n = int(round(dur_s * SR))
    u = np.arange(n) / max(1, n - 1)
    if kind == "whip":
        x = np.where(u < peak_at, u / peak_at, 1.0)
        fc = np.where(u < peak_at, f_lo * (f_hi / f_lo) ** x, f_hi * ((f_lo * 1.7) / f_hi) ** ((u - peak_at) / (1 - peak_at)))
        amp = np.where(u < peak_at, (u / peak_at) ** 1.6,
                       np.maximum(np.cos(0.5 * np.pi * np.clip((u - peak_at) / (1 - peak_at), 0.0, 1.0)), 0.0) ** 1.2)
        amp = np.maximum(amp, 0.0)
        qv = q + 1.2 * np.exp(-((u - peak_at) / 0.12) ** 2)
    elif kind in ("fall", "dive"):
        fc = f_lo * (f_hi / f_lo) ** ((1 - u) ** 1.35)
        amp = u ** (1.9 if kind == "dive" else 1.4)
        qv = q + 0.0 * u
    elif kind == "soft":
        fc = f_lo * (f_hi / f_lo) ** (u ** 0.9)
        amp = np.sin(np.pi * u) ** 2.2
        qv = np.full(n, q)
    else:
        raise ValueError(kind)
    a = svf(white(n, rng), fc, qv, "bp")
    b = svf(white(n, rng), fc * 1.035, qv, "bp")
    a /= np.std(a) + 1e-12
    b /= np.std(b) + 1e-12
    # second band an octave below for body
    a2 = svf(white(n, rng), fc * 0.5, qv * 0.8, "bp")
    b2 = svf(white(n, rng), fc * 0.5, qv * 0.8, "bp")
    a += 0.55 * a2 / (np.std(a2) + 1e-12)
    b += 0.55 * b2 / (np.std(b2) + 1e-12)
    pan = pan0 + (pan1 - pan0) * u
    gl, gr = pan_gains(pan)
    st = np.stack([a * gl, b * gr], axis=1) * np.sqrt(2.0)
    if low > 0:
        lw = lp(white(n, rng), 260.0, 4) * (amp ** 1.3)
        lw /= np.std(lw) + 1e-12
        st += low * _mono2(lw) * 0.6
    if kind == "dive":
        f = 440.0 * 0.25 ** (u ** 1.3)                                 # A4 -> A2 plunge
        s = osc_saw(f, n) + osc_saw(f * 1.006, n)
        s = tanh_os(s / 2.0, 1.8)
        s = svf4(s, 900.0 * (1 - 0.6 * u) + 150.0, 1.0, "lp")
        st += 0.35 * _mono2(s) * (amp ** 1.6)[:, None]
    st *= amp[:, None]
    st = fade_io(st, start_fade_ms * 1e-3, end_fade_ms * 1e-3)
    return _norm_peak(st, 1.0)


# ======================================================================================
# 5  BRAAM / STAB
# ======================================================================================
def _voice_pan(f, i, spread):
    if f < 150.0:
        return 0.0
    h = np.sin((i + 1) * 12.9898 + f * 0.0078) * 43758.5453
    return float(((h - np.floor(h)) * 2 - 1) * spread)


def braam(freqs, dur_s, seed=0, size=1.0, cut_peak=3600.0, cut_end=620.0, cut_tau=0.48, hold=0.60, release=0.35,
          drive=2.1, growl=0.55, cents=(-11.0, -4.0, 5.0, 12.0), scoop=22.0, spread=0.85, chiff=0.35, q=1.15,
          sub_hz=None, attack=0.005, formant=1.0, sag_tau=0.5):
    """Band-limited saw stack (wavetable, harmonics below 0.46 SR), each chord tone detuned +-4..12 cents across
    the octaves of `freqs`, lip-slur pitch scoop, oversampled pre-drive, a 24 dB/oct low-pass with a FAST filter
    envelope (opens in ~15 ms, closes over cut_tau), brass formant peaks, a growl layer (flutter-tongued sub
    saw) and a noise 'chiff'. Hold level sags to `hold` over the note, `release` seconds of tail."""
    rng = rng_for(50, seed)
    n = int((dur_s + release) * SR)
    t = _t(n)
    slur = 2.0 ** ((scoop * np.exp(-t / 0.075)) / 1200.0)
    L = np.zeros(n)
    R = np.zeros(n)
    k = 0
    freqs = list(freqs)
    nv = 0
    for i, f in enumerate(freqs):
        pn = _voice_pan(f, i, spread)
        gl, gr = pan_gains(pn)
        w = 1.0 / (1.0 + 0.18 * max(0.0, np.log2(max(f, 40.0) / 55.0) - 1.0))   # slight tilt, upper voices quieter
        for c in cents:
            ph0 = float(rng.uniform(0, 1))
            # an ensemble is never sample-aligned: staggered entries (0-5 ms, none for the sub voices) and a slow,
            # independent pitch drift per voice (+-2.5 cents, 0.4-1.1 Hz)
            dly = 0 if f < 120.0 else int(rng.uniform(0.0, 0.005) * SR)
            drift = 1.0 + 0.00145 * np.sin(TWO_PI * rng.uniform(0.4, 1.1) * t + rng.uniform(0, TWO_PI))
            v = osc_saw(f * slur * drift * 2.0 ** (c / 1200.0), n, phase0=ph0) * w
            if dly:
                v = np.concatenate([np.zeros(dly), v[:-dly]])
            sgn = 1.0 if (k % 2 == 0) else -1.0
            gl2, gr2 = pan_gains(np.clip(pn + 0.35 * sgn * (f > 150), -1, 1))
            L += v * gl2
            R += v * gr2
            k += 1
            nv += 1
    norm = 1.0 / np.sqrt(nv)
    L *= norm
    R *= norm
    sat = tanh_os(np.stack([L, R], axis=1) * 1.8, 1.5 * drive / 2.0)

    # fast filter envelope: opens quick, then closes slowly toward cut_end
    rise = 1.0 - np.exp(-t / 0.014)
    fc = cut_end + (cut_peak - cut_end) * rise * np.exp(-t / cut_tau)
    fc = np.maximum(fc, 180.0)
    sf = np.stack([svf4(sat[:, 0], fc, q, "lp"), svf4(sat[:, 1], fc, q, "lp")], axis=1)
    # brass formant honk (parallel band-passes)
    if formant:
        form = np.stack([svf(sf[:, 0], 560.0, 2.4, "bp") + 0.7 * svf(sf[:, 0], 1450.0, 3.0, "bp"),
                         svf(sf[:, 1], 560.0, 2.4, "bp") + 0.7 * svf(sf[:, 1], 1450.0, 3.0, "bp")], axis=1)
        sf = sf + 0.55 * formant * form

    # growl layer: flutter-tongued sub-octave saw (random-walk AM around 38-60 Hz) + ring-mod grit
    root = min(freqs)
    gf = (sub_hz if sub_hz else root)
    rate = 41.0 * (1.0 + 0.25 * np.cumsum(rng.standard_normal(n)) / np.sqrt(n) * 0.05)
    flutter = 0.5 + 0.5 * np.sin(TWO_PI * np.cumsum(rate) / SR)
    gr_ = osc_saw(gf * slur, n) + 0.8 * osc_saw(gf * 2.0 * slur * 1.0035, n)
    gr_ = tanh_os(gr_ * (0.7 + 0.8 * flutter), 2.6, q="lf")
    gr_ = svf4(gr_, np.maximum(fc * 0.45, 160.0), 1.0, "lp")
    gr_ *= (0.45 + 0.55 * (1.0 - np.exp(-t / 0.02))) * (0.55 + 0.45 * np.exp(-t / 0.9))
    out = sf / (np.max(np.abs(sf)) + 1e-12)
    out = out + growl * _mono2(gr_ / (np.max(np.abs(gr_)) + 1e-12)) * 0.8

    # noise chiff (brass attack spit)
    if chiff:
        nc = int(0.09 * SR)
        ch = _pair_noise_burst(nc, rng, 700.0, 3600.0, 0.022, 2, 1.0)
        out[:nc] += chiff * 0.5 * ch / (np.max(np.abs(ch)) + 1e-12)

    # amplitude: instant attack, sag to `hold`, long raised-cosine release
    sag = hold + (1.0 - hold) * np.exp(-t / sag_tau)
    env = sag * (1.0 - np.exp(-t / attack)) if attack > 0 else sag
    nd = int(dur_s * SR)
    env[nd:] *= 0.5 + 0.5 * np.cos(np.pi * np.minimum((np.arange(n - nd) + 1) / (n - nd + 1), 1.0))
    out = out * env[:, None]
    out = tanh_os(out * 0.9, 1.3)                                   # glue saturation
    out = fade_io(out, 0.00006, 0.02)
    return _norm_peak(out, 1.0)


def stab(freqs, dur_s=0.34, seed=0, bright=1.0, release=0.30, size=1.0):
    """short brass/synth stab for the city hits: braam recipe tuned for punch (tighter growl, quicker filter)."""
    return braam(freqs, dur_s, seed=seed, cut_peak=4600.0 * bright, cut_end=900.0, cut_tau=0.16, hold=0.55,
                 release=release, drive=1.9, growl=0.30, cents=(-9.0, 0.0, 9.0), scoop=14.0, spread=0.9, chiff=0.28,
                 q=1.0, attack=0.003)


# ======================================================================================
# 6  DRUMS (cinematic: deep, long-tailed, hall-fed - not EDM)
# ======================================================================================
def kick(seed=0, f_start=150.0, f_end=45.0, tau_p=0.021, decay=0.16, click=0.42, drive=1.9, tail=0.55, thump=0.0):
    """sine 150 -> 45 Hz, 2nd harmonic, oversampled saturation, beater click (HP noise) + 'tok' (3-5 kHz).
    A punch layer (short, saturated) over a boom layer (long, cleaner); `thump` adds a longer sub bloom for the
    big downbeats."""
    rng = rng_for(60, seed)
    n = int(tail * SR)
    t = _t(n)
    ph = TWO_PI * (f_end * t + (f_start - f_end) * tau_p * (1 - np.exp(-t / tau_p)))
    punch = tanh_os(np.sin(ph) + 0.22 * np.sin(2 * ph), drive, q="lf") * exp_env(n, decay * 0.42, 0.0004)
    boom = np.sin(TWO_PI * f_end * (t + 0.0)) * exp_env(n, decay, 0.0035) * 0.55
    boom = tanh_os(boom, 1.25, q="lf")
    body = punch + boom
    if thump:
        body += thump * np.sin(TWO_PI * f_end * t) * exp_env(n, decay * 1.9, 0.004)
    nk = int(0.008 * SR)
    ck = hp(white(nk, rng), 1800.0, 2) * np.exp(-_t(nk) / 0.0009)
    ck = ck / (np.max(np.abs(ck)) + 1e-12)
    nt = int(0.02 * SR)
    tok = bp(white(nt, rng), 2800.0, 5200.0, 2) * np.exp(-_t(nt) / 0.004)
    tok = tok / (np.max(np.abs(tok)) + 1e-12)
    out = body.copy()
    out[:nk] += click * ck
    out[:nt] += 0.22 * click * tok
    out = fade_io(out, 0.00004, 0.08)
    return _mono2(_norm_peak(out, 1.0))


_MEMB = (1.0, 1.593, 2.136, 2.296, 2.653, 2.917, 3.156)          # circular membrane modes


def taiko(f0=55.0, decay=1.2, seed=0, slap=1.0, size=1.0, pan=0.0, sub_amt=1.2, sub_decay=0.85):
    """Membrane modal bank (1 : 1.59 : 2.14 : 2.30 : 2.65 : 2.92 : 3.16) with the strike-time pitch drop, a deep
    fundamental, noise body and a skin slap. Long decay; tuned to the chord context via f0."""
    rng = rng_for(61, seed)
    n = int(min(4.2, decay * 4.2 + 0.3) * SR)
    t = _t(n)
    gl = 0.32 * 0.035 * (1 - np.exp(-t / 0.035))
    amps = np.array([1.0, 0.62, 0.42, 0.38, 0.26, 0.20, 0.15])
    taus = decay * np.array([1.0, 0.60, 0.46, 0.40, 0.32, 0.27, 0.24])
    out = np.zeros((n, 2))
    for ch in range(2):
        y = np.zeros(n)
        for r, a, tau in zip(_MEMB, amps, taus):
            fr = f0 * r * (1.0 + 0.004 * rng.uniform(-1, 1))
            y += a * np.sin(TWO_PI * fr * (t + gl)) * np.exp(-np.minimum(t / tau, 60.0))
        out[:, ch] = y
    sub = np.sin(TWO_PI * f0 * (t + gl)) * exp_env(n, decay * sub_decay, 0.0007)
    out += sub_amt * _mono2(sub)
    nb = int(0.5 * SR)
    nz = bp(white(nb, rng), f0 * 1.5, f0 * 7.0, 2) * np.exp(-_t(nb) / 0.06)
    out[:nb] += 0.5 * _mono2(nz / (np.max(np.abs(nz)) + 1e-12))
    ns = int(0.04 * SR)
    sl = _pair_noise_burst(ns, rng, 1200.0, 3800.0, 0.007, 2, 0.8)
    out[:ns] += 0.45 * slap * sl / (np.max(np.abs(sl)) + 1e-12)
    out[:, 0], out[:, 1] = out[:, 0], out[:, 1]
    out = tanh_os(out / np.max(np.abs(out)), 1.6, q="lf")
    out = fade_io(out, 0.00005, 0.35)
    return _norm_peak(_pan_apply(out, pan), 1.0)


def snare(seed=0, body_hz=195.0, decay=0.16, snap=1.0):
    """200 Hz shell (pitch-dropped) + wire noise + crack."""
    rng = rng_for(62, seed)
    n = int((decay * 5.0 + 0.1) * SR)
    t = _t(n)
    ph = TWO_PI * body_hz * (t + 0.35 * 0.012 * (1 - np.exp(-t / 0.012)))
    body = np.sin(ph) * exp_env(n, 0.055, 0.0003)
    wires = _stereo_from_two(bp(white(n, rng), 1400.0, 9000.0, 2), bp(white(n, rng), 1400.0, 9000.0, 2), 1.0)
    wires *= exp_env(n, decay * 0.55, 0.0004)[:, None]
    nc = int(0.02 * SR)
    ck = _pair_noise_burst(nc, rng, 3000.0, 7500.0, 0.003, 2, 1.0)
    out = _mono2(body) * 0.8 + wires / (np.max(np.abs(wires)) + 1e-12) * 0.75
    out[:nc] += snap * 0.5 * ck / (np.max(np.abs(ck)) + 1e-12)
    out = tanh_os(out / np.max(np.abs(out)), 1.3)
    out = fade_io(out, 0.00004, 0.05)
    return _norm_peak(out, 1.0)


def clap(seed=0, big=1.0):
    """four noise bursts (8.5 ms apart, rising level) + a short tail + 200 Hz body: a stomp-clap built for the hall."""
    rng = rng_for(63, seed)
    n = int(0.45 * SR)
    out = np.zeros((n, 2))
    for i, (d, a) in enumerate(zip((0.0, 0.0085, 0.0175, 0.0265), (0.72, 0.84, 0.95, 1.0))):
        nb = int(0.03 * SR)
        b = _pair_noise_burst(nb, rng, 1000.0, 3600.0, 0.0035, 2, 1.0)
        _add(out, b / (np.max(np.abs(b)) + 1e-12), int(d * SR), a)
    nt = int(0.30 * SR)
    tl = _pair_noise_burst(nt, rng, 900.0, 2900.0, 0.055, 2, 1.0)
    _add(out, tl / (np.max(np.abs(tl)) + 1e-12), int(0.0265 * SR), 0.50)
    nb = int(0.2 * SR)
    t = _t(nb)
    body = np.sin(TWO_PI * 195.0 * (t + 0.4 * 0.015 * (1 - np.exp(-t / 0.015)))) * exp_env(nb, 0.06, 0.0003)
    _add(out, _mono2(body), 0, 0.32 * big)
    out = fade_io(out, 0.00004, 0.1)
    return _norm_peak(out, 1.0)


def hat(seed=0, open_=False, bright=1.0):
    """tight metallic tick: HP noise 6.5 kHz plus a few inharmonic partials; closed 12 ms / open 110 ms."""
    rng = rng_for(64, seed)
    n = int((0.45 if open_ else 0.09) * SR)
    t = _t(n)
    tau = 0.11 if open_ else 0.011
    nz = _stereo_from_two(hp(white(n, rng), 6500.0, 4), hp(white(n, rng), 6500.0, 4), 1.0)
    met = np.zeros(n)
    for f in (4100.0, 5300.0, 6900.0, 8400.0, 10200.0, 12100.0):
        met += np.sin(TWO_PI * f * (1 + 0.01 * rng.uniform(-1, 1)) * t + rng.uniform(0, TWO_PI))
    met = hp(met, 3800.0, 2) / 6.0
    out = (nz / (np.max(np.abs(nz)) + 1e-12) * 0.8 + _mono2(met) * 0.5 * bright) * exp_env(n, tau, 0.00025)[:, None]
    out = fade_io(out, 0.00004, 0.02)
    return _norm_peak(out, 1.0)


def tick(seed=0, f=3300.0, tau=0.0035, width=1.0):
    """tight click-tick: damped sine + HP noise grain."""
    rng = rng_for(65, seed)
    n = int(tau * 10 * SR)
    t = _t(n)
    body = np.sin(TWO_PI * f * t) * np.exp(-t / tau)
    nb = int(0.0012 * SR)
    gr = hp(white(nb, rng), 5000.0, 2) * np.exp(-_t(nb) / 0.0004)
    body[:nb] += 0.5 * gr / (np.max(np.abs(gr)) + 1e-12)
    out = _mono2(body)
    out = fade_io(out, 0.00003, 0.004)
    return _norm_peak(out, 1.0)


def anvil(f0=220.0, seed=0, decay=0.9, brightness=1.0):
    """struck steel: STEEL modes of f0 with a hard click - the 'construction' accent."""
    rng = rng_for(66, seed)
    n = int(min(4.0, decay * 6.0) * SR)
    ring = _modes_stereo(f0 * np.array(STEEL), decay * np.array([1.0, 0.62, 0.38, 0.22, 0.13]),
                         np.array([1.0, 0.85, 0.65, 0.5, 0.35]) * np.array([1, 1, brightness, brightness, brightness]),
                         n, rng, jitter=0.002, width=1.0)
    nk = int(0.004 * SR)
    ck = _pair_noise_burst(nk, rng, 2500.0, 9000.0, 0.0009, 2, 1.0)
    ring[:nk] += 0.8 * ck / (np.max(np.abs(ck)) + 1e-12) * np.max(np.abs(ring))
    return _norm_peak(fade_io(ring, 0.00003, 0.1), 1.0)


# ======================================================================================
# 7  A-PEDAL BASS
# ======================================================================================
def bass_note(f, dur_s, accent=1.0, seed=0, cut_hi=2300.0, cut_lo=210.0, filt_tau=0.075, release=0.035, saw_mix=0.62,
              sub_mix=1.0, drive=1.6):
    """sine sub + filtered saw (filter envelope scaled by the accent) + a touch of square; mono; no clicks
    (3 ms raised-cosine attack, raised-cosine release)."""
    rng = rng_for(70, seed)
    n = int((dur_s + release) * SR)
    t = _t(n)
    ph0 = 0.0
    sine = np.sin(TWO_PI * f * t) + 0.20 * np.sin(TWO_PI * 2 * f * t)
    saw = osc_saw(f, n, phase0=ph0) * 0.8 + 0.35 * osc_square(f * 2.0, n)
    fc = cut_lo + (cut_hi * (0.45 + 0.55 * accent) - cut_lo) * np.exp(-t / filt_tau)
    saw = svf4(saw, fc, 1.6, "lp")
    x = sub_mix * sine + saw_mix * saw * (0.7 + 0.3 * accent)
    x = tanh_os(x * 0.7, drive, q="lf")
    env = np.exp(-np.arange(n) / (SR * max(dur_s * 1.15, 0.06)))
    na = int(0.003 * SR)
    env[:na] *= 0.5 - 0.5 * np.cos(np.pi * np.arange(na) / na)
    nr = int(release * SR)
    nd = n - nr
    env[nd:] *= 0.5 + 0.5 * np.cos(np.pi * (np.arange(nr) + 1) / (nr + 1))      # release multiplies the decay: no step
    return x * env


def pedal_drone(dur_s, seed=0, f=55.0, fifth=True, grit=0.25, fade_in=0.5, fade_out=0.5):
    """A pedal drone: A1 + A2 (+ E3) as detuned pairs that beat slowly, plus a rumble of band-limited brown noise.
    Mono-compatible below 120 Hz; slow breathing. Used for the red void and the sustained pedal."""
    rng = rng_for(71, seed)
    n = int(dur_s * SR)
    t = _t(n)
    out = np.zeros((n, 2))
    comps = [(f, 1.0), (2 * f, 0.55), (3 * f, 0.30 if fifth else 0.0), (4 * f, 0.18)]
    for ch, sgn in ((0, 1.0), (1, -1.0)):
        y = np.zeros(n)
        for k, (fc, a) in enumerate(comps):
            if a <= 0:
                continue
            fd = fc * (1.0 + sgn * 0.0011 * (k + 1))
            ph = rng.uniform(0, TWO_PI)
            y += a * np.sin(TWO_PI * fd * t + ph)
        out[:, ch] = y
    out = svf4(out[:, 0], 420.0, 0.8, "lp")[:, None] * np.array([[1.0, 0.0]]) + \
        svf4(out[:, 1], 420.0, 0.8, "lp")[:, None] * np.array([[0.0, 1.0]])
    r = lp(brown(n, rng), 140.0, 2)
    r /= np.std(r) + 1e-12
    out += grit * 0.35 * _mono2(r)
    breathe = 1.0 + 0.10 * np.sin(TWO_PI * 0.071 * t + 0.6) + 0.06 * np.sin(TWO_PI * 0.173 * t + 1.9)
    out *= breathe[:, None]
    out = fade_io(out, fade_in, fade_out)
    return out / (np.max(np.abs(out)) + 1e-12)


# ======================================================================================
# 8  PADS
# ======================================================================================
def chorus(x, rates=(0.23, 0.31), depth_ms=4.5, base_ms=14.0, mix=0.5):
    """two modulated-delay voices (L / R) around the dry signal; x: (n,) or (n,2) -> (n,2)."""
    if x.ndim == 1:
        x = _mono2(x)
    n = len(x)
    idx = np.arange(n, dtype=float)
    t = idx / SR
    out = np.zeros_like(x)
    for ch in range(2):
        d = (base_ms + depth_ms * np.sin(TWO_PI * rates[ch] * t + 1.7 * ch)) * 1e-3 * SR
        out[:, ch] = np.interp(idx - d, idx, x[:, ch], left=0.0)
    return x * (1 - 0.5 * mix) + out * mix


def pad(freqs, dur_s, seed=0, attack=1.2, release=1.4, lp_start=520.0, lp_end=2600.0, sweep_s=None, voices=(-13.0, -6.0, 0.0, 6.0, 13.0),
        spread=0.9, chorus_mix=0.55, sub_boost=0.0):
    """Detuned saw stacks (wavetable, band-limited), chorus, a swept 24 dB low-pass and slow swells.
    Output peak ~1.0. The caller sets the level curve/swells with gain envelopes."""
    rng = rng_for(80, seed)
    n = int((dur_s + release) * SR)
    t = _t(n)
    L = np.zeros(n)
    R = np.zeros(n)
    nv = 0
    for i, f in enumerate(freqs):
        pn = _voice_pan(f, i, spread) if f > 150 else 0.0
        for j, c in enumerate(voices):
            vib = 1.0 + 0.0006 * np.sin(TWO_PI * (0.17 + 0.04 * j) * t + rng.uniform(0, TWO_PI))
            v = osc_saw(f * 2.0 ** (c / 1200.0) * vib, n, phase0=float(rng.uniform(0, 1)))
            sgn = -1.0 if (j % 2) else 1.0
            gl, gr = pan_gains(np.clip(pn + 0.45 * sgn, -1.0, 1.0))
            L += v * gl
            R += v * gr
            nv += 1
    sc = 1.0 / np.sqrt(nv)
    sw = float(sweep_s if sweep_s else attack)
    fc = lp_end + (lp_start - lp_end) * np.exp(-t / max(0.05, sw * 0.8))
    st = np.stack([svf4(L * sc, fc, 0.75, "lp"), svf4(R * sc, fc, 0.75, "lp")], axis=1)
    st = chorus(st, mix=chorus_mix)
    env = np.ones(n)
    na = int(attack * SR)
    env[:na] = (0.5 - 0.5 * np.cos(np.pi * np.arange(na) / na)) ** 1.3
    nr = int(release * SR)
    nd = n - nr
    env[nd:] = 0.5 + 0.5 * np.cos(np.pi * (np.arange(nr) + 1) / (nr + 1))
    st *= env[:, None]
    return st / (np.max(np.abs(st)) + 1e-12)


def shimmer(freqs, dur_s, seed=0, attack=1.0, release=2.0, vib_hz=5.2, vib_cents=7.0):
    """glassy sine/triangle partials with slow vibrato and independent L/R detune: the high F#5-A5-D6 halo."""
    rng = rng_for(81, seed)
    n = int((dur_s + release) * SR)
    t = _t(n)
    out = np.zeros((n, 2))
    for i, f in enumerate(freqs):
        for ch, c in ((0, -3.0), (1, 3.0)):
            ph = rng.uniform(0, TWO_PI)
            vib = 1.0 + (vib_cents / 1200.0) * np.sin(TWO_PI * (vib_hz + 0.37 * i) * t + ph) * np.minimum(t / 1.5, 1.0)
            phase = TWO_PI * np.cumsum(f * 2.0 ** (c / 1200.0) * vib) / SR
            out[:, ch] += (np.sin(phase) + 0.18 * np.sin(2 * phase + 0.7) + 0.06 * np.sin(3 * phase)) / (1.0 + 0.25 * i)
    env = np.ones(n)
    na = int(attack * SR)
    env[:na] = 0.5 - 0.5 * np.cos(np.pi * np.arange(na) / na)
    nr = int(release * SR)
    env[n - nr:] = 0.5 + 0.5 * np.cos(np.pi * (np.arange(nr) + 1) / (nr + 1))
    out *= env[:, None]
    return out / (np.max(np.abs(out)) + 1e-12)


# ======================================================================================
# 9  RISERS
# ======================================================================================
def shepard(dur_s, seed=0, center=620.0, sigma_oct=1.45, r0=0.22, r1=0.85, f_lo=24.0, detune_cents=2.5, drive=1.4,
            amp0_db=-30.0, amp1_db=0.0):
    """Shepard-tone riser: octave-spaced sines under a fixed Gaussian window (in log-frequency), every component
    gliding upward exponentially - the pitch keeps rising but the spectral envelope never moves. The glide rate
    accelerates from r0 to r1 octaves per second. Stereo: independent random phases and +-detune per channel."""
    rng = rng_for(90, seed)
    n = int(dur_s * SR)
    t = _t(n)
    T = dur_s
    R = r0 * t + 0.5 * (r1 - r0) * t ** 2 / T                      # octaves risen at time t
    total = r0 * T + 0.5 * (r1 - r0) * T
    kmax = int(np.ceil(np.log2(0.5 * SR / f_lo) + total)) + 1
    out = np.zeros((n, 2))
    ws = np.zeros(n)
    for k in range(0, kmax + 1):
        # component k starts at f_lo * 2^(k - ceil(total))
        e = k - int(np.ceil(total))
        fk = f_lo * 2.0 ** (e + R)
        w = np.exp(-0.5 * (np.log2(np.maximum(fk, 1e-3) / center) / sigma_oct) ** 2)
        w = np.where((fk > 18000.0) | (fk < 18.0), 0.0, w)
        if not np.any(w > 1e-4):
            continue
        ws += w
        for ch, sgn in ((0, 1.0), (1, -1.0)):
            ph = TWO_PI * np.cumsum(fk * 2.0 ** (sgn * detune_cents / 1200.0)) / SR + rng.uniform(0, TWO_PI)
            out[:, ch] += w * np.sin(ph)
    out /= np.maximum(np.max(ws), 1e-9)
    amp = dbl(amp0_db + (amp1_db - amp0_db) * (t / T) ** 1.5)
    out = tanh_os(out * 1.1, drive, q="mid") * amp[:, None]
    out = fade_io(out, 0.05, 0.003)
    return out / (np.max(np.abs(out)) + 1e-12)


def noise_riser(dur_s, f0=260.0, f1=11500.0, q=1.2, seed=0, trem=(6.0, 40.0), trem_depth=0.30, amp0_db=-42.0,
                amp1_db=0.0, curve=2.2, lowcut=120.0):
    """white noise through an exponentially rising resonant band-pass (+ high-pass), accelerating tremolo,
    exponential crescendo; stereo-decorrelated."""
    rng = rng_for(91, seed)
    n = int(dur_s * SR)
    u = np.arange(n) / max(1, n - 1)
    t = _t(n)
    fc = f0 * (f1 / f0) ** (u ** 1.15)
    chans = []
    for ch in range(2):
        a = svf(white(n, rng), fc * (1.0 + 0.02 * ch), q, "bp")
        a += 0.5 * svf(white(n, rng), fc * 0.55, q, "bp")
        a = hp(a, lowcut, 2)
        chans.append(a / (np.std(a) + 1e-12))
    st = np.stack(chans, axis=1)
    rate = trem[0] + (trem[1] - trem[0]) * u ** 2.0
    trm = 1.0 - trem_depth * (0.5 + 0.5 * np.sin(TWO_PI * np.cumsum(rate) / SR))
    amp = dbl(amp0_db + (amp1_db - amp0_db) * u ** curve) * trm
    st *= amp[:, None]
    st = fade_io(st, 0.01, 0.002)
    return st / (np.max(np.abs(st)) + 1e-12)


# ======================================================================================
# 10  BELL, STAMP, CLICKS
# ======================================================================================
def bell(f, dur_s=4.0, seed=0, ratio=3.5, index=4.4, idx_tau=0.22, amp_tau=1.7, shimmer_db=-13.0, strike=0.5,
         floor_idx=0.22, pure=0.55):
    """FM bell, carrier : modulator = 1 : 3.5. The modulation index decays fast (bright strike -> pure tone),
    a pure fundamental keeps the pitch unambiguous, an octave partial adds glass; +-1.2 cent L/R detune with a
    0.45 ms Haas delay; a tiny strike tick for definition. The A5 -> D6 motif uses this voice."""
    rng = rng_for(100, seed)
    n = int(dur_s * SR)
    t = _t(n)
    idx = floor_idx + (index - floor_idx) * np.exp(-t / idx_tau)
    amp = np.exp(-np.minimum(t / amp_tau, 60.0))
    chans = []
    for c in (+0.35, -0.35):
        fc = f * 2.0 ** (c / 1200.0)
        y = fm_bell_core(fc, ratio, idx, amp, n)
        y += pure * np.sin(TWO_PI * fc * t) * np.exp(-np.minimum(t / (amp_tau * 1.25), 60.0))
        y += dbl(shimmer_db) * np.sin(TWO_PI * 2.0 * fc * t) * np.exp(-np.minimum(t / (amp_tau * 0.55), 60.0))
        chans.append(y)
    d = int(0.00045 * SR)
    chans[1] = np.concatenate([np.zeros(d), chans[1]])[:n]
    st = np.stack(chans, axis=1)
    nb = int(0.003 * SR)
    sk = hp(white(nb, rng), 3500.0, 2) * np.exp(-_t(nb) / 0.0006)
    st[:nb] += strike * 0.25 * np.max(np.abs(st)) * _mono2(sk / (np.max(np.abs(sk)) + 1e-12))
    st = fade_io(st, 0.0006, min(1.2, dur_s * 0.3))
    return _norm_peak(st, 1.0)


def fm_bell_core(fc, ratio, idx, amp, n):
    return dsp.fm_tone(fc, ratio, idx, n, os=2, amp=amp)


def stamp(note, seed=0, size=1.0, note_level=0.55, bright=1.0):
    """SOLD signboard slam: a thud + sheet-metal panel slap (modal bank, inharmonic) + paper rustle + crack, with one
    pitched bell-pluck note (the dominant arpeggio step). Dense, short, expensive."""
    rng = rng_for(110, seed)
    f = note_hz(note) if isinstance(note, str) else float(note)
    n = int(1.6 * SR)
    t = _t(n)
    nt = int(0.30 * SR)
    tt = _t(nt)
    thud = np.sin(TWO_PI * 96.0 * (tt + 0.45 * 0.02 * (1 - np.exp(-tt / 0.02)))) * exp_env(nt, 0.075, 0.0004)
    thud = tanh_os(thud, 1.7, q="lf")
    nbd = int(0.12 * SR)
    bodyn = bp(white(nbd, rng), 160.0, 620.0, 2) * np.exp(-_t(nbd) / 0.03)
    npn = int(0.35 * SR)
    panel = _modes_stereo(1380.0 * np.array([1.0, 1.47, 2.09, 2.83, 3.62, 4.7]),
                          np.array([0.060, 0.045, 0.034, 0.024, 0.017, 0.012]),
                          np.array([1.0, 0.8, 0.65, 0.5, 0.4, 0.3]), npn, rng, jitter=0.01, width=1.0)
    nps = int(0.22 * SR)
    paper = _pair_noise_burst(nps, rng, 4200.0, 11500.0, 0.045, 2, 1.0)
    # papery flutter: random fast AM
    fl = lp(white(nps, rng), 180.0, 2)
    fl = 0.55 + 0.45 * np.tanh(2.5 * fl / (np.std(fl) + 1e-12))
    paper *= fl[:, None]
    nck = int(0.02 * SR)
    ck = _pair_noise_burst(nck, rng, 2500.0, 9500.0, 0.003, 2, 1.0)

    out = np.zeros((n, 2))
    _add(out, _mono2(thud), 0, 0.80)
    _add(out, _mono2(bodyn / (np.max(np.abs(bodyn)) + 1e-12)), 0, 0.42)
    _add(out, panel / (np.max(np.abs(panel)) + 1e-12), 0, 0.50)
    _add(out, paper / (np.max(np.abs(paper)) + 1e-12), 0, 0.26 * bright)
    _add(out, ck / (np.max(np.abs(ck)) + 1e-12), 0, 0.46)
    # the pitched note: FM bell-pluck, bright attack, ~0.7 s
    nbn = int(1.4 * SR)
    pl = bell(f, dur_s=nbn / SR, seed=seed, ratio=3.5, index=3.2, idx_tau=0.12, amp_tau=0.55, strike=0.0, pure=0.7)
    _add(out, pl, 0, note_level)
    out = fade_io(out, 0.00004, 0.3)
    return _norm_peak(out, 1.0)


def mech_click(seed=0):
    """precise mechanical click (the rebus latching): a 1.2 ms HP micro-click, a damped 2.1 kHz tock, a 120 Hz seat."""
    rng = rng_for(120, seed)
    n = int(0.25 * SR)
    t = _t(n)
    nk = int(0.003 * SR)
    mc = _stereo_from_two(hp(white(nk, rng), 3200.0, 2), hp(white(nk, rng), 3200.0, 2), 0.6) * np.exp(-_t(nk) / 0.0004)[:, None]
    tock = (np.sin(TWO_PI * 2100.0 * t) + 0.6 * np.sin(TWO_PI * 1480.0 * t + 0.4)) * np.exp(-t / 0.006)
    seat = np.sin(TWO_PI * 120.0 * t) * np.exp(-t / 0.018)
    out = _mono2(tock) * 0.5 + _mono2(seat) * 0.30
    out[:nk] += 0.9 * mc / (np.max(np.abs(mc)) + 1e-12)
    out = fade_io(out, 0.00002, 0.05)
    return _norm_peak(out, 1.0)


def tick_tiny(seed=0):
    """the descriptor tick: very small, very clean - a 5.1 kHz damped sine with a whisper of 2.55 kHz."""
    n = int(0.12 * SR)
    t = _t(n)
    x = (np.sin(TWO_PI * 5100.0 * t) + 0.3 * np.sin(TWO_PI * 2550.0 * t)) * np.exp(-t / 0.0045)
    return _norm_peak(fade_io(_mono2(x), 0.00002, 0.03), 1.0)


# ======================================================================================
# 11  AMBIENCE
# ======================================================================================
def _slow_noise(n, rng, hz):
    """unit-RMS smooth random control signal with bandwidth ~hz."""
    x = signal.sosfilt(signal.butter(2, hz, "lowpass", fs=SR, output="sos"), rng.standard_normal(n))
    return x / (np.std(x) + 1e-12)


def wind(dur_s, seed=0):
    """high-altitude wind: pink-ish noise through two drifting resonances (a low body and a thin whistle) with slow
    gusting; fully independent L/R. Peak ~1.0 (the caller sets a very low level)."""
    rng = rng_for(130, seed)
    n = int(dur_s * SR)
    chans = []
    for ch in range(2):
        r = rng_for(130, seed, ch)
        base = lp(white(n, r), 2400.0, 2)
        f1 = 380.0 + 170.0 * _slow_noise(n, r, 0.07)
        f2 = 1500.0 + 520.0 * _slow_noise(n, r, 0.05)
        f3 = 2900.0 + 700.0 * _slow_noise(n, r, 0.04)
        y = svf(base, f1, 1.3, "bp") + 0.45 * svf(base, f2, 7.0, "bp") + 0.18 * svf(base, f3, 10.0, "bp")
        y += 0.10 * hp(white(n, r), 3500.0, 2)
        gust = np.exp(0.45 * _slow_noise(n, r, 0.15))
        chans.append(y / (np.std(y) + 1e-12) * gust)
    st = np.stack(chans, axis=1)
    st = fade_io(st, 0.5, 0.5)
    return st / (np.max(np.abs(st)) + 1e-12)
