"""mix.py - bus / mix stage and master stage for the TRUE ANGLE score.

Signal flow
-----------
hits --synths--> dry buses (pad, sub, rhy, sfx, logo, room) --+--> per-bus reverb sends
                                                              |      (4 synthetic rooms, one per act,
                                                              |       T60 0.35 / 0.9 / 1.5 / 2.6 s,
                                                              |       sends crossfade over one beat at f330/f900/f1350;
                                                              |       tails are cut at every hard-silence gate)
sidechain duck (keyed from SUB/KNOCK hits) on pad + reverb returns; ROOM duck -6 dB in the silences
(hard-silence gates, 4 ms fade-out into the cut, are applied at the start of the master, after all filters)
17 kHz air LP, bass-mono below 120 Hz  ->  stems: music (pad+sub+rhy) / sfx / logo / room
master: +3 dB ramp (f820-869) -> HP 28 Hz -> 2:1 comp (-18 dBFS, 10/120 ms) -> make-up -> tanh soft clip
        -> look-ahead true-peak limiter -> linear fade f1785-end.   Make-up gain is solved so the integrated
        loudness of the final file is -14.0 LUFS. Every master stage is a pure gain curve, so the same curve
        is applied to each stem and the stems sum to the master.
"""
from __future__ import annotations

import time

import numpy as np
from scipy import signal

import hitsheet as hs
import synths
from dsp import (N_TOTAL, SR, bass_mono, butter, compressor_gain, dbl, f2s, integrated_lufs, limiter_gain,
                 make_ir, softclip_gain, true_peak_linear)

BUSES = ["pad", "sub", "rhy", "sfx", "logo", "room"]
STEM_OF = {"pad": "music", "sub": "music", "rhy": "music", "sfx": "sfx", "logo": "logo", "room": "room"}
STEMS = ["music", "sfx", "logo", "room"]

# instrument -> (bus, default reverb send in dB or None). The send is an energy ratio into the act's room
# (IRs are unit-energy), so -9 dB means a wet return roughly 9 dB under the dry signal.
ROUTE = {
    "ROOM": ("room", None), "PEN": ("sfx", -13.0), "TICK": ("sfx", -8.0), "KNOCK": ("sfx", -10.0),
    "TWANG": ("rhy", -7.0), "SUB": ("sub", None), "HINGE": ("sfx", -9.0), "SET": ("sfx", -10.0),
    "FLAP": ("sfx", -14.0), "PAD": ("pad", -6.0), "POLY": ("rhy", -8.0), "RISER": ("sfx", -8.0),
    "BELL": ("rhy", -5.0), "MARIMBA": ("rhy", -7.0), "HAT": ("rhy", -15.0), "CLICK": ("sfx", -10.0),
    "KEYS": ("sfx", -8.0), "SLAB": ("sfx", -13.0), "WIPE": ("sfx", -8.0), "WALLS": ("pad", -9.0),
}
# mix-stage balance trims (dB). The treatment's recipe levels are per-instrument peaks; this is the "mixing
# desk": the PAD bed and the paper's air are lifted so they are audible on laptop speakers, SUB is eased a
# little (it dominated the octave-band energy) and the interface sounds get some presence.
BUS_TRIM_DB = {"pad": 8.0, "sub": -2.0, "rhy": 0.0, "sfx": 2.0, "logo": 0.0, "room": 9.0}
ACT_WET_DB = [-3.0, -1.5, 0.0, 2.0]       # the rooms also get a little louder as the building is built
LP_TARGET_LUFS = -14.0
CEILING_DBFS = -1.5                       # 4x-oversampled limiter ceiling (<= -1.0 dBTP, leaves AAC-encode headroom)
GATE_FADE_S = 0.004
DUCK_PAD_DB = 3.0
DUCK_WET_DB = 2.0
BASS_MONO_HZ = 120.0
AIR_LP_HZ = 17000.0                       # the noise sources are white; keep the top end silky, not digital


def _log(msg):
    print(msg, flush=True)


# --------------------------------------------------------------------------------------
# 1. render every hit into its bus
# --------------------------------------------------------------------------------------
def render_buses(hits):
    t0 = time.time()
    dry = {b: np.zeros((N_TOTAL, 2)) for b in BUSES}
    snd = {b: np.zeros((N_TOTAL, 2)) for b in BUSES if b != "room"}
    key = np.zeros(N_TOTAL)
    for h in hits:
        s0 = h.sample
        if s0 >= N_TOTAL:
            continue
        x = synths.render(h)
        e = min(N_TOTAL, s0 + len(x))
        if h.inst != "ROOM":                          # a hard silence kills every sounding event (no ghosts later)
            nxt = [f2s(g[0]) for g in hs.GATES if f2s(g[0]) > s0]
            if nxt:
                e = min(e, nxt[0])
        seg = x[: e - s0]
        bus = "logo" if h.stem == "logo" else ROUTE[h.inst][0]
        if h.stem == "room":
            bus = "room"
        seg = seg * float(dbl(BUS_TRIM_DB[bus]))
        dry[bus][s0:e] += seg
        send = h.p["send"] if "send" in h.p else ROUTE[h.inst][1]
        if send is not None and bus != "room":
            snd[bus][s0:e] += seg * float(dbl(send))
        if h.inst in ("SUB", "KNOCK"):               # sidechain key (hit-timed, so it is exact and click-free)
            lvl = h.p.get("db", -12.0 if h.inst == "KNOCK" else -10.0)
            m = min(int(0.9 * SR), N_TOTAL - s0)
            env = float(dbl(lvl + 6.0)) * np.exp(-np.arange(m) / (0.18 * SR))
            key[s0:s0 + m] = np.maximum(key[s0:s0 + m], env)
    _log(f"  rendered {len(hits)} hits in {time.time() - t0:.1f}s")
    return dry, snd, np.clip(key, 0.0, 1.0)


# --------------------------------------------------------------------------------------
# 2. act-by-act reverb
# --------------------------------------------------------------------------------------
def act_weights():
    """Equal-power crossfade of the sends across one beat starting at f330 / f900 / f1350."""
    t = np.arange(N_TOTAL, dtype=float)
    L = float(f2s(hs.XFADE_FRAMES))
    r = [np.clip((t - f2s(f)) / L, 0.0, 1.0) for f in hs.ACT_STARTS[1:]]
    c = [np.cos(np.pi / 2 * x) for x in r]
    s = [np.sin(np.pi / 2 * x) for x in r]
    w = [c[0], s[0] * c[1], s[1] * c[2], s[2]]
    return w


def live_segments():
    """Time spans between gates; reverb tails never cross a gate (so a 'cut' is a real cut)."""
    segs, a = [], 0
    for g0, g1, *_ in hs.GATES:
        segs.append((a, f2s(g0)))
        a = f2s(g1)
    segs.append((a, N_TOTAL))
    return segs


def reverb(snd):
    t0 = time.time()
    irs = [make_ir(t60, (100 + i,)) for i, t60 in enumerate(hs.ACT_T60)]
    w = act_weights()
    bounds = [(0, f2s(hs.ACT_STARTS[1] + hs.XFADE_FRAMES)),
              (f2s(hs.ACT_STARTS[1]), f2s(hs.ACT_STARTS[2] + hs.XFADE_FRAMES)),
              (f2s(hs.ACT_STARTS[2]), f2s(hs.ACT_STARTS[3] + hs.XFADE_FRAMES)),
              (f2s(hs.ACT_STARTS[3]), N_TOTAL)]
    segs = live_segments()
    wet = {}
    for bus, x in snd.items():
        out = np.zeros_like(x)
        mono = x.mean(axis=1)
        for (sa, sb) in segs:
            for ai in range(4):
                lo, hi = max(sa, bounds[ai][0]), min(sb, bounds[ai][1])
                if hi <= lo:
                    continue
                m = mono[lo:hi] * (w[ai][lo:hi] * float(dbl(ACT_WET_DB[ai])))
                nz = np.flatnonzero(np.abs(m) > 1e-9)
                if len(nz) == 0:
                    continue
                i0, i1 = nz[0], nz[-1] + 1
                for ch in range(2):
                    y = signal.fftconvolve(m[i0:i1], irs[ai][:, ch])
                    s = lo + i0
                    e = min(sb, s + len(y))
                    out[s:e, ch] += y[: e - s]
        wet[bus] = out
    _log(f"  reverb (T60 {hs.ACT_T60}) done in {time.time() - t0:.1f}s")
    return wet


# --------------------------------------------------------------------------------------
# 3. ducking, gates, automation
# --------------------------------------------------------------------------------------
def gate_gain():
    g = np.ones(N_TOTAL)
    nf = int(GATE_FADE_S * SR)
    for g0, g1, *_ in hs.GATES:
        s0, s1 = f2s(g0), f2s(g1)
        g[s0 - nf:s0] = 0.5 + 0.5 * np.cos(np.pi * (np.arange(nf) + 1) / (nf + 1))
        g[s0:s1] = 0.0
    return g


def room_duck():
    d = np.ones(N_TOTAL)
    for g0, g1, _label, duck in hs.GATES:
        if duck:
            d[f2s(g0):f2s(g1)] = 0.5                      # -6 dB, never cut
    k = int(0.030 * SR)
    w = np.hanning(2 * k + 1)
    w /= w.sum()
    return np.convolve(np.pad(d, k, mode="edge"), w, mode="valid")


def automation_gain():
    """Master +3 dB ramp across the acceleration f820-869 (snaps back inside the f870-876 silence)."""
    a = np.ones(N_TOTAL)
    s0, s1 = f2s(820), f2s(870)
    a[s0:s1] = dbl(3.0 * np.arange(s1 - s0) / (s1 - s0))
    return a


def buses_to_stems(dry, wet, key):
    """Sum dry + wet, apply sidechain, ROOM duck, air LP, bass-mono; return stems (the hard-silence gates are
    applied in master(), after the filters, so they are exactly silent)."""
    t0 = time.time()
    duck_pad = 1.0 - (1.0 - float(dbl(-DUCK_PAD_DB))) * key
    duck_wet = 1.0 - (1.0 - float(dbl(-DUCK_WET_DB))) * key
    out = {}
    for b in BUSES:
        if b == "room":
            out[b] = dry[b] * room_duck()[:, None]
            continue
        if b == "pad":
            y = (dry[b] + wet[b]) * duck_pad[:, None]
        else:
            y = dry[b] + wet[b] * duck_wet[:, None]
        out[b] = y
    stems = {s: np.zeros((N_TOTAL, 2)) for s in STEMS}
    for b in BUSES:
        stems[STEM_OF[b]] += out[b]
    air = signal.butter(4, AIR_LP_HZ, "lowpass", fs=SR, output="sos")
    for s in STEMS:
        stems[s] = bass_mono(signal.sosfilt(air, stems[s], axis=0), BASS_MONO_HZ)
    _log(f"  buses -> stems (duck/gate/bass-mono) in {time.time() - t0:.1f}s")
    return stems


# --------------------------------------------------------------------------------------
# 4. master
# --------------------------------------------------------------------------------------
def master(stems):
    t0 = time.time()
    A = automation_gain()[:, None]
    hp = signal.butter(2, 28.0, "highpass", fs=SR, output="sos")
    G = gate_gain()[:, None]                     # hard silences: applied after every filter -> exact digital zero
    hp_stems = {k: signal.sosfilt(hp, v * A, axis=0) * (1.0 if k == "room" else G) for k, v in stems.items()}
    mix = sum(hp_stems.values())
    g1 = compressor_gain(mix, thr_db=-18.0, ratio=2.0, attack_ms=10.0, release_ms=120.0)
    mix1 = mix * g1[:, None]
    fade = np.ones(N_TOTAL)
    fs0 = f2s(1785)
    fade[fs0:] = np.linspace(1.0, 0.0, N_TOTAL - fs0)

    def chain(gdb):
        xm = mix1 * float(dbl(gdb))
        g2 = softclip_gain(xm, 1.2)
        x2 = xm * g2[:, None]
        g3 = limiter_gain(x2, CEILING_DBFS, 2.0, 90.0)
        x3 = x2 * (g3 * fade)[:, None]
        return x3, g2, g3

    # secant search for the make-up gain that lands the final file on the loudness target
    gdb = LP_TARGET_LUFS - integrated_lufs(mix1) + 1.0
    hist = []
    for it in range(10):
        out, g2, g3 = chain(gdb)
        L = integrated_lufs(out)
        _log(f"    makeup {gdb:+.2f} dB -> {L:.2f} LUFS")
        hist.append((gdb, L))
        if abs(L - LP_TARGET_LUFS) < 0.03:
            break
        if len(hist) == 1:
            slope = 0.8
        else:
            (ga, la), (gb, lb) = hist[-2], hist[-1]
            slope = (lb - la) / (gb - ga) if abs(gb - ga) > 1e-6 else 0.8
            slope = float(np.clip(slope, 0.3, 1.2))
        gdb += (LP_TARGET_LUFS - L) / slope
    total = (g1 * float(dbl(gdb)) * g2 * g3 * fade)[:, None]
    stems_out = {k: v * total for k, v in hp_stems.items()}
    info = dict(makeup_db=gdb, lufs=L, comp_gr_max_db=float(-20 * np.log10(g1.min())),
                limiter_gr_max_db=float(-20 * np.log10(g3.min())),
                limiter_gr_mean_db=float(np.mean(-20 * np.log10(g3))),
                tp_dbfs=float(20 * np.log10(true_peak_linear(out))))
    _log(f"  master done in {time.time() - t0:.1f}s: {info}")
    return out, stems_out, info
