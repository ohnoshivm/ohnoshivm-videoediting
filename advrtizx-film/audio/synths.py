"""synths.py - one function per instrument recipe of TREATMENT 5.2 (I1..I19) + WALLS.

Contract: every recipe takes a `Hit` and returns a float64 (n, 2) stereo array whose FIRST sample is the
hit's own sample (sample-accurate; no pre-roll). Levels follow the treatment's "peak dBFS before the master":
the returned array has the hit's `db` as its peak. Everything is synthesised: band-limited additive oscillators,
band-limited FM, filtered noise, Karplus-Strong. No samples, no licensed audio.

Every event gets a short fade-in/out (no clicks); fade-ins are 0.06-1 ms so transients stay on the frame.
"""
from __future__ import annotations

import numpy as np
from scipy import signal

from dsp import (EASE, SR, SPF, N_TOTAL, biquad, brown, butter, curve_db, curve_log, dbl, ease_curve, f2s,
                 fade_io, fm_add, pan_gains, peak_to, phase_acc, pink, rng_for, saw_add, speed_curve, svf,
                 to_stereo, white)

TWO_PI = 2.0 * np.pi


def _n(h) -> int:
    """samples spanned by an event with a `dur` in frames, starting at the hit frame."""
    return f2s(h.frame + h.p["dur"]) - f2s(h.frame)


def _jit(h, amt_db=0.5) -> float:
    return float(rng_for(7000, h.idx).uniform(-amt_db, amt_db))


def _smooth(x, ms):
    k = max(1, int(ms * 1e-3 * SR))
    if k < 2:
        return x
    w = np.hanning(2 * k + 1)
    w /= w.sum()
    return np.convolve(np.pad(x, k, mode="edge"), w, mode="valid")


# ======================================================================================
# I2 TICK(f): resonant tick. A damped sinusoid (== 1-sample impulse into a resonant BP, but it starts at
# zero so there is no step) + 1.5 ms white burst HP 4 kHz at -18 dB relative.
# ======================================================================================
def _tick_wave(f, tau, rng, q=30.0, noise_db=-18.0):
    if tau is None:   # Q 30 => tau = Q/(pi f); capped at the recipe's 25 ms, floored at 3 ms
        tau = float(np.clip(q / (np.pi * f), 0.003, 0.025))
    n = int(tau * SR * 9)
    t = np.arange(n) / SR
    body = np.sin(TWO_PI * f * t) * np.exp(-t / tau)
    body /= np.max(np.abs(body))
    nb = int(0.0015 * SR)
    burst = butter(white(nb, rng), "highpass", 4000.0, 2)
    burst *= np.exp(-np.arange(nb) / (0.0004 * SR))
    burst = fade_io(burst, 0.00006, 0.0003)
    burst *= dbl(noise_db) / (np.max(np.abs(burst)) + 1e-12)
    x = body.copy()
    x[:nb] += burst
    return fade_io(x, 0.00008, 0.004)


def I2_tick(h):
    p = h.p
    rng = rng_for(2, h.idx)
    x = _tick_wave(p.get("f", 1000.0), p.get("tau"), rng, q=p.get("q", 30.0))
    return peak_to(to_stereo(x, p.get("pan", 0.0), 0.25), p.get("db", -20.0) + _jit(h))


# ======================================================================================
# I1 PEN: pink noise -> BP 3200 Q1.4 (+30% parallel BP 6500 Q3); amp 0.06*v^0.7; fc +15% over the stroke;
# pan follows the pen tip. Extra: slow random "paper tooth" modulation.
# ======================================================================================
def I1_pen(h):
    p = h.p
    n = _n(h)
    prog = ease_curve(p.get("ease", "DRAFT"), n)
    v = speed_curve(prog)
    drift = 1.0 + 0.15 * prog
    amp = 0.06 * v ** 0.7
    if "path" in p:
        pu = np.array([a for a, _ in p["path"]], dtype=float)
        px = np.array([b for _, b in p["path"]], dtype=float)
        xs = np.interp(prog, pu, px)
    else:
        xs = p["x0"] + (p["x1"] - p["x0"]) * prog

    def voice(k):
        r = rng_for(1, h.idx, k)
        src = pink(n, r)
        y = svf(src, 3200.0 * drift, 1.4, "bp") + 0.3 * svf(src, 6500.0 * drift, 3.0, "bp")
        tooth_src = butter(white(n, r), "lowpass", 45.0, 2)
        tooth_src /= (np.std(tooth_src) + 1e-12)
        return y * (0.75 + 0.25 * np.tanh(tooth_src))

    if p.get("wide"):                 # the S11 "burst": many strokes at once -> decorrelated L/R
        st = np.stack([voice(0) * amp, voice(1) * amp], axis=1)
    else:
        st = to_stereo(voice(0) * amp, 0.6 * (2.0 * xs / 1920.0 - 1.0))
    st = fade_io(st, 0.003, 0.006)
    return peak_to(st, p.get("db", -30.0))


# ======================================================================================
# I3 KNOCK(f): pitch-enveloped sine + 2.3f partial (-14 dB) + 3 ms noise click HP 2 kHz
# ======================================================================================
def I3_knock(h):
    p = h.p
    f = float(p.get("f", 180))
    rng = rng_for(3, h.idx)
    n = int(0.65 * SR)
    t = np.arange(n) / SR
    tp = 0.012
    ph = TWO_PI * f * (t + tp * (1.0 - np.exp(-t / tp)))        # integral of f(1+e^{-t/12ms})
    body = np.sin(ph) * np.exp(-t / 0.09)
    part = np.sin(2.3 * ph) * np.exp(-t / 0.05) * dbl(-14.0)
    nb = int(0.003 * SR)
    click = butter(white(nb, rng), "highpass", 2000.0, 2) * np.exp(-np.arange(nb) / (0.0008 * SR))
    click = fade_io(click, 0.00006, 0.0005)
    click *= dbl(-16.0) / (np.max(np.abs(click)) + 1e-12)
    x = body + part
    x[:nb] += click
    x = np.tanh(1.4 * x) / np.tanh(1.4)                          # a little weight for small speakers
    x = fade_io(x, 0.0003, 0.02)
    return peak_to(to_stereo(x, p.get("pan", 0.0)), p.get("db", -12.0))


# ======================================================================================
# I4 TWANG: Karplus-Strong at 110 Hz (loop gain 0.996, 8 ms LP-noise excitation, 1.6 s) with a tuned
# fractional-delay all-pass in the loop, plus the sine glide 55->110 Hz under the pull
# ======================================================================================
def _ks(f, n, rng, g=0.996, exc_ms=8.0):
    P = SR / f
    N = int(np.floor(P - 1.0))
    d = P - N - 0.5                      # fractional delay of the all-pass, in [0.5, 1.5)
    c = (1.0 - d) / (1.0 + d)
    a = np.zeros(N + 3)
    a[0] = 1.0
    a[1] += c
    a[N] -= 0.5 * g * c
    a[N + 1] -= 0.5 * g * (1.0 + c)
    a[N + 2] -= 0.5 * g
    ne = int(exc_ms * 1e-3 * SR)
    exc = butter(white(ne, rng), "lowpass", 3500.0, 2) * np.hanning(ne)
    x = np.zeros(n)
    x[:ne] = exc
    return signal.lfilter([1.0, c], a, x)


def I4_twang(h):
    p = h.p
    kind = p["kind"]
    if kind == "glide":
        n = _n(h)
        prog = ease_curve(p.get("ease", "TAUT"), n)
        f = 55.0 * 2.0 ** prog
        env = (np.arange(n) / n) ** 2.0                          # swells toward the peg
        chans = []
        for cents in (+1.5, -1.5):
            ph = phase_acc(f * 2 ** (cents / 1200.0), n)
            y = np.sin(ph) + 0.30 * np.sin(2 * ph) + 0.15 * np.sin(3 * ph)
            chans.append(np.tanh(1.5 * y) * env)
        st = np.stack(chans, axis=1)
        st = fade_io(st, 0.01, 0.004)
        return peak_to(st, p.get("db", -26.0))
    n = int(1.6 * SR)
    chans = []
    for k, cents in enumerate((+1.2, -1.2)):
        r = rng_for(4, h.idx, k)
        y = _ks(110.0 * 2 ** (cents / 1200.0), n, r)
        chans.append(butter(y, "lowpass", 4500.0, 2))
    st = np.stack(chans, axis=1)
    st = fade_io(st, 0.0004, 0.45)
    return peak_to(st, p.get("db", -16.0))


# ======================================================================================
# I5 SUB: sine 55(1+e^{-t/30ms}) Hz, attack 2 ms, decay e^{-t/0.35}, + 110 Hz at -12 dB, drive tanh(2x)
# ======================================================================================
def I5_sub(h):
    p = h.p
    tau = float(p.get("tau", 0.35))
    n = int(min(7.0 * tau, 6.0) * SR)
    t = np.arange(n) / SR
    tp = 0.03
    ph = TWO_PI * 55.0 * (t + tp * (1.0 - np.exp(-t / tp)))
    env = np.exp(-t / tau)
    x = (np.sin(ph) + dbl(-12.0) * np.sin(TWO_PI * 110.0 * t)) * env
    x = fade_io(x, 0.002, 0.03)
    x = np.tanh(2.0 * x / np.max(np.abs(x)))
    x = fade_io(x, 0.0, 0.03)
    return peak_to(np.stack([x, x], axis=1), p.get("db", -10.0))


# ======================================================================================
# I6 HINGE: white noise -> SVF LP, fc sweeps fc0->fc1 exponentially along the shot's easing, Q 0.9,
# amp sin(pi p)^1.5, pan follows motion. 30% decorrelated width. Optional sine glide (S02).
# ======================================================================================
def I6_hinge(h):
    p = h.p
    n = _n(h)
    prog = ease_curve(p["ease"], n)
    fc = p["fc0"] * (p["fc1"] / p["fc0"]) ** prog
    rng = rng_for(6, h.idx)
    a = svf(white(n, rng), fc, 0.9, "lp")
    b = svf(white(n, rng), fc, 0.9, "lp")
    amp = np.sin(np.pi * prog) ** 1.5
    pan = p["pan0"] + (p["pan1"] - p["pan0"]) * prog
    gl, gr = pan_gains(pan)
    st = np.stack([(a * gl + 0.3 * b * gr) * amp, (a * gr + 0.3 * b * gl) * amp], axis=1)
    st = peak_to(fade_io(st, 0.002, 0.004), p.get("db", -18.0))
    if "glide" in p:
        g0, g1 = p["glide"]
        f = g0 * (g1 / g0) ** prog
        gph = phase_acc(f, n)
        g = np.sin(gph) * amp
        g = peak_to(fade_io(g, 0.004, 0.006), p["glide_db"])
        st = st + np.stack([g, g], axis=1)
    return st


# ======================================================================================
# I7 SET: sine 90(1+e^{-t/10ms}) Hz, decay 80 ms at -16 dB + TICK(880) at -24 dB
# ======================================================================================
def I7_set(h):
    p = h.p
    rng = rng_for(5, h.idx)
    n = int(0.5 * SR)
    t = np.arange(n) / SR
    tp = 0.01
    ph = TWO_PI * 90.0 * (t + tp * (1.0 - np.exp(-t / tp)))
    pan = p.get("pan", 0.0)
    body = peak_to(to_stereo(fade_io(np.sin(ph) * np.exp(-t / 0.08), 0.0005, 0.03), pan), p.get("db", -16.0))
    tk = peak_to(to_stereo(_tick_wave(880.0, None, rng), pan, 0.2), p.get("tick_db", -24.0))
    body[: len(tk)] += tk
    return body


# ======================================================================================
# I8 FLAP: 0.6 ms noise burst -> resonant BP at {2.2, 2.9, 3.6, 4.4} kHz by char index mod 4, decay 8 ms
# ======================================================================================
def I8_flap(h):
    p = h.p
    rng = rng_for(8, h.idx)
    idx = int(p["idx"])
    fc = [2200.0, 2900.0, 3600.0, 4400.0][idx % 4] * (1.0 + rng.uniform(-0.03, 0.03))
    nb = int(0.0006 * SR)
    burst = white(nb, rng) * np.hanning(nb)
    n = int(0.008 * SR * 7)
    xin = np.zeros(n)
    xin[:nb] = burst
    r = np.exp(-1.0 / (0.008 * SR))
    th = TWO_PI * fc / SR
    y = signal.lfilter([1.0], [1.0, -2.0 * r * np.cos(th), r * r], xin)
    y = y / (np.max(np.abs(y)) + 1e-12)
    raw = butter(xin, "highpass", 1500.0, 2)
    raw = raw / (np.max(np.abs(raw)) + 1e-12)
    x = 0.8 * y + 0.2 * np.pad(raw, (0, n - len(raw)))[:n]
    x = fade_io(x, 0.00006, 0.01)
    return peak_to(to_stereo(x, p.get("pan", 0.0), 0.2), p.get("db", -30.0) + _jit(h, 0.8))


# ======================================================================================
# I9 PAD: additive partials n*55 Hz (n in {1,2,3,4,5,6,8}), amp 1/n^1.2, each partial with its own AM LFO
# (0.05-0.15 Hz, depth 30%, seeded phases), +/-0.8 cent L/R detune and independent L/R LFO phases, then LP.
# Each partial carries a 1/h^2.2 harmonic tail (h = 1..6) so the specified LP sweeps are audible; without
# it the partials stop at 440 Hz and the 900 -> 4000 Hz LP would do nothing.
# ======================================================================================
_PAD_DEFAULT = [(1, 0.0), (2, 0.0), (3, 0.0), (4, 0.0), (5, 0.0), (6, 0.0), (8, 0.0)]


def I9_pad(h):
    p = h.p
    nev = _n(h)
    nrel = int(float(p.get("release", 0.004)) * SR)
    n = nev + nrel
    unit = float(p.get("unit", 55.0))
    if "freqs" in p:
        comps = [(float(f), float(dbl(g))) for f, g in p["freqs"]]
    else:
        comps = [(k * unit, k ** -1.2 * float(dbl(g))) for k, g in p.get("partials", _PAD_DEFAULT)]
    t = np.arange(n) / SR
    chans = []
    for ch, cents in enumerate((+0.8, -0.8)):
        y = np.zeros(n)
        for ci, (f0, a) in enumerate(comps):
            r = rng_for(9, h.idx, ci, ch)
            lfo = r.uniform(0.05, 0.15)
            ph_l = r.uniform(0, TWO_PI)
            ph0 = r.uniform(0, TWO_PI)
            am = 1.0 - 0.30 * (0.5 + 0.5 * np.sin(TWO_PI * lfo * t + ph_l))
            fd = f0 * 2.0 ** (cents / 1200.0)
            hmax = int(min(6, 6000.0 // f0))
            s = np.zeros(n)
            for hh in range(1, max(1, hmax) + 1):
                s += hh ** -2.2 * np.sin(TWO_PI * fd * hh * t + ph0 * hh)
            y += a * am * s
        chans.append(y)
    st = np.stack(chans, axis=1)
    # filter: static 2nd-order LP, or swept SVF LP when the control points move
    lp = p.get("lp", [(h.frame, 900.0)])
    vals = [v for _, v in lp]
    if len(set(vals)) == 1:
        st = butter(st, "lowpass", vals[0], 2)
    else:
        fc = curve_log(lp, h.frame, n)
        st = np.stack([svf(st[:, 0], fc, 0.7071, "lp"), svf(st[:, 1], fc, 0.7071, "lp")], axis=1)
    # level curve (relative dB), attack and release
    lvl = curve_db(p.get("lvl", [(h.frame, 0.0)]), h.frame, n)
    st *= lvl[:, None]
    env = np.ones(n)
    na = int(float(p.get("attack", 0.5)) * SR)
    if na > 0:
        na = min(na, n)
        env[:na] = 0.5 - 0.5 * np.cos(np.pi * np.arange(na) / na)
    if nrel > 0:
        env[nev:] = 0.5 + 0.5 * np.cos(np.pi * (np.arange(n - nev) + 1) / (n - nev + 1))
    st *= env[:, None]
    st = fade_io(st, 0.0, 0.004 if nrel == 0 else 0.002)
    return peak_to(st, p.get("db", -28.0))


# ======================================================================================
# I10 POLY: TICK at 330/440/550 Hz (tau 40/30/24 ms), the triangle as rhythm
# ======================================================================================
def I10_poly(h):
    p = h.p
    rng = rng_for(10, h.idx)
    x = _tick_wave(p["f"], p["tau"], rng)
    return peak_to(to_stereo(x, p.get("pan", 0.0), 0.3), p.get("db", -26.0) + _jit(h, 0.4))


# ======================================================================================
# I11 RISER: 6 detuned additive saws (10 harmonics, +/-7 cents) gliding 110->880 Hz exponentially + white noise
# with HP sweeping 500->9000 Hz; amp rising exponentially -40 -> -12 dB. "noise" variant omits the saws.
# ======================================================================================
def I11_riser(h):
    p = h.p
    n = _n(h)
    u = np.arange(n) / n
    d0, d1 = p.get("db_start", -40.0), p.get("db_end", -12.0)
    amp = dbl(d0 + (d1 - d0) * u)
    rng = rng_for(11, h.idx)
    fc = 500.0 * (9000.0 / 500.0) ** u
    nz = np.stack([svf(white(n, rng), fc, 0.7071, "hp"), svf(white(n, rng), fc, 0.7071, "hp")], axis=1)
    nz /= np.std(nz)
    if p.get("kind", "full") == "full":
        f = 110.0 * 8.0 ** u
        cents = [-7.0, -4.2, -1.4, 1.4, 4.2, 7.0]
        pans = [-0.8, -0.5, -0.2, 0.2, 0.5, 0.8]
        saws = np.zeros((n, 2))
        for k, (c, pn) in enumerate(zip(cents, pans)):
            r = rng_for(11, h.idx, 100 + k)
            s = saw_add(f * 2.0 ** (c / 1200.0), n, 10, phase0=r.uniform(0, TWO_PI))
            saws += to_stereo(s, pn)
        saws /= np.std(saws)
        x = 0.42 * saws + 0.22 * nz
    else:
        x = 0.30 * nz
    x = x * amp[:, None]
    x = fade_io(x, 0.002, 0.003)
    return peak_to(x, d1)


# ======================================================================================
# I12 BELL(f): FM, carrier f, modulator 1.4f, index 4 e^{-t/0.35}, amp e^{-t/1.2}. Built as band-limited FM
# (Bessel sidebands, nothing above 16 kHz). Extras: +/-1.2 cent L/R detune + 0.45 ms Haas, a 2f shimmer
# partial at -20 dB, and a tiny strike tick for definition.
# ======================================================================================
def I12_bell(h):
    p = h.p
    f = float(p["f"])
    long_ = bool(p.get("long", False))
    if long_:                                            # hold the whole stop card, until the slabs leave (f1170)
        n = f2s(1170) - f2s(h.frame)
        tau_a = 1.8
        fo = 0.4
    else:
        n = int(6.0 * SR)
        tau_a = 1.2
        fo = 1.5
    t = np.arange(n) / SR
    amp = np.exp(-t / tau_a)
    idx = 4.0 * np.exp(-t / 0.35)
    chans = []
    for cents in (+1.2, -1.2):
        fc = f * 2.0 ** (cents / 1200.0)
        y = fm_add(fc, 1.4, idx, n, amp=amp, max_hz=16000.0, kmax=9)
        y += dbl(-20.0) * np.sin(TWO_PI * 2.0 * fc * t) * np.exp(-t / 0.6)
        chans.append(y)
    d = int(0.00045 * SR)
    chans[1] = np.concatenate([np.zeros(d), chans[1]])[:n]
    st = np.stack(chans, axis=1)
    rng = rng_for(12, h.idx)
    nb = int(0.002 * SR)
    strike = butter(white(nb, rng), "highpass", 3000.0, 2) * np.exp(-np.arange(nb) / (0.0005 * SR))
    strike = fade_io(strike, 0.00006, 0.0004)
    st[:nb, 0] += strike * dbl(-30.0)
    st[:nb, 1] += strike * dbl(-30.0)
    st = fade_io(st, 0.0006, fo)
    return peak_to(st, p.get("db", -14.0))


# ======================================================================================
# I13 MARIMBA(f): sine f + 4f (-22 dB) + 10f (-36 dB, tau 30 ms); attack 1 ms, tau 0.25 s
# ======================================================================================
def I13_marimba(h):
    p = h.p
    f = float(p["f"])
    rng = rng_for(13, h.idx)
    n = int(1.6 * SR)
    t = np.arange(n) / SR
    e = np.exp(-t / 0.25)
    x = (np.sin(TWO_PI * f * t) + dbl(-22.0) * np.sin(TWO_PI * 4 * f * t)) * e \
        + dbl(-36.0) * np.sin(TWO_PI * 10 * f * t) * np.exp(-t / 0.03)
    nb = int(0.003 * SR)
    mallet = butter(white(nb, rng), "lowpass", 2500.0, 2)
    mallet = fade_io(mallet * np.exp(-np.arange(nb) / (0.0007 * SR)), 0.0002, 0.0005)
    x[:nb] += mallet * dbl(-34.0)
    x = fade_io(x, 0.001, 0.05)
    return peak_to(to_stereo(x, p.get("pan", 0.0), 0.35), p.get("db", -14.0))


# ======================================================================================
# I14 HAT: white noise HP 7 kHz, decay 18 ms
# ======================================================================================
def I14_hat(h):
    p = h.p
    rng = rng_for(14, h.idx)
    n = int(0.018 * SR * 8)
    t = np.arange(n) / SR
    x = butter(white(n, rng), "highpass", 7000.0, 4) * np.exp(-t / 0.018)
    x = fade_io(x, 0.0004, 0.02)
    return peak_to(to_stereo(x, p.get("pan", 0.0), 0.15), p.get("db", -30.0) + _jit(h, 0.6))


# ======================================================================================
# I15 CLICK: press + release 70 ms apart, each TICK(2500 Hz, Q 8, tau 5 ms)
# ======================================================================================
def I15_click(h):
    p = h.p
    rng = rng_for(15, h.idx)
    press = _tick_wave(2500.0, 0.005, rng, q=8.0)
    release = peak_to(_tick_wave(2500.0, 0.004, rng_for(15, h.idx, 1), q=8.0), -5.0)
    d = int(0.070 * SR)
    n = d + len(release)
    x = np.zeros(n)
    x[: len(press)] += press
    x[d:d + len(release)] += release
    return peak_to(to_stereo(x, p.get("pan", 0.0), 0.2), p.get("db", -14.0))


# ======================================================================================
# I16 KEYS: 7 FM pings, carriers seeded in 2.8-6.5 kHz, ratio 2.76, index 2, decay 60-140 ms, onsets 18-55 ms
# (band-limited FM: sidebands above 18 kHz are dropped, so no fold-back)
# ======================================================================================
def I16_keys(h):
    p = h.p
    rng = rng_for(16, h.idx)
    onsets = np.cumsum(np.concatenate([[0.0], rng.uniform(0.018, 0.055, 6)]))
    n = int((onsets[-1] + 0.5) * SR)
    st = np.zeros((n, 2))
    for k in range(7):
        fc = float(rng.uniform(2800.0, 6500.0))
        dec = float(rng.uniform(0.060, 0.140))
        pn = float(rng.uniform(-0.6, 0.6))
        m = int(dec * SR * 8)
        t = np.arange(m) / SR
        ping = fm_add(fc, 2.76, 2.0, m, amp=np.exp(-t / dec), max_hz=18000.0, kmax=6)
        ping = fade_io(ping, 0.0002, 0.005)
        s0 = int(onsets[k] * SR)
        e = min(n, s0 + m)
        st[s0:e] += to_stereo(ping, pn)[: e - s0]
    st = fade_io(st, 0.0002, 0.01)
    return peak_to(st, p.get("db", -22.0))


# ======================================================================================
# I17 SLAB: brown noise -> BP 120 Hz Q0.8 + BP 240 Hz Q2, amp proportional to slab velocity (derivative of the
# easing). One independent rumble per slab (A left, D right). A little 900 Hz grit so it reads on small speakers.
# The end-stop KNOCK(90) is its own hit (f945).
# ======================================================================================
def I17_slab(h):
    p = h.p
    n = _n(h)
    prog = ease_curve(p.get("ease", "HINGE"), n)
    v = _smooth(speed_curve(prog), 4.0)

    def rumble(k):
        r = rng_for(17, h.idx, k)
        w = brown(n, r)
        a = biquad(w, "bp", 120.0, 0.8) + 0.6 * biquad(w, "bp", 240.0, 2.0)
        grit = biquad(white(n, r), "bp", 900.0, 1.0) * 0.10
        return a / (np.std(a) + 1e-12) + grit / (np.std(grit) + 1e-12) * 0.10

    common = 0.35 * rumble(2)
    L = (rumble(0) + common) * v
    R = (rumble(1) + common) * v
    st = fade_io(np.stack([L, R], axis=1), 0.004, 0.01)
    return peak_to(st, p.get("db", -16.0))


# ======================================================================================
# I18 WIPE: white noise -> BP sweeping 400->5000 Hz along the BRAKE curve, Q 1.2, pan -0.8 -> +0.8
# ======================================================================================
def I18_wipe(h):
    p = h.p
    n = _n(h)
    prog = ease_curve(p.get("ease", "BRAKE"), n)
    v = _smooth(speed_curve(prog), 3.0)
    amp = 0.12 + 0.88 * np.sqrt(np.clip(v, 0, 1))
    fc = 400.0 * (5000.0 / 400.0) ** prog
    rng = rng_for(18, h.idx)
    a = svf(white(n, rng), fc, 1.2, "bp")
    b = svf(white(n, rng), fc, 1.2, "bp")
    pan = -0.8 + 1.6 * prog
    gl, gr = pan_gains(pan)
    st = np.stack([(a * gl + 0.35 * b * gr) * amp, (a * gr + 0.35 * b * gl) * amp], axis=1)
    st = fade_io(st, 0.002, 0.03)
    return peak_to(st, p.get("db", -14.0))


# ======================================================================================
# I19 ROOM: pink noise LP 300 Hz, -48 dB, constant from f0 (the paper's air). Stereo, decorrelated above
# the bass-mono corner. Never cut; the mixer ducks it -6 dB in the hard-silence moments.
# ======================================================================================
def I19_room(h):
    p = h.p
    n = N_TOTAL - h.sample
    t = np.arange(n) / SR
    chans = []
    for ch in range(2):
        r = rng_for(19, ch)
        y = butter(pink(n, r), "lowpass", 300.0, 2)
        y = butter(y, "highpass", 30.0, 2)
        chans.append(y)
    st = np.stack(chans, axis=1)
    st *= (1.0 + 0.10 * np.sin(TWO_PI * 0.063 * t + 0.7))[:, None]       # barely-there breathing
    st = fade_io(st, 0.05, 0.0)
    return peak_to(st, p.get("db", -48.0))


# ======================================================================================
# WALLS (S11 f1408-1440): sine 55 + 110 crescendo -36 -> -14 dB, LP 200 -> 2000 Hz. The two partials ride on
# additive saws so the opening LP is audible.
# ======================================================================================
def walls(h):
    p = h.p
    n = _n(h)
    u = np.arange(n) / n
    t = np.arange(n) / SR
    amp = dbl(-36.0 + 22.0 * u)
    fc = 200.0 * 10.0 ** u
    chans = []
    for cents in (+3.0, -3.0):
        k = 2.0 ** (cents / 1200.0)
        x = (np.sin(TWO_PI * 55.0 * k * t) + np.sin(TWO_PI * 110.0 * k * t)
             + 0.45 * saw_add(55.0 * k, n, 40) + 0.35 * saw_add(110.0 * k, n, 20))
        chans.append(svf(x, fc, 0.9, "lp") * amp)
    st = fade_io(np.stack(chans, axis=1), 0.01, 0.02)
    return peak_to(st, p.get("db", -14.0))


RECIPES = {
    "PEN": I1_pen, "TICK": I2_tick, "KNOCK": I3_knock, "TWANG": I4_twang, "SUB": I5_sub, "HINGE": I6_hinge,
    "SET": I7_set, "FLAP": I8_flap, "PAD": I9_pad, "POLY": I10_poly, "RISER": I11_riser, "BELL": I12_bell,
    "MARIMBA": I13_marimba, "HAT": I14_hat, "CLICK": I15_click, "KEYS": I16_keys, "SLAB": I17_slab,
    "WIPE": I18_wipe, "ROOM": I19_room, "WALLS": walls,
}


def render(h):
    return RECIPES[h.inst](h)
