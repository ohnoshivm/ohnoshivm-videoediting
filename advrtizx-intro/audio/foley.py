"""foley.py - physical models of real sources for the DOMINANT score (all procedural, no samples).

Steel beams (free-free bar modes + plate modes, beating twins), rebar / chain rattles (dense metal grains),
hydraulic jacks (pump pulsation, servo whine with moving formants), crane cable stick-slip creak + winch whine,
concrete thumps (body resonance), glass-panel seats and ripples, canyon slap echo for impacts, turbulent
whooshes with resonant cavities / Doppler / pressure, city-air beds, signboard slams, string ensemble,
choir 'ah' (formant synthesis). Every function takes a seed: no two hits are the same.
"""
from __future__ import annotations

import numpy as np
from scipy import signal

import dsp
from dsp import (SR, TWO_PI, bp, exp_env, fade_io, hp, lp, osc_saw, pan_gains, rng_for, svf, svf4, tanh_os, white,
                 brown, pink, dbl, note_hz)

BAR_MODES = (1.0, 2.756, 5.404, 8.933, 13.344, 18.64, 24.97)       # free-free bar


def _t(n):
    return np.arange(n) / SR


def _add(dst, src, at, g=1.0):
    e = min(len(dst), at + len(src))
    if e > at and at >= 0:
        dst[at:e] += src[:e - at] * g


def _norm(x, p=1.0):
    m = float(np.max(np.abs(x)))
    return x * (p / m) if m > 0 else x


def _mono2(x):
    return np.stack([x, x], axis=1)


# ---------------------------------------------------------------------------------------------- steel beam
def beam_clang(seed, f0=None, dur=2.4, size=1.0, hardness=1.0, plate=True):
    """Struck steel beam: free-free bar modes x a per-hit random stretch plus random plate modes; every mode is a
    beating pair (L/R detune 0.1-0.4 %), decay shortening with frequency; hard noise contact + 'tick'. Stereo."""
    rng = rng_for(300, seed)
    n = int(dur * SR)
    t = _t(n)
    f0 = float(f0 if f0 else rng.uniform(140.0, 620.0) / max(size, 0.4))
    ratios = [r * rng.uniform(0.985, 1.02) for r in BAR_MODES]
    if plate:
        ratios += list(np.sort(rng.uniform(1.4, 11.0, 7)))
    out = np.zeros((n, 2))
    T0 = float(rng.uniform(1.2, 2.2)) * size
    for k, r in enumerate(ratios):
        f = f0 * r
        if f > 15000:
            continue
        a = float(rng.uniform(0.4, 1.0)) / (1.0 + 0.22 * k) * (hardness if k > 2 else 1.0)
        tau = T0 / (1.0 + 0.45 * (f / f0) ** 0.6) * float(rng.uniform(0.7, 1.2))
        m = min(n, int(min(tau * 9, dur) * SR))
        tt = t[:m]
        env = np.exp(-tt / tau)
        for ch in range(2):
            fd = f * (1.0 + (0.0015 + 0.0025 * rng.random()) * (1 if ch else -1))
            out[:m, ch] += a * np.sin(TWO_PI * fd * tt + 0.0) * env
    nk = int(0.006 * SR)
    for ch in range(2):
        c = hp(white(nk, rng), 1500.0, 2) * np.exp(-_t(nk) / 0.0011)
        out[:nk, ch] += 0.9 * np.max(np.abs(out)) * c / (np.max(np.abs(c)) + 1e-12) * 0.5
    return fade_io(_norm(out), 0.00004, 0.25)


# ---------------------------------------------------------------------------------------------- rattles
def rattle(seed, dur, dens0=160.0, dens1=20.0, lo=1400.0, hi=8000.0, level_decay=None, chain=False):
    """rebar / chain rattle: Poisson metal grains (tiny modal pings), density sliding dens0 -> dens1 per second."""
    rng = rng_for(310, seed)
    n = int(dur * SR)
    out = np.zeros((n, 2))
    t, cnt = 0.0, 0
    while t < dur and cnt < 700:
        u = t / dur
        lam = dens0 + (dens1 - dens0) * u
        t += rng.exponential(1.0 / max(lam, 1.0))
        i = int(t * SR)
        L = int(rng.uniform(0.004, 0.03 if chain else 0.016) * SR)
        if i + L >= n:
            break
        f = float(np.exp(rng.uniform(np.log(lo), np.log(hi))))
        tau = float(rng.uniform(0.0015, 0.008 if not chain else 0.016))
        tt = _t(L)
        g = (np.sin(TWO_PI * f * tt) + 0.6 * np.sin(TWO_PI * f * 2.76 * tt + 1.0)) * np.exp(-tt / tau)
        a = float(np.exp(rng.uniform(np.log(0.08), 0.0)))
        if level_decay:
            a *= np.exp(-t / level_decay)
        pl, pr = pan_gains(rng.uniform(-0.9, 0.9))
        out[i:i + L, 0] += g * a * pl * 1.41
        out[i:i + L, 1] += g * a * pr * 1.41
        cnt += 1
    return fade_io(_norm(out), 0.002, 0.01)


# ---------------------------------------------------------------------------------------------- hydraulics
def hydraulic_jack(seed, dur, rate0=7.0, rate1=14.0, whine0=360.0, whine1=980.0, push=1.0):
    """pump-pulsed pressure noise + servo whine (saw with moving formant band-passes) + valve chatter."""
    rng = rng_for(320, seed)
    n = int(dur * SR)
    t = _t(n)
    u = t / dur
    rate = rate0 + (rate1 - rate0) * u
    pulse = 0.55 + 0.45 * np.sin(TWO_PI * np.cumsum(rate) / SR)
    nz = np.stack([svf(white(n, rng), 280.0 + 700.0 * u, 1.1, "bp") for _ in range(2)], axis=1)
    nz /= np.std(nz) + 1e-12
    f = whine0 + (whine1 - whine0) * u ** 1.3
    f = f * (1 + 0.012 * np.sin(TWO_PI * 5.3 * t + 0.4))
    w = osc_saw(f, n) + 0.5 * osc_saw(f * 1.004, n, 0.3)
    fm = 700.0 + 1500.0 * u
    w = svf(w, fm, 4.0, "bp") + 0.6 * svf(w, fm * 2.3, 5.0, "bp") + 0.2 * w
    w = tanh_os(w / (np.max(np.abs(w)) + 1e-12), 1.6, q="mid")
    imp = (rng.random(n) > 0.9993) * rng.uniform(0.3, 1.0, n)               # sparse valve ticks (~30 / s)
    chat = svf(imp, 2600.0, 6.0, "bp") * 0.5                                   # ringing 2-3 ms ticks, not raw impulses
    st = nz * 0.7 * pulse[:, None] + _mono2(w) * 0.35 * (0.5 + 0.5 * u)[:, None] + _mono2(chat) * 0.4
    st *= push
    return fade_io(_norm(st), 0.03, 0.04)


def crane_creak(seed, dur):
    """cable stick-slip (a pulse train of wandering period through drifting resonances) + winch whine with vibrato."""
    rng = rng_for(330, seed)
    n = int(dur * SR)
    t = _t(n)
    imp = np.zeros(n)
    i = 0
    while i < n:
        imp[i] = rng.uniform(0.3, 1.0)
        i += int(SR * np.clip(0.022 + 0.012 * np.sin(TWO_PI * 0.7 * i / SR) + rng.normal(0, 0.004), 0.008, 0.06))
    f1 = 640.0 + 120.0 * np.sin(TWO_PI * 0.31 * t)
    f2 = 1480.0 + 260.0 * np.sin(TWO_PI * 0.23 * t + 1.0)
    cr = svf(imp, f1, 26.0, "bp") + 0.7 * svf(imp, f2, 30.0, "bp")
    cr *= 0.5 + 0.5 * np.maximum(0, np.sin(TWO_PI * 0.45 * t + rng.uniform(0, 6)))
    fw = 310.0 + 90.0 * (t / dur) + 4.0 * np.sin(TWO_PI * 6.0 * t)
    wn = np.sin(TWO_PI * np.cumsum(fw) / SR) + 0.4 * np.sin(TWO_PI * np.cumsum(2 * fw) / SR)
    wn = svf(wn, 1100.0, 1.0, "lp")
    x = cr / (np.std(cr) + 1e-12) * 0.6 + wn * 0.35
    return fade_io(_mono2(x) * np.array([[1.0, 0.9]]), 0.15, 0.15) / 3.0


def concrete_thump(seed, f=70.0, dur=0.7, size=1.0):
    rng = rng_for(340, seed)
    n = int(dur * SR)
    t = _t(n)
    x = lp(white(n, rng), 220.0, 4) * np.exp(-t / 0.035)
    x /= np.max(np.abs(x)) + 1e-12
    for r, a, tau in ((1.0, 1.0, 0.14), (1.71, 0.6, 0.09), (2.43, 0.4, 0.06)):
        x += a * np.sin(TWO_PI * f * r * rng.uniform(0.97, 1.03) * (t + 0.01 * (1 - np.exp(-t / 0.02)))) * np.exp(-t / (tau * size))
    nc = int(0.012 * SR)
    x[:nc] += 0.25 * bp(white(nc, rng), 600.0, 3000.0, 2) * np.exp(-_t(nc) / 0.003)
    return _mono2(fade_io(tanh_os(_norm(x) * 0.9, 1.4, q="lf"), 0.0003, 0.08))


# ---------------------------------------------------------------------------------------------- glass
def glass_ripple(seed, dur, n_seats=24, accel=1.8):
    """glass panels seating: bright tick + tiny ring, rapid ripples (density accelerating), wide pan."""
    rng = rng_for(350, seed)
    n = int(dur * SR) + int(0.15 * SR)
    out = np.zeros((n, 2))
    ts = np.sort(rng.random(n_seats) ** (1.0 / accel)) * dur
    for tm in ts:
        i = int(tm * SR)
        L = int(rng.uniform(0.04, 0.09) * SR)
        tt = _t(L)
        g = np.zeros(L)
        for _ in range(3):
            g += rng.uniform(0.3, 1.0) * np.sin(TWO_PI * rng.uniform(2200, 7500) * tt) * np.exp(-tt / rng.uniform(0.012, 0.04))
        nk = int(0.0012 * SR)
        g[:nk] += 1.2 * hp(white(nk, rng), 4000.0, 2) * np.exp(-_t(nk) / 0.0004)
        a = rng.uniform(0.25, 1.0)
        pl, pr = pan_gains(rng.uniform(-0.85, 0.85))
        out[i:i + L, 0] += g * a * pl * 1.41
        out[i:i + L, 1] += g * a * pr * 1.41
    return fade_io(_norm(out), 0.0005, 0.02)


# ---------------------------------------------------------------------------------------------- impact extras
def enhance_impact(x, f0, size, seed, tail, pan=0.0, sub_tune=None, canyon=True):
    """more physical layering on top of synth.impact: <3 ms click, structure body resonance, debris-free air-pressure
    thump, canyon slap echo (discrete reflections 80-300 ms, darker each bounce) and a 'felt' sub tail on the harmony."""
    rng = rng_for(360, int(seed) % 100000, int(f0 * 10))
    n = len(x)
    t = _t(n)
    out = x.copy()
    nk = int(0.0028 * SR)
    for ch in range(2):
        c = hp(white(nk, rng), 2500.0, 2) * np.exp(-_t(nk) / 0.0007)
        out[:nk, ch] += 0.22 * size * c / (np.max(np.abs(c)) + 1e-12)
    # structure body: low modes of a massive frame
    nb = min(n, int(1.6 * SR))
    tb = _t(nb)
    body = np.zeros(nb)
    for r, a, tau in ((2.0, 1.0, 0.55), (3.1, 0.6, 0.38), (4.3, 0.45, 0.30), (5.9, 0.3, 0.22)):
        body += a * np.sin(TWO_PI * f0 * r * rng.uniform(0.99, 1.01) * tb) * np.exp(-tb / (tau * size))
    out[:nb] += _mono2(body) * 0.10 * size
    # air-pressure thump: smooth, grain-free
    na = int(0.22 * SR)
    th = lp(white(na, rng), 70.0, 4) * np.sin(np.pi * np.arange(na) / na) ** 2
    out[:na] += _mono2(th / (np.max(np.abs(th)) + 1e-12)) * 0.16 * size
    # canyon slap
    if canyon and size >= 0.5:
        mid = bp(out[:int(0.5 * SR)].mean(axis=1), 160.0, 3200.0, 2)
        ntap = int(rng.integers(8, 13))
        times = np.sort(rng.uniform(0.08, 0.30, ntap))
        for j, tm in enumerate(times):
            g = 0.30 * size * np.exp(-tm / 0.18) * rng.uniform(0.5, 1.0)
            seg = lp(mid, float(rng.uniform(1500, 5000)) * (0.8 ** j), 2)
            pl, pr = pan_gains(rng.uniform(-0.95, 0.95))
            i = int(tm * SR)
            e = min(n, i + len(seg))
            out[i:e, 0] += seg[:e - i] * g * pl * 1.41
            out[i:e, 1] += seg[:e - i] * g * pr * 1.41
    # felt sub tail tuned to the harmony (root of the chord context)
    ft = sub_tune if sub_tune else f0
    tail_n = min(n, int(max(tail, 1.5) * SR))
    ts_ = t[:tail_n]
    felt = np.sin(TWO_PI * ft * ts_) * np.exp(-ts_ / (tail / 2.2)) * np.minimum(ts_ / 0.08, 1.0)
    out[:tail_n] += _mono2(felt) * 0.07 * size
    return out


# ---------------------------------------------------------------------------------------------- whoosh v2
def whoosh2(dur_s, kind="whip", pan0=-0.85, pan1=0.85, seed=0, f_lo=450.0, f_hi=7200.0, q=1.7, peak_at=0.78, low=0.30,
            end_fade_ms=5.0, start_fade_ms=2.0, pressure=0.0):
    """turbulent air: noise through three drifting resonant cavities, Doppler centre-frequency + level, ITD/ILD pass-by,
    and a low 'wind pressure' layer on fast moves."""
    rng = rng_for(400, seed)
    n = int(round(dur_s * SR))
    u = np.arange(n) / max(1, n - 1)
    if kind == "whip":
        fc = np.where(u < peak_at, f_lo * (f_hi / f_lo) ** (u / peak_at),
                      f_hi * ((f_lo * 1.7) / f_hi) ** (np.clip((u - peak_at) / (1 - peak_at), 0, 1)))
        amp = np.where(u < peak_at, (u / peak_at) ** 1.6,
                       np.maximum(np.cos(0.5 * np.pi * np.clip((u - peak_at) / (1 - peak_at), 0.0, 1.0)), 0.0) ** 1.2)
        qv = q + 1.2 * np.exp(-((u - peak_at) / 0.12) ** 2)
    elif kind in ("fall", "dive"):
        fc = f_lo * (f_hi / f_lo) ** ((1 - u) ** 1.35)
        amp = u ** (1.9 if kind == "dive" else 1.4)
        qv = np.full(n, q)
    else:
        fc = f_lo * (f_hi / f_lo) ** (u ** 0.9)
        amp = np.sin(np.pi * u) ** 2.2
        qv = np.full(n, q)
    turb = 1.0 + 0.25 * lp(white(n, rng), 60.0, 2) / 0.1                       # turbulence: slow random modulation
    turb = np.clip(turb, 0.4, 1.8)
    chans = []
    for ch in range(2):
        y = np.zeros(n)
        for r, qq, w in ((1.0, 1.0, 1.0), (1.52, 1.3, 0.55), (0.5, 0.8, 0.6)):
            wob = 1.0 + 0.04 * lp(white(n, rng), 25.0, 2) / 0.05
            y += w * svf(white(n, rng), fc * r * np.clip(wob, 0.85, 1.15) * (1 + 0.03 * ch), qv * qq, "bp") / (1.0)
        chans.append(y / (np.std(y) + 1e-12) * turb)
    a, b = chans
    pan = pan0 + (pan1 - pan0) * u
    gl, gr = pan_gains(pan)
    st = np.stack([a * gl, b * gr], axis=1) * np.sqrt(2.0)
    # ITD: far channel delayed up to 0.5 ms following the pan
    d = int(0.0005 * SR * abs(pan1 - pan0) / 1.7)
    if d > 0 and abs(pan1 - pan0) > 0.3:
        side = 0 if pan1 > pan0 else 1
        early = st[:, side].copy()
        st[d:, side] = early[:-d] * 0.0 + st[d:, side]
    if low > 0 or pressure > 0:
        lw = lp(white(n, rng), 200.0, 4)
        lw /= np.std(lw) + 1e-12
        wp = (low * 0.5 + pressure) * lw * (amp ** 1.3)
        st += _mono2(wp)
    if kind == "dive":
        f = 440.0 * 0.25 ** (u ** 1.3)
        s = osc_saw(f, n) + osc_saw(f * 1.006, n)
        s = svf4(tanh_os(s / 2.0, 1.8, q="mid"), 900.0 * (1 - 0.6 * u) + 150.0, 1.0, "lp")
        st += 0.35 * _mono2(s) * (amp ** 1.6)[:, None]
    st *= amp[:, None]
    return _norm(fade_io(st, start_fade_ms * 1e-3, end_fade_ms * 1e-3))


# ---------------------------------------------------------------------------------------------- ambience
def city_air(dur_s, seed, rumble=1.0, gust=1.0, top=0.0):
    """city bed: low urban rumble (brown, 25-90 Hz, slow swell), distant gusts (pink band 150-900 Hz with slow random
    level), faint far traffic hiss; `top` mixes in high-altitude whistle wind. Stereo-decorrelated."""
    n = int(dur_s * SR)
    chans = []
    for ch in range(2):
        r = rng_for(410, seed, ch)
        rum = bp(brown(n, r), 25.0, 90.0, 2)
        rum /= np.std(rum) + 1e-12
        sl = lp(white(n, r), 0.12, 2)
        sl /= np.std(sl) + 1e-12
        rum *= np.exp(0.35 * sl)
        g = bp(pink(n, r), 150.0, 900.0, 2)
        g /= np.std(g) + 1e-12
        sg = lp(white(n, r), 0.2, 2)
        sg /= np.std(sg) + 1e-12
        g *= np.exp(0.8 * sg) * 0.4
        hiss = bp(white(n, r), 2500.0, 7000.0, 2)
        hiss /= np.std(hiss) + 1e-12
        x = rumble * 0.8 * rum + gust * g + 0.05 * hiss
        if top > 0:
            f2 = 1500.0 + 520.0 * lp(white(n, r), 0.05, 2) / 0.02
            x += top * 0.25 * svf(pink(n, r), np.clip(f2, 500, 3000), 7.0, "bp")
        chans.append(x)
    st = np.stack(chans, axis=1)
    return _norm(fade_io(st, 1.0, 1.0))


# ---------------------------------------------------------------------------------------------- signboard slam
def signboard(seed, size=1.0):
    """metal frame clang + big panel wobble (low flexing 'wub') + two post thuds."""
    rng = rng_for(420, seed)
    n = int(1.8 * SR)
    t = _t(n)
    out = np.zeros((n, 2))
    fr = beam_clang(seed + 77, f0=float(rng.uniform(190, 330)), dur=1.4, size=0.8 * size, hardness=1.1)
    _add(out, fr, 0, 0.55)
    wf = rng.uniform(62.0, 98.0)
    flex = 1.0 + 0.10 * np.exp(-t / 0.18) * np.sin(TWO_PI * 7.0 * t)
    wub = np.sin(TWO_PI * np.cumsum(wf * flex * (1 + 0.5 * np.exp(-t / 0.06))) / SR) * np.exp(-t / 0.45)
    wub *= 0.7 + 0.3 * np.sin(TWO_PI * 5.5 * t)
    _add(out, _mono2(tanh_os(wub, 1.5, q="lf")), 0, 0.45)
    pan = nz = None
    for j, dt in enumerate((0.045, 0.118)):
        th = concrete_thump(seed * 3 + j, f=float(rng.uniform(55, 85)), dur=0.5, size=0.8)
        _add(out, th, int(dt * SR), 0.5 / (1 + j))
    return fade_io(_norm(out), 0.00004, 0.3)


# ---------------------------------------------------------------------------------------------- music: strings / choir
def string_note(f, dur, seed, voices=12, accent=1.0):
    """low string ensemble note: many detuned bowed saws (+-14 cents, slight vibrato), bow-noise attack, LP 2.4 kHz."""
    rng = rng_for(500, seed, int(f))
    n = int((dur + 0.06) * SR)
    t = _t(n)
    L = np.zeros(n)
    R = np.zeros(n)
    for v in range(voices):
        c = rng.uniform(-14, 14)
        vib = 1.0 + 0.0018 * np.sin(TWO_PI * rng.uniform(4.6, 5.8) * t + rng.uniform(0, 6))
        s = osc_saw(f * 2 ** (c / 1200.0) * vib, n, float(rng.uniform(0, 1)))
        pl, pr = pan_gains(rng.uniform(-0.7, 0.7))
        L += s * pl
        R += s * pr
    st = np.stack([L, R], axis=1) / np.sqrt(voices)
    st = np.stack([svf4(st[:, 0], 1100.0 + 1300.0 * accent, 0.9, "lp"), svf4(st[:, 1], 1100.0 + 1300.0 * accent, 0.9, "lp")], axis=1)
    nb = int(0.12 * SR)
    bow = np.stack([bp(white(nb, rng), 900.0, 4500.0, 2) for _ in range(2)], axis=1) * np.exp(-_t(nb) / 0.04)[:, None]
    st[:nb] += 0.25 * bow / (np.max(np.abs(bow)) + 1e-12) * np.max(np.abs(st))
    env = np.minimum(t / 0.022, 1.0) * np.exp(-t / (dur * 1.6))
    nr = int(0.05 * SR)
    env[-nr:] *= np.linspace(1, 0, nr)
    return _norm(st * env[:, None])


VOWEL_AH = ((800, 1.0, 80), (1150, 0.5, 90), (2900, 0.18, 120), (3900, 0.08, 130))


def choir(freqs, dur, seed, attack=1.6, release=2.0, voices=3):
    """choir-like 'ah': glottal saws (vibrato 5.2 Hz + jitter) through parallel vowel formants + breath, several
    voices per note, independent L/R."""
    rng = rng_for(510, seed)
    n = int((dur + release) * SR)
    t = _t(n)
    out = np.zeros((n, 2))
    for i, f in enumerate(freqs):
        for v in range(voices):
            vib = 1.0 + (0.0045 * np.minimum(t / 1.2, 1.0)) * np.sin(TWO_PI * rng.uniform(4.8, 5.6) * t + rng.uniform(0, 6))
            vib *= 1.0 + 0.0008 * lp(white(n, rng), 8.0, 2) / 0.04
            src = osc_saw(f * vib * 2 ** (rng.uniform(-8, 8) / 1200.0), n, float(rng.uniform(0, 1)))
            y = np.zeros(n)
            for fc, a, bw in VOWEL_AH:
                y += a * svf(src, fc * (1.0 + 0.01 * (v - 1)), fc / bw, "bp")
            br = bp(white(n, rng), 1500.0, 5000.0, 2) * 0.05
            pl, pr = pan_gains(rng.uniform(-0.8, 0.8))
            y = (y / (np.std(y) + 1e-12) + br)
            out[:, 0] += y * pl
            out[:, 1] += y * pr
    env = np.ones(n)
    na = int(attack * SR)
    env[:na] = (0.5 - 0.5 * np.cos(np.pi * np.arange(na) / na))
    nr = int(release * SR)
    env[-nr:] = 0.5 + 0.5 * np.cos(np.pi * (np.arange(nr) + 1) / (nr + 1))
    return _norm(out * env[:, None])


def early_reflections(x, seed, ms=(11, 19, 31, 47), g=0.25):
    """cheap per-layer depth: a few discrete early reflections (alternating sides) added to a stereo buffer."""
    rng = rng_for(520, seed)
    out = np.zeros((len(x) + int(0.06 * SR), 2))
    out[:len(x)] += x
    for j, m in enumerate(ms):
        i = int(m * 1e-3 * SR * rng.uniform(0.9, 1.1))
        side = j % 2
        seg = lp(x, 6000.0 - 900 * j, 1)
        out[i:i + len(x), side] += seg[:, side] * g * (0.75 ** j)
        out[i:i + len(x), 1 - side] += seg[:, 1 - side] * g * 0.4 * (0.75 ** j)
    return out
