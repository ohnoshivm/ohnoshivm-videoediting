#!/usr/bin/env python3
"""score.py - the DOMINANT score: arrangement (cues -> events), mix, master, export, verification.

    python3 advrtizx-intro/audio/score.py                # rebuild everything (about 3 minutes or less)
    python3 advrtizx-intro/audio/score.py --no-verify    # audio only
    python3 advrtizx-intro/audio/score.py --act 3        # render only up to act N (for quick looks; not for delivery)

Pipeline:  cues.py  ->  arrangement (this file, synth.py recipes)  ->  master.Mixer (buses, sends, sidechain, hall reverbs)
           ->  master.master (EQ, gates, glue comp, oversampled soft clip, 4x true-peak limiter, -14 LUFS solve)
           ->  out/score.wav + out/stems/*.wav  ->  verify.py (report.json, spectrogram.png, waveform.png)

Musical map: see README.md. Everything is synthesised (numpy/scipy), seeded (dsp.SEED) and deterministic.
"""
from __future__ import annotations

import argparse
import os
import sys
import time

import numpy as np
import soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import cues  # noqa: E402
import dsp  # noqa: E402
import master as M  # noqa: E402
import synth  # noqa: E402
import foley  # noqa: E402
from cues import BEAT, F, E, S  # noqa: E402
from dsp import N_TOTAL, SR, dbl, note_hz, rng_for  # noqa: E402

# ---- physical upgrade: every impact gets click / body / air-pressure / canyon slap / felt sub; whooshes are real air
_impact_core = synth.impact


def _impact_phys(f0=55.0, size=1.0, seed=0, t60=2.6, tail=3.6, **kw):
    x = _impact_core(f0, size, seed=seed, t60=t60, tail=tail, **kw)
    x = foley.enhance_impact(x, f0, size, seed, tail, pan=kw.get("pan", 0.0), canyon=(size >= 0.55 and kw.get("mid", 1.0) > 0.6))
    return x / np.max(np.abs(x))


synth.impact = _impact_phys
synth.whoosh = foley.whoosh2

OUT = os.path.join(HERE, "out")
OUT_WAV = os.path.join(OUT, "score.wav")
OUT_STEMS = os.path.join(OUT, "stems")

# ======================================================================================================
# harmony: voicings above the A pedal (the pedal itself is the bass and the drone)
# ======================================================================================================
VOICE = {
    "A5":   dict(pad=["E3", "A3", "E4", "A4"], stab=["A2", "E3", "A3", "E4"], braam=["A1", "A2", "E3", "A3", "E4", "A4"]),
    "Dm/A": dict(pad=["D3", "F3", "A3", "D4", "F4", "A4", "D5"], stab=["A2", "D3", "A3", "D4", "F4"],
                 braam=["A1", "A2", "D3", "F3", "A3", "D4", "F4", "A4"]),
    "Bb/A": dict(pad=["F3", "Bb3", "D4", "F4", "Bb4", "D5"], stab=["A2", "F3", "Bb3", "D4", "F4"],
                 braam=["A1", "A2", "F3", "Bb3", "D4", "F4", "Bb4"]),
    "Gm/A": dict(pad=["G3", "Bb3", "D4", "G4", "Bb4", "D5"], stab=["A2", "G3", "Bb3", "D4", "G4"],
                 braam=["A1", "A2", "G3", "Bb3", "D4", "G4", "Bb4"]),
    "A":    dict(pad=["E3", "A3", "C#4", "E4", "A4", "C#5", "E5"], stab=["A2", "E3", "A3", "C#4", "E4"],
                 braam=["A1", "A2", "E3", "A3", "C#4", "E4", "A4", "C#5"]),
    "A7":   dict(pad=["E3", "G3", "A3", "C#4", "E4", "G4", "A4", "C#5"], stab=["A2", "E3", "G3", "C#4", "E4"],
                 braam=["A1", "A2", "E3", "G3", "C#4", "E4", "G4", "A4"]),
    "A7b9": dict(pad=["E3", "G3", "Bb3", "C#4", "E4", "G4", "Bb4", "C#5"], stab=["A2", "E3", "G3", "Bb3", "C#4", "E4"],
                 braam=["A1", "A2", "E3", "G3", "Bb3", "C#4", "E4", "G4", "Bb4"]),
    "D":    dict(pad=["A2", "D3", "F#3", "A3", "D4", "E4", "A4", "D5"],
                 braam=["D2", "A2", "D3", "F#3", "A3", "D4", "E4"], shimmer=["F#5", "A5", "D6"]),
}
CITY_TOPS = cues.CITY_TOPS
ARP_A7 = ["A1", "C#2", "E2", "G2", "A2", "C#3", "E3", "G3", "A3", "C#4", "E4", "G4",
          "A4", "C#5", "E5", "G5", "A5", "C#6", "E6", "G6", "A6", "C#7"]        # floor-slam pitches, 22 modules
HZ = lambda names: [note_hz(n) for n in names]       # noqa: E731

# ======================================================================================================
# level table (dB, pre-master). The master solves the overall gain; these set the balance.
# ======================================================================================================
LV = dict(
    crown=-2.5, sell=-5.0, drop=-5.0, erupt_heavy=-11.0, erupt_light=-16.5, city0=-12.0, city1=-6.0,
    unison=-0.5, drop_world=-3.0, climax=-6.0, a_dom=-0.5, d_ton=0.0,
    kick=-7.0, taiko=-9.0, clap=-12.0, snare=-14.0, hat=-24.0, bass=-11.0, stab=-14.0, anvil=-17.0,
)

# macro-dynamics: the groove layers (kick, bass, percussion, brass) grow across the film while the impacts stay the
# punctuation. dB offset applied to every groove event by frame.
SEC_PTS = [(0, 0.0), (128, -10.0), (224, -8.0), (256, -4.5), (384, -4.0), (512, -3.5), (640, -2.5), (768, -1.8), (832, -1.5),
           (896, 0.0), (1088, 0.0), (1152, -7.5), (1216, -5.0), (1280, -2.5), (1344, 0.5), (1376, 2.5)]


def sec_db(f):
    return float(np.interp(f, [p[0] for p in SEC_PTS], [p[1] for p in SEC_PTS]))


_CACHE: dict = {}


def cached(key, fn):
    v = _CACHE.get(key)
    if v is None:
        v = fn()
        _CACHE[key] = v
    return v


def dbs(size):
    return 20.0 * np.log10(size)


def _t(msg):
    print(msg, flush=True)


# ======================================================================================================
# voice banks (round-robin variants, so no two hits are identical, rendered once)
# ======================================================================================================
def v_kick(i, thump=0.0):
    return cached(("kick", i % 4, round(thump, 2)), lambda: synth.kick(seed=i % 4, thump=thump))


def v_clap(i):
    return cached(("clap", i % 3), lambda: synth.clap(seed=i % 3))


def v_snare(i, decay=0.16):
    return cached(("snare", i % 3, decay), lambda: synth.snare(seed=i % 3, decay=decay))


def v_hat(i, open_=False):
    return cached(("hat", i % 5, open_), lambda: synth.hat(seed=i % 5, open_=open_))


def v_taiko(f0, decay, i, slap=1.0):
    return cached(("taiko", round(f0, 2), decay, i % 3), lambda: synth.taiko(f0, decay, seed=i % 3, slap=slap))


# ======================================================================================================
# chord helpers
# ======================================================================================================
def chord_for(frame):
    return cues.chord_at(frame)


_PAD = [(128, -36.0), (224, -29.0), (256, -27.0), (640, -24.0), (896, -22.0), (1088, -21.0), (1152, -21.0), (1280, -17.5),
        (1344, -13.5), (1376, -12.5)]
PAD_PTS = ([p[0] for p in _PAD], [p[1] for p in _PAD])


def pad_gain_db(f):
    """level curve of the harmony pads (dB), by frame"""
    return float(np.interp(f, PAD_PTS[0], PAD_PTS[1]))


# ======================================================================================================
# ACT I - THE CROWN
# ======================================================================================================
def ratchet(mx, f_a, f_b, seed, gain, n=20, p=0.55):
    """floor-lock ratchet: clanks + clicks that accelerate and resolve into the landing at f_b."""
    rng = rng_for(600, seed)
    for k in range(n):
        fr = f_a + (f_b - f_a) * (k / n) ** p
        sm = cues.f2s(fr) + int(rng.uniform(0, 0.004) * SR)
        if sm >= cues.f2s(f_b):
            continue
        u = k / n
        x = foley.beam_clang(700 + seed * 100 + k, dur=0.22, size=0.5, hardness=1.2, plate=False)
        mx.add("fx", sm, x, gain + 8.0 * u + float(rng.uniform(-2, 2)), sends={"room": -9.0}, name="RATCHET", kind="foley",
               check=False)


def stamp_big(note, seed, **kw):
    a = synth.stamp(note, seed=seed, **kw)
    b = foley.signboard(seed)
    n = max(len(a), len(b))
    out = np.zeros((n, 2))
    out[:len(a)] += a * 0.8
    out[:len(b)] += b * 1.0
    return out / np.max(np.abs(out))


def act1(mx):
    top = S("TOP_LOCK")
    # FALL: a massive object rips downward (100 ms) into the first impact
    fall = synth.whoosh(3 / 30, "fall", f_lo=650.0, f_hi=10500.0, q=2.4, pan0=-0.06, pan1=0.06, seed=1, low=0.7,
                        start_fade_ms=2.5, end_fade_ms=0.4)
    mx.add("fx", S("FALL"), fall, -3.5, sends={"hall": -17.0}, name="FALL", kind="whoosh", cue="FALL", frame=F("FALL"),
           check=False)
    # red-void drone under the fall and the rise
    dr = synth.pedal_drone((top - 0) / SR, seed=3, fade_in=0.25, fade_out=0.0)
    mx.add("ambience", 0, dr, -34.0, name="DRONE_VOID", kind="pedal", cue="DRONE_VOID", frame=0, check=False)
    # CROWN_IMPACT: the first A. Sub tuned to A1 = 55 Hz.
    crown = cached("crown", lambda: synth.impact(55.0, 1.0, seed=1, t60=2.9, tail=4.0, groan=1.0, sub0=0.35,
                                                 steel_f=220.0, debris=1.0))
    mx.add("impacts", S("CROWN_IMPACT"), crown, LV["crown"], sends={"hall": -4.5}, name="CROWN_IMPACT", kind="impact",
           cue="CROWN_IMPACT", frame=F("CROWN_IMPACT"), duck="big")
    # FLOOR SLAMS: 22 modules, pitched on the rising A7 arpeggio, accelerating into the roar
    fl = cues.group("FLOOR_")
    for k, c in enumerate(fl):
        nxt = fl[k + 1].frame if k + 1 < len(fl) else c.frame + 1
        spacing = max(1, nxt - c.frame) / 30.0
        x = synth.floor_slam(note_hz(ARP_A7[k]), spacing, k=k, n_total=len(fl), seed=k)
        u = k / (len(fl) - 1)
        gain = -17.0 + 8.5 * u ** 0.8
        mx.add("impacts", c.sample, x, gain, sends={"room": -8.0, "hall": -12.0}, name=c.name, kind="slam", cue=c.name,
               frame=c.frame, duck="small", duck_scale=0.8)
    # ---- FOLEY: the jack-up. hydraulic jacks + crane + per-floor beam clang, concrete thump, rebar rattle, ratchet
    j = foley.hydraulic_jack(1, (top - cues.f2s(8)) / SR, rate0=6.0, rate1=26.0, whine0=330.0, whine1=1150.0)
    mx.add("fx", cues.f2s(8), j, -17.0, sends={"hall": -9.0, "room": -9.0}, name="JACK", kind="foley", check=False)
    cr = foley.crane_creak(2, (top - cues.f2s(2)) / SR)
    mx.add("fx", cues.f2s(2), cr, -22.0, sends={"hall": -10.0}, name="CRANE", kind="foley", check=False)
    for k, c in enumerate(fl):
        nxt = fl[k + 1].frame if k + 1 < len(fl) else c.frame + 1
        sp = max(1, nxt - c.frame) / 30.0
        u = k / (len(fl) - 1)
        bc = foley.beam_clang(100 + k, dur=float(np.clip(sp * 7 + 0.25, 0.3, 1.8)), size=1.1 - 0.5 * u)
        mx.add("impacts", c.sample, bc, -22.0 + 6.0 * u, sends={"hall": -9.0, "room": -8.0}, name=c.name + "_beam", kind="foley",
               check=False)
        if k < 16:
            th = foley.concrete_thump(k, f=48.0 + 30.0 * u, dur=0.6)
            mx.add("impacts", c.sample, th, -17.0 + 3.0 * u, sends={"room": -9.0}, name=c.name + "_thump", kind="foley",
                   check=False)
        rt = foley.rattle(k, float(np.clip(sp * 1.6, 0.12, 0.5)), dens0=180.0, dens1=30.0, chain=(k % 3 == 0))
        mx.add("fx", c.sample, rt, -24.0 + 5.0 * u, sends={"room": -8.0, "hall": -12.0}, name=c.name + "_rattle", kind="foley",
               check=False)
    ratchet(mx, F("FLOOR_01"), F("TOP_LOCK"), 1, -24.0, n=34)
    # ROAR: merges the per-frame hits, cut dead by TOP_LOCK
    r = synth.roar((E("ROAR") - F("ROAR")) / 30.0, seed=1)
    mx.add("fx", S("ROAR"), r, -12.0, sends={"hall": -12.0}, name="ROAR", kind="riser", cue="ROAR", frame=F("ROAR"),
           check=False)
    # TOP_LOCK: a colossal steel lock, then everything cuts
    lk = cached("lock", lambda: synth.lock(0))
    cut = S("LOCK_CUT")
    mx.add("impacts", top, lk, -2.5, sends={"room": -6.0}, until=cut, name="TOP_LOCK", kind="lock", cue="TOP_LOCK",
           frame=F("TOP_LOCK"))
    bcl = foley.beam_clang(900, f0=96.0, dur=0.5, size=1.7, hardness=1.2)
    mx.add("impacts", top, bcl, -9.0, sends={"room": -6.0}, until=cut, name="LOCK_beam", kind="foley", check=False)
    tl = foley.concrete_thump(901, f=52.0, dur=0.45, size=1.4)
    mx.add("impacts", top, tl, -8.0, until=cut, name="LOCK_thump", kind="foley", check=False)
    tr = foley.concrete_thump(902, f=64.0, dur=0.3, size=0.8)                 # dip-and-rebound
    mx.add("impacts", top + int(0.14 * SR), tr, -15.0, until=cut, name="LOCK_rebound", kind="foley", check=False)
    # WIND: very quiet high-altitude wind
    n_w = int((F("LINE1") + 32 - F("WIND")) / 30.0 * SR)
    w = synth.wind(n_w / SR, seed=5)
    nfi = int(0.9 * SR)
    w = w.copy()
    w[:nfi] *= (0.5 - 0.5 * np.cos(np.pi * np.arange(nfi) / nfi))[:, None] ** 1.5
    nfo = int(1.1 * SR)
    w[-nfo:] *= (0.5 + 0.5 * np.cos(np.pi * (np.arange(nfo) + 1) / (nfo + 1)))[:, None]
    mx.add("ambience", S("WIND"), w, -33.0, name="WIND", kind="ambience", cue="WIND", frame=F("WIND"), check=False)


# ======================================================================================================
# the sustained A pedal (drone): one long event from DRONE_RETURN to the hard silence, level-automated
# ======================================================================================================
def pedal(mx):
    a, b = S("DRONE_RETURN"), S("HARD_SILENCE")
    n = b - a
    d = synth.pedal_drone(n / SR, seed=7, fade_in=1.4, fade_out=0.0)
    f = cues.F("DRONE_RETURN") + np.arange(n) / cues.SPF
    pts = [(96, -52.0), (128, -46.0), (192, -42.0), (224, -38.0), (256, -37.0), (640, -35.0), (896, -33.5),
           (1152, -31.0), (1344, -26.0), (1375, -25.0)]
    g = np.interp(f, [p[0] for p in pts], [p[1] for p in pts])
    d = d * dbl(g)[:, None]
    ca = foley.city_air((F("HARD_SILENCE") - F("LINE1")) / 30.0, seed=3, top=0.0)
    fc_ = F("LINE1") + np.arange(len(ca)) / cues.SPF
    cb = np.interp(fc_, [128, 192, 256, 640, 896, 1152, 1280, 1375], [-62.0, -46.0, -45.0, -43.0, -41.0, -44.0, -42.0, -40.0])
    mx.add("ambience", S("LINE1"), ca * dbl(cb)[:, None], 0.0, name="CITY_AIR", kind="ambience", check=False)
    tw = foley.city_air((F("HARD_SILENCE") - F("CLIMAX")) / 30.0, seed=4, rumble=0.0, gust=0.4, top=1.0)
    ft_ = F("CLIMAX") + np.arange(len(tw)) / cues.SPF
    tb = np.interp(ft_, [1152, 1250, 1375], [-52.0, -42.0, -39.0])
    mx.add("ambience", S("CLIMAX"), tw * dbl(tb)[:, None], 0.0, name="TOP_AIR", kind="ambience", check=False)
    mx.add("ambience", a, d, 0.0, name="PEDAL_DRONE", kind="pedal", cue="DRONE_RETURN", frame=F("DRONE_RETURN"),
           check=False)


# ======================================================================================================
# ACT II - THE STATEMENT
# ======================================================================================================
def act2(mx):
    # LINE1: NO TOWER RISES - a deep taiko tuned to A1, sub bloom, hall
    tk = v_taiko(55.0, 1.15, 0, slap=0.8)
    mx.add("drums", S("LINE1"), tk, -8.0, sends={"hall": -4.5, "room": -10.0}, name="LINE1", kind="drum", cue="LINE1",
           frame=F("LINE1"), duck="big")
    sb = cached("line1_sub", lambda: synth.impact(55.0, 0.6, seed=11, t60=1.9, tail=2.6, mid=0.55, crack=0.45, air=0.3,
                                                  debris=0.0, groan=0.0, sub_gain=0.9))
    mx.add("impacts", S("LINE1"), sb, -14.0, sends={"hall": -8.0}, name="LINE1_sub", kind="impact", cue="LINE1",
           frame=F("LINE1"), check=False)
    # LINE2: UNSOLD. - tighter, harder: a shorter taiko over a muted steel anvil
    tk2 = v_taiko(55.0, 0.55, 1, slap=1.3)
    mx.add("drums", S("LINE2"), tk2, -9.5, sends={"hall": -8.0, "room": -8.0}, name="LINE2", kind="drum", cue="LINE2",
           frame=F("LINE2"), duck="med")
    an = cached("anvil_muted", lambda: synth.anvil(220.0, seed=2, decay=0.22, brightness=0.8))
    mx.add("impacts", S("LINE2"), an, -18.0, sends={"room": -8.0, "hall": -10.0}, name="LINE2_anvil", kind="impact",
           cue="LINE2", frame=F("LINE2"), check=False)
    # PULSE_A: the low tense A pulse - heartbeats on the beat, then eighths, filter opening as tension builds
    f0, f1 = F("PULSE_A"), E("PULSE_A")
    fr = f0
    while fr < f1 - 4:
        u = (fr - f0) / (f1 - f0)
        step = 16 if fr < F("PULSE_A") + 64 else 8
        x = cached(("pulse", round(u, 1)), lambda u=u: synth.bass_note(55.0, 0.17, accent=0.25 + 0.75 * u, seed=int(u * 10),
                                                                     cut_hi=1500.0, saw_mix=0.28, filt_tau=0.10))
        mx.add("bass", cues.f2s(fr), x, -9.0 + 3.0 * u, name="PULSE_A", kind="pedal", cue="PULSE_A", frame=fr, check=False,
               duck=None)
        fr += step
    # SELL: reverse swell -> huge A-major dominant braam + impact + unresolved A5 bell
    ir = mx.ir("hall")
    src_notes = HZ(["A2", "E3", "A3", "C#4", "E4", "A4"])
    burst = synth.braam(src_notes, 0.12, seed=21, release=0.10, cut_peak=3000.0, cut_end=900.0, cut_tau=0.1, growl=0.2)
    bm = burst.mean(axis=1)
    sw = dsp.reverse_swell(bm, ir, (E("SELL_SWELL") - F("SELL_SWELL")) / 30.0 + 0.0, tail_fade_ms=4.0)
    sw = sw * (np.linspace(0.0, 1.0, len(sw)) ** 1.5)[:, None]
    mx.add("fx", S("SELL_SWELL"), sw / (np.max(np.abs(sw)) + 1e-12), -9.0, name="SELL_SWELL", kind="swell",
           cue="SELL_SWELL", frame=F("SELL_SWELL"), check=False)
    dur = (E("DIVE") - F("SELL")) / 30.0 - 0.05
    br = cached("sell_braam", lambda: synth.braam(HZ(VOICE["A"]["braam"]), dur, seed=31, release=0.20, cut_peak=3900.0,
                                                  cut_end=640.0, cut_tau=0.40, hold=0.62, growl=0.65))
    mx.add("music", S("SELL"), br, LV["sell"] - 4.5, sends={"hall": -6.0}, name="SELL_braam", kind="braam", cue="SELL",
           frame=F("SELL"), duck=None, check=False)
    imp = cached("sell_imp", lambda: synth.impact(55.0, 1.12, seed=32, t60=2.9, tail=3.8, groan=0.5, sub0=0.25,
                                                  steel_f=220.0))
    mx.add("impacts", S("SELL"), imp, LV["sell"], sends={"hall": -5.0}, name="SELL", kind="impact", cue="SELL",
           frame=F("SELL"), duck="big")
    b5 = cached("bell_A5_long", lambda: synth.bell(note_hz("A5"), 5.5, seed=41, amp_tau=1.5))
    mx.add("music", S("TEASE_1"), b5, -14.0, sends={"hall": -3.5, "finale": -9.0}, name="TEASE_1", kind="bell",
           cue="TEASE_1", frame=F("TEASE_1"))
    # DIVE: the camera plunges - a falling whoosh, a noise riser and a driven plunge tone, ending 10 ms before the drop
    d = synth.whoosh((E("DIVE") - F("DIVE")) / 30.0, "dive", f_lo=380.0, f_hi=8200.0, q=2.0, pan0=-0.25, pan1=0.25,
                     seed=3, end_fade_ms=10.0, pressure=0.9)
    mx.add("fx", S("DIVE"), d, -6.0, sends={"hall": -16.0}, name="DIVE", kind="whoosh", cue="DIVE", frame=F("DIVE"),
           check=False)
    rz = synth.noise_riser((E("DIVE") - F("DIVE")) / 30.0, f0=900.0, f1=12500.0, q=1.2, seed=4, amp0_db=-30.0,
                           trem=(8.0, 36.0))
    rz = dsp.fade_io(rz, 0.0, 0.010)
    mx.add("fx", S("DIVE"), rz, -13.0, name="DIVE_riser", kind="riser", cue="DIVE", frame=F("DIVE"), check=False)


# ======================================================================================================
# pads: one swelling saw-stack pad per harmony span (Dm/A, Bb/A, Gm/A, A, A7, A7b9, ...)
# ======================================================================================================
def pads(mx):
    spans = []
    for a, b, ch in cues.chord_spans():
        if spans and spans[-1][2] == ch and spans[-1][1] == a:
            spans[-1] = (spans[-1][0], b, ch)
        else:
            spans.append((a, b, ch))
    hard_a, hard_b = F("HARD_SILENCE"), E("HARD_SILENCE")
    k = 0
    for a, b, ch in spans:
        if a < F("LINE1") or ch in ("A5", "D") or a >= hard_a:
            continue                                         # the A7 / D chords after the silence are in act8()
        b_eff = min(b, hard_a)
        if F("UNISON") <= a < E("DROPOUT"):                  # 1-beat dropout: the new pad waits for the groove to return
            a = E("DROPOUT")
        dur = (b_eff - a) / 30.0
        att = float(np.clip(0.35 * dur, 0.35, 1.3))
        rel = float(np.clip(0.55 * dur, 0.5, 1.2))
        notes = HZ(VOICE[ch]["pad"])
        lp_end = 1800.0 + 1500.0 * float(np.clip((a - 256) / 900.0, 0.0, 1.0))
        x = synth.pad(notes, dur, seed=60 + k, attack=att, release=rel, lp_start=420.0, lp_end=lp_end,
                      voices=(-10.0, 0.0, 10.0), spread=0.9, chorus_mix=0.5)
        n = len(x)
        fr = a + np.arange(n) / cues.SPF
        curve = np.interp(fr, PAD_PTS[0], PAD_PTS[1])                # the level follows the global swell curve
        x = x * dbl(curve)[:, None]
        mx.add("music", cues.f2s(a), x, 0.0, sends={"hall": -8.0}, name=f"PAD_{ch}", kind="pad", cue=None, frame=a,
               check=False)
        k += 1


# ======================================================================================================
# ACT III-VII groove
# ======================================================================================================
LAYER_START = dict(ride="GRID_2", ghostclap="GRID_4", brass="GRID_8", kickghost="GRID_16", octbass="GRID_32",
                   taiko2="GRID_64")


def layer_on(name, f):
    return f >= F(LAYER_START[name])


def groove_active(layer, f):
    for a, b in cues.groove_spans()[layer]:
        if a <= f < b:
            return True
    return False


def bass_pattern(bar_in_phase, f):
    """(pitch_hz, accent, dur) for the 16 steps of a bar"""
    base = [1.0, 0.40, 0.66, 0.42, 0.9, 0.40, 0.62, 0.40, 0.95, 0.40, 0.66, 0.42, 0.9, 0.45, 0.70, 0.50]
    if f >= F("DROP_WORLD"):
        octv = {3, 6, 7, 11, 14, 15}
    elif f >= F("GRID_2"):
        octv = {3, 6, 11, 14}
    else:
        octv = {6, 13, 15}
    out = []
    for s in range(16):
        out.append((110.0 if s in octv else 55.0, base[s]))
    return out


ANVIL_F0 = {"Dm/A": 146.83, "Bb/A": 116.54, "Gm/A": 196.0, "A": 220.0, "A7": 220.0, "A7b9": 220.0, "A5": 220.0}


def groove(mx):
    """kick / bass 16ths / claps / taiko / ticks / anvils / brass pulse, section by section. Every gain carries sec_db(f).
    Act VII is a real build: bar 18 thin, bar 19 adds 16th ticks + brass, bar 20 eighth-note kicks + snares, SURGE 16ths."""
    t0 = time.time()
    start, end = F("DROP"), F("HARD_SILENCE")
    uni, dropout_end, roll, dw = F("UNISON"), E("DROPOUT"), F("ROLL"), F("DROP_WORLD")
    tension, cl, surge = F("TENSION"), F("CLIMAX"), F("SURGE")
    k_i = 0
    for bar_start in range(start, end, 64):
        bar_idx = (bar_start - start) // 64
        for step in range(16):
            f = bar_start + 4 * step
            if f >= end:
                break
            s = cues.f2s(f)
            gs = sec_db(f)
            world = dw <= f < cl                                   # Act VI + the tension bar
            climax = f >= cl
            cbar = (f - cl) // 64 if climax else -1                # 0, 1, 2 = bars 18, 19, 20 of the build
            surge_on = f >= surge
            full = world or (climax and cbar >= 1)
            in_dropout = uni <= f < dropout_end
            in_return = dropout_end <= f < roll
            in_roll = roll <= f < dw
            if in_dropout:
                continue
            # ------------------------------------------------ BASS: the A pedal in 16ths
            if groove_active("bass", f) or in_return or in_roll or world or climax:
                fz, acc = bass_pattern(bar_idx, f)[step]
                lvl = LV["bass"] + gs + (1.0 if in_roll else 0.0)
                dur = 0.082 if acc < 0.8 else 0.098
                bx = cached(("bass", fz, round(acc, 2), dur), lambda fz=fz, acc=acc, dur=dur: synth.bass_note(
                    fz, dur, accent=acc, seed=int(acc * 100) + int(fz), cut_hi=2300.0 + (900.0 if (world or climax) else 0.0)))
                mx.add("bass", s, bx, lvl, name="BASS", kind="bass", check=False)
            # ------------------------------------------------ KICK
            ks = {0: 1.0, 4: 0.80, 8: 0.92, 12: 0.80}
            if world:
                ks.update({10: 0.55, 14: 0.62})
            if layer_on("kickghost", f) and not in_roll:
                ks.setdefault(6, 0.45)
                ks.setdefault(14, 0.5)
            if tension <= f < cl:
                ks.update({2: 0.4, 6: 0.55, 10: 0.55, 14: 0.6})
            if climax:
                if cbar == 0:
                    ks.update({10: 0.5})
                elif cbar == 1:
                    ks.update({6: 0.5, 10: 0.55, 14: 0.62})
                else:
                    ks.update({2: 0.5, 6: 0.6, 10: 0.6, 14: 0.7})
                if surge_on:
                    ks.update({1: 0.45, 3: 0.5, 5: 0.5, 7: 0.55, 9: 0.5, 11: 0.55, 13: 0.55, 15: 0.65})
            kick_ok = groove_active("kick", f) or climax or world
            if in_return and step % 4 == 0:
                kick_ok = True
            if in_roll:
                kick_ok = False
            if kick_ok and step in ks:
                v = ks[step]
                big = step == 0 and (bar_idx % 2 == 0)
                kx = v_kick(k_i, thump=0.45 if big else 0.0)
                mx.add("drums", s, kx, LV["kick"] + dbs(v) + gs, sends={"room": -13.0}, name="KICK", kind="drum",
                       duck="kick", check=False)
                k_i += 1
            # ------------------------------------------------ CLAP / SNARE backbeat
            if (groove_active("clap", f) or world or climax) and step in (4, 12) and not in_roll and not in_return:
                cx = v_clap(bar_idx * 2 + (step // 12))
                mx.add("drums", s, cx, LV["clap"] + gs, sends={"hall": -8.5, "room": -9.0}, name="CLAP", kind="drum",
                       check=False)
                if full:
                    sx = v_snare(bar_idx + step, 0.14)
                    mx.add("drums", s, sx, LV["snare"] - 1.0 + gs, sends={"hall": -10.5}, name="SNARE", kind="drum",
                           check=False)
            if climax and cbar >= 2 and step % 2 == 0 and step not in (4, 12) and not surge_on:
                sx = v_snare(bar_idx + step, 0.12)                    # eighth-note snares build under bar 20
                mx.add("drums", s, sx, LV["snare"] - 6.0 + gs + 0.4 * step, sends={"hall": -11.0}, name="SNARE8", kind="drum",
                       check=False)
            if layer_on("ghostclap", f) and step in (7, 15) and groove_active("clap", f) and not in_roll and not (climax and cbar < 1):
                cx = v_clap(bar_idx + step)
                mx.add("drums", s, cx, LV["clap"] - 9.0 + gs, sends={"hall": -11.0}, name="GHOSTCLAP", kind="drum", check=False)
            # ------------------------------------------------ TAIKO (the deep drums, tuned to the chord context)
            if groove_active("taiko", f) or world or climax:
                tk_steps = {0: (55.0, 1.0, 0.85), 10: (82.41, 0.55, 0.55)}
                if layer_on("taiko2", f) or full:
                    tk_steps.update({8: (55.0, 0.7, 0.6), 14: (110.0, 0.55, 0.45)})
                if (bar_idx % 4 == 3) and not in_roll and not climax:
                    tk_steps.update({12: (110.0, 0.5, 0.40), 13: (123.47, 0.55, 0.36), 14: (146.83, 0.6, 0.36),
                                     15: (164.81, 0.7, 0.36)})
                if climax and cbar >= 1:
                    tk_steps.update({12: (110.0, 0.5, 0.40), 13: (123.47, 0.55, 0.36), 14: (146.83, 0.6, 0.36),
                                     15: (164.81, 0.7, 0.36)})
                if step in tk_steps and not in_roll and not (in_return and step != 0):
                    fz, v, dc = tk_steps[step]
                    tx = cached(("taikoG", fz, dc, (k_i + step) % 3), lambda fz=fz, dc=dc, i=k_i + step: synth.taiko(
                        fz, dc, seed=i % 3, slap=1.0, sub_amt=0.65, sub_decay=0.6))
                    mx.add("drums", s, tx, LV["taiko"] + dbs(v) + gs, sends={"hall": -8.0, "room": -11.0}, name="TAIKO",
                           kind="drum", duck="small" if step else "med", check=False)
                    for j, (off, dg, ratio) in enumerate(((0.007, -5.0, 1.0), (0.013, -7.0, 1.5))):          # the ensemble
                        tx2 = cached(("taikoE", fz, dc, j), lambda fz=fz, dc=dc, j=j, r=ratio: synth.taiko(
                            fz * r if r != 1.0 else fz, dc, seed=10 + j, slap=0.6, sub_amt=0.2, sub_decay=0.5))
                        mx.add("drums", s + int(off * SR), tx2, LV["taiko"] + dbs(v) + gs + dg, sends={"hall": -8.0},
                               name="TAIKO_E", kind="drum", check=False)
            # ------------------------------------------------ STRINGS: low ensemble ostinato on the A pedal (from New York on)
            if f >= F("CITY_NEWYORK") and not in_return and not in_roll and (step % 2 == 0 or full):
                acc_ = 1.0 if step % 4 == 0 else 0.6
                sx_ = cached(("str", round(acc_, 1), (bar_idx + step) % 4), lambda a=acc_, i=(bar_idx + step) % 4: foley.string_note(
                    110.0, 0.10, i, accent=a))
                mx.add("music", s, sx_, -21.0 + gs + (0 if step % 4 == 0 else -3.0), sends={"hall": -11.0}, name="STRINGS",
                       kind="stab", check=False)
            # ------------------------------------------------ TICKS / hats
            t8 = groove_active("ticks8", f) or world or climax
            t16 = groove_active("ticks16", f) or world or (climax and cbar >= 1)
            if (t8 or t16) and not in_roll:
                hv = None
                if step % 2 == 0:
                    hv = 0.72 if step % 4 == 0 else 0.5
                elif t16:
                    hv = 0.28 if step % 4 == 3 else 0.22
                if hv is not None and (t16 or step % 2 == 0):
                    hx = v_hat(k_i + step)
                    pan = 0.35 * np.sin(f * 1.7)
                    hxx = dsp.to_stereo(hx.mean(axis=1), pan) if abs(pan) > 0.01 else hx
                    mx.add("drums", s, hxx, LV["hat"] + dbs(hv) + 0.5 * gs, sends={"room": -14.0}, name="HAT", kind="drum",
                           check=False)
                if layer_on("ride", f) and step in (6, 14) and not in_return:
                    ox = v_hat(step + bar_idx, open_=True)
                    mx.add("drums", s, ox, LV["hat"] + 1.5 + 0.5 * gs, sends={"room": -11.0, "hall": -15.0}, name="OPENHAT",
                           kind="drum", check=False)
            # ------------------------------------------------ ANVILS: construction as percussion (steel rings on the chord root)
            if f >= F("CITY_NEWYORK") and not in_return and not in_roll:
                anv_steps = (6, 10, 14) if full else (10,)
                if step in anv_steps:
                    f0 = ANVIL_F0.get(chord_for(f), 220.0) * (1.5 if (step == 14) else 1.0)
                    ax = cached(("anvilG", round(f0, 1), (bar_idx + step) % 3), lambda f0=f0, i=(bar_idx + step) % 3: synth.anvil(
                        f0, seed=i, decay=0.30))
                    mx.add("drums", s, ax, LV["anvil"] + gs + (0.0 if step == 10 else -3.0), sends={"hall": -10.0, "room": -9.0},
                           name="ANVIL", kind="drum", check=False)
            # ------------------------------------------------ BRASS pulse (GRID_8 on; enters bar 19 of the build)
            if layer_on("brass", f) and not in_return and not in_roll and (step % 2 == 0) and not (climax and cbar < 1):
                ch = chord_for(f)
                if ch in VOICE and "stab" in VOICE[ch]:
                    accent = step in (0, 6, 10, 14) or (full and step % 4 == 0)
                    if accent or full:
                        x = cached(("brass", ch, step % 3), lambda ch=ch, st=step: synth.stab(
                            HZ(VOICE[ch]["stab"]), dur_s=0.115, seed=70 + st, bright=0.9, release=0.10))
                        mx.add("music", s, x, LV["stab"] - (0 if accent else 4.5) + gs, sends={"hall": -10.0}, name="BRASS",
                               kind="stab", check=False)
    _t(f"  groove placed in {time.time() - t0:.1f}s")


# ======================================================================================================
# ACT III - DUBAI hits, ACT IV - EVERY CITY
# ======================================================================================================
def landing(mx, c, idx):
    heavy = c.p.get("heavy", False)
    pan = c.p["pan"]
    f0 = [55.0, 82.41, 110.0, 73.42][idx % 4] if not heavy else 55.0
    key = ("landing", heavy, idx % 4, round(pan, 2))
    x = cached(key, lambda: synth.impact(f0, 0.5, seed=300 + idx, t60=1.35 if heavy else 0.75, tail=2.0 if heavy else 1.2,
                                         mid=1.0 if heavy else 0.8, crack=1.0 if heavy else 0.8, air=0.4, debris=0.2 if heavy else 0.0,
                                         groan=0.0, pan=pan, sub_gain=0.9 if heavy else 0.35, steel_f=None))
    gain = LV["erupt_heavy"] if heavy else LV["erupt_light"]
    if not heavy:
        gain += 1.5 * np.sin(idx * 1.3)                                   # a little level life
    mx.add("impacts", c.sample, x, gain, sends={"hall": -12.5 if not heavy else -9.0, "room": -10.0}, name=c.name, kind="landing", cue=c.name,
           frame=c.frame, duck="med" if heavy else "small")


def city_hit(mx, c):
    order = c.p.get("order", 0) if "order" in c.p else 0
    ni = c.p["note_idx"]
    top = CITY_TOPS[ni]
    size = 0.55 + 0.30 * ni / 9.0
    chord = chord_for(c.frame)
    x = cached(("city", ni), lambda: synth.impact(55.0, size, seed=400 + ni, t60=1.3 + 0.55 * size, tail=2.4, mid=0.95,
                                                  crack=1.0, air=0.8, debris=0.45, groan=0.0, sub_gain=0.9, steel_f=220.0))
    gain = LV["city0"] + (LV["city1"] - LV["city0"]) * ni / 9.0
    mx.add("impacts", c.sample, x, gain, sends={"hall": -6.0, "room": -9.0}, name=c.name, kind="city", cue=c.name,
           frame=c.frame, duck="big" if ni >= 7 else "med")
    ni_ = ni
    bcl = foley.beam_clang(1000 + ni, f0=130.0 + 12.0 * ni, dur=1.6, size=1.0 + 0.04 * ni)
    mx.add("impacts", c.sample, bcl, gain - 9.0, sends={"hall": -8.0, "room": -9.0}, name=c.name + "_beam", kind="foley", check=False)
    th = foley.concrete_thump(1100 + ni, f=50.0 + 2.0 * ni, dur=0.6, size=1.2)
    mx.add("impacts", c.sample, th, gain - 5.0, name=c.name + "_thump", kind="foley", check=False)
    rb = foley.concrete_thump(1200 + ni, f=66.0, dur=0.3, size=0.8)                    # crown dip-and-rebound
    mx.add("impacts", c.sample + int(0.15 * SR), rb, gain - 13.0, name=c.name + "_rebound", kind="foley", check=False)
    win = 12 if ni else 16
    gl = foley.glass_ripple(1300 + ni, win / 30.0, n_seats=20 + 3 * ni)
    mx.add("fx", c.sample - int(win / 30.0 * SR), gl, -22.0 + 0.8 * ni, sends={"hall": -12.0}, name=c.name + "_glass", kind="foley",
           check=False)
    ratchet(mx, c.frame - win, c.frame, 30 + ni, -27.0, n=8 + ni)
    notes = VOICE[chord]["stab"] + [top]
    st = cached(("citystab", chord, ni), lambda: synth.stab(HZ(notes), dur_s=0.30 + 0.01 * ni, seed=500 + ni, bright=1.0 + 0.04 * ni,
                                                           release=0.34))
    mx.add("music", c.sample, st, gain - 3.0, sends={"hall": -6.5}, name=c.name + "_stab", kind="stab", cue=c.name,
           frame=c.frame, check=False)
    bl = cached(("citybell", top), lambda: synth.bell(note_hz(top), 1.8, seed=600 + ni, amp_tau=0.55, index=3.6))
    mx.add("music", c.sample, bl, gain - 5.0, sends={"hall": -5.0}, name=c.name + "_bell", kind="bell", cue=c.name,
           frame=c.frame, check=False)


def whip_into(mx, c):
    hit = CITY_HIT_FOR[c.p["city"]]
    dur = (E(c.name) - F(c.name)) / 30.0
    k = c.p["order"]
    fast = dur < 0.2
    x = cached(("whip", c.name), lambda: synth.whoosh(dur, "whip", pan0=-0.88, pan1=0.88, seed=700 + k,
                                                      f_lo=900.0 if fast else 480.0, f_hi=9800.0 if fast else 7600.0,
                                                      q=2.2, peak_at=0.8, end_fade_ms=3.0))
    gain = -9.5 + 4.0 * k / 9.0
    mx.add("fx", c.sample, x, gain, sends={"hall": -15.0}, name=c.name, kind="whoosh", cue=c.name, frame=c.frame,
           check=False)


CITY_HIT_FOR = {}


def acts34(mx):
    for c in cues.group("ERUPT_"):
        landing(mx, c, c.p["index"])
    # Dubai city hit (the 5th eruption lands with it)
    city_hit(mx, cues.CUES["CITY_DUBAI"])
    for n, hit, w0 in cues.CITY_LIST:
        CITY_HIT_FOR[n] = cues.CUES["CITY_" + n]
    for c in cues.group("WHIP_"):
        whip_into(mx, c)
    for c in cues.group("CITY_"):
        if c.name == "CITY_DUBAI":
            continue
        city_hit(mx, c)
    # DROP: kick + impact + the first eruption
    dr = cached("drop_imp", lambda: synth.impact(55.0, 1.0, seed=51, t60=2.5, tail=3.4, groan=0.0, sub0=0.2,
                                                steel_f=220.0, mid=1.0))
    mx.add("impacts", S("DROP"), dr, LV["drop"], sends={"hall": -6.0}, name="DROP", kind="impact", cue="DROP",
           frame=F("DROP"), duck="big")
    # riser under the last cities
    rz = synth.noise_riser((E("RISER_CITIES") - F("RISER_CITIES")) / 30.0, f0=500.0, f1=12500.0, q=1.2, seed=8, amp0_db=-34.0,
                           trem=(7.0, 38.0))
    mx.add("fx", S("RISER_CITIES"), rz, -12.0, until=S("GRID_2") - int(0.006 * SR), name="RISER_CITIES", kind="riser",
           cue="RISER_CITIES", frame=F("RISER_CITIES"), check=False)


# ======================================================================================================
# ACT V - AT ONCE
# ======================================================================================================
def tick_cloud(n_ticks, seed, spread_ms, coherent=False, pan_w=0.95):
    """N glassy pings (damped sines on the A dominant series) placed within `spread_ms` (or all on sample 0)."""
    rng = rng_for(800, seed)
    n = int((spread_ms * 1e-3 + 0.09) * SR)
    out = np.zeros((n, 2))
    freqs = HZ(["A5", "E6", "A6", "C#7", "E7", "G6", "C#6", "E5", "A7"])
    for i in range(n_ticks):
        f = freqs[i % len(freqs)] * (1.0 + 0.004 * rng.uniform(-1, 1))
        tau = float(rng.uniform(0.0025, 0.0065))
        tk = synth.tick(seed=int(rng.integers(0, 1 << 20)), f=f, tau=tau)
        off = 0 if coherent else int(rng.uniform(0, spread_ms) * 1e-3 * SR)
        pan = float(rng.uniform(-pan_w, pan_w))
        gl, gr = dsp.pan_gains(pan)
        m = tk[:, 0]
        e = min(n, off + len(m))
        out[off:e, 0] += m[: e - off] * gl
        out[off:e, 1] += m[: e - off] * gr
    return out / np.sqrt(max(1, n_ticks))


def act5(mx):
    # GRID hits: 2, 4, 8, 16, 32, 64 panels: an impact that grows + a scattered ping-cloud of N voices
    for c in cues.group("GRID_"):
        np_ = c.p["panels"]
        o = c.p["order"]
        size = 0.50 + 0.10 * o
        imp = cached(("grid", np_), lambda: synth.impact(55.0, size, seed=900 + o, t60=1.4 + 0.15 * o, tail=2.4 + 0.1 * o, mid=1.0,
                                                         crack=1.0, air=0.8 + 0.1 * o, debris=0.5, groan=0.0, sub_gain=0.9,
                                                         steel_f=220.0))
        gain = -14.0 + 1.6 * o
        mx.add("impacts", c.sample, imp, gain, sends={"hall": -6.0, "room": -10.0}, name=c.name, kind="grid", cue=c.name,
               frame=c.frame, duck="big" if o >= 4 else "med")
        cl = cached(("cloud", np_), lambda: tick_cloud(np_, o, 48.0))
        mx.add("fx", c.sample, cl, -13.0 + 0.6 * o, sends={"hall": -10.0}, name=c.name + "_cloud", kind="tick", cue=c.name,
               frame=c.frame, check=False)
    # UNISON: all 64 collapse on ONE transient
    u = S("UNISON")
    mx.duck_events.append((S("UNISON_GAP"), "gap", 1.0))                  # the one-frame vacuum before the unison
    imp = cached("unison_imp", lambda: synth.impact(55.0, 1.3, seed=950, t60=1.9, tail=3.4, groan=0.5, sub0=0.4, steel_f=220.0,
                                                   mid=1.15, crack=1.25, body_decay=0.9))
    mx.add("impacts", u, imp, LV["unison"], sends={"hall": -4.5}, name="UNISON", kind="unison", cue="UNISON",
           frame=F("UNISON"), duck="big")
    cl = cached("unison_cloud", lambda: tick_cloud(64, 99, 0.0, coherent=True, pan_w=0.7))
    mx.add("fx", u, cl, -6.5, sends={"hall": -8.0}, name="UNISON_cloud", kind="tick", cue="UNISON", frame=F("UNISON"),
           check=False)
    st = cached("unison_stab", lambda: synth.stab(HZ(["A1", "A2", "E3", "A3", "C#4", "E4", "A4", "C#5"]), 0.5, seed=951,
                                                 bright=1.15, release=0.5))
    mx.add("music", u, st, LV["unison"] - 4.5, sends={"hall": -5.5}, name="UNISON_stab", kind="stab", cue="UNISON",
           frame=F("UNISON"), check=False)
    b5 = cached("bell_A5_long2", lambda: synth.bell(note_hz("A5"), 5.5, seed=42, amp_tau=1.5))
    mx.add("music", S("TEASE_2"), b5, -13.0, sends={"hall": -3.5, "finale": -9.0}, name="TEASE_2", kind="bell",
           cue="TEASE_2", frame=F("TEASE_2"))
    ratchet(mx, F("GRID_64"), F("UNISON"), 50, -25.0, n=26, p=0.5)                  # 64 towers locking, resolves into ONE
    ratchet(mx, F("ROLL"), F("DROP_WORLD") - 1, 51, -24.0, n=30, p=0.5)
    # ROLL: riser + drum roll 16ths -> 32nds, ending one frame before the drop
    r0, r1 = F("ROLL"), F("DROP_WORLD")
    rz = synth.noise_riser((r1 - r0) / 30.0, f0=380.0, f1=13000.0, q=1.3, seed=10, amp0_db=-36.0, trem=(8.0, 44.0))
    mx.add("fx", S("ROLL"), rz, -10.0, until=S("DROP_WORLD") - int(0.008 * SR), name="ROLL_riser", kind="riser", cue="ROLL",
           frame=r0, check=False)
    hits = [(f, 4) for f in range(r0, r0 + 16, 4)] + [(f, 2) for f in range(r0 + 16, r1 - 1, 2)]
    for i, (f, sp) in enumerate(hits):
        u_ = i / (len(hits) - 1)
        sx = v_snare(i, 0.12)
        gain = -22.0 + 17.0 * u_ ** 0.9
        mx.add("drums", cues.f2s(f), sx, gain, sends={"hall": -9.0 - 4.0 * u_, "room": -10.0}, name="ROLL", kind="drum",
               duck="small" if sp == 4 else None, check=False)
        if i % 2 == 0:
            f0 = [55.0, 82.41, 110.0, 146.83][i // 3 % 4]
            tx = v_taiko(f0, 0.35, i)
            mx.add("drums", cues.f2s(f), tx, -14.0 + 5.0 * u_, sends={"hall": -9.0}, name="ROLL_taiko", kind="drum", check=False)


# ======================================================================================================
# ACT VI - THE WORLD
# ======================================================================================================
def act6(mx):
    dw = S("DROP_WORLD")
    imp = cached("dw_imp", lambda: synth.impact(55.0, 1.25, seed=960, t60=3.0, tail=4.0, groan=0.5, sub0=0.3, steel_f=220.0,
                                               mid=1.1, crack=1.1))
    mx.add("impacts", dw, imp, LV["drop_world"], sends={"hall": -5.0}, name="DROP_WORLD", kind="impact", cue="DROP_WORLD",
           frame=F("DROP_WORLD"), duck="big")
    br = cached("dw_braam", lambda: synth.braam(HZ(VOICE["A7"]["braam"]), 2.0, seed=961, release=0.5, cut_peak=4200.0,
                                               cut_end=720.0, cut_tau=0.55, hold=0.62, growl=0.7))
    mx.add("music", dw, br, LV["drop_world"] - 4.0, sends={"hall": -6.0}, name="DROP_WORLD_braam", kind="braam",
           cue="DROP_WORLD", frame=F("DROP_WORLD"), check=False)
    # SOLD stamps: one per language board, each carrying a rising A7 arpeggio note
    pans = [-0.55, 0.55, 0.0, -0.75, 0.75, -0.3, 0.3, 0.0, -0.85, 0.85, -0.45, 0.45]
    for c in cues.group("STAMP_"):
        i = c.p["index"]
        x = cached(("stamp", c.p["note"]), lambda c=c, i=i: stamp_big(c.p["note"], i))
        pan = pans[i]
        xs = dsp.to_stereo(x.mean(axis=1) * 0.35, pan) + x * 0.65 if abs(pan) > 0.01 else x
        mx.add("impacts", c.sample, xs, -8.0 + 0.35 * i, sends={"hall": -8.0, "room": -9.0}, name=c.name, kind="stamp",
               cue=c.name, frame=c.frame, duck="stamp")
    rng = rng_for(970)
    for c in cues.group("STORM_"):
        i = c.p["index"]
        x = cached(("stamp_s", c.p["note"], i % 3), lambda c=c, i=i: stamp_big(c.p["note"], 100 + i % 3, size=0.8,
                                                                               note_level=0.45))
        pan = float(rng.uniform(-0.85, 0.85))
        xs = dsp.to_stereo(x.mean(axis=1) * 0.35, pan) + x * 0.65
        mx.add("impacts", c.sample, xs, -9.0 + 0.4 * i, sends={"hall": -9.0}, name=c.name, kind="stamp", cue=c.name,
               frame=c.frame, duck="stamp", duck_scale=0.7)
    # TENSION: rising noise riser + the Shepard creeps in
    t0, t1 = F("TENSION"), E("TENSION")
    rz = synth.noise_riser((t1 - t0) / 30.0, f0=250.0, f1=9000.0, q=1.1, seed=12, amp0_db=-42.0, amp1_db=-6.0, trem=(5.0, 30.0))
    mx.add("fx", S("TENSION"), rz, -13.0, name="TENSION_riser", kind="riser", cue="TENSION", frame=t0, check=False)


# ======================================================================================================
# ACT VII - CLIMAX
# ======================================================================================================
def act7(mx):
    c0 = S("CLIMAX")
    imp = cached("climax_imp", lambda: synth.impact(55.0, 0.95, seed=980, t60=2.6, tail=3.4, groan=0.0, sub0=0.25, steel_f=220.0))
    mx.add("impacts", c0, imp, LV["climax"], sends={"hall": -6.0}, name="CLIMAX", kind="impact", cue="CLIMAX",
           frame=F("CLIMAX"), duck="big")
    br = cached("climax_braam", lambda: synth.braam(HZ(VOICE["A7b9"]["braam"]), 2.4, seed=981, release=0.6, cut_peak=3800.0,
                                                   cut_end=700.0, cut_tau=0.65, hold=0.7, growl=0.6))
    mx.add("music", c0, br, LV["climax"] - 4.0, sends={"hall": -6.0}, name="CLIMAX_braam", kind="braam", cue="CLIMAX",
           frame=F("CLIMAX"), check=False)
    # Shepard riser across the whole build (rate accelerates), peaking at the surge
    d = (E("SHEPARD") - F("SHEPARD")) / 30.0
    sh = synth.shepard(d, seed=5, center=640.0, r0=0.20, r1=0.95, amp0_db=-26.0, amp1_db=0.0)
    mx.add("music", S("SHEPARD"), sh, -9.0, sends={"hall": -7.0}, name="SHEPARD", kind="riser", cue="SHEPARD",
           frame=F("SHEPARD"), check=False)
    # the pull-back: wind pressure of the camera retreating, f1152-1343, + high-altitude air
    pb = synth.whoosh((1344 - 1152) / 30.0, "soft", f_lo=260.0, f_hi=2600.0, q=1.2, pan0=-0.3, pan1=0.3, seed=60, low=0.8,
                      pressure=0.9, end_fade_ms=20.0)
    pb = pb * (np.linspace(0.15, 1.0, len(pb)) ** 1.4)[:, None]
    mx.add("fx", S("CLIMAX"), pb, -16.0, sends={"hall": -12.0}, name="PULLBACK", kind="whoosh", cue=None, frame=F("CLIMAX"), check=False)
    # choir 'ah' under the climax (A7b9 tones), rising with the build
    ch = foley.choir(HZ(["A3", "E4", "G4", "Bb4", "C#5"]), (F("HARD_SILENCE") - F("CLIMAX") - 8) / 30.0, seed=7, attack=3.0,
                     release=0.3)
    fr_ = F("CLIMAX") + np.arange(len(ch)) / cues.SPF
    cg = np.interp(fr_, [1152, 1280, 1344, 1376], [-34.0, -26.0, -19.0, -17.0])
    mx.add("music", S("CLIMAX"), ch * dbl(cg)[:, None], 0.0, sends={"hall": -6.0}, name="CHOIR_CLIMAX", kind="pad", check=False)
    # a second noise riser for the last 3 bars, accelerating tremolo
    n0 = F("RISER_CLIMAX")
    rz = synth.noise_riser((E("RISER_CLIMAX") - n0) / 30.0, f0=300.0, f1=14000.0, q=1.2, seed=14, amp0_db=-40.0, amp1_db=0.0,
                           trem=(6.0, 56.0), curve=2.4)
    mx.add("fx", cues.f2s(n0), rz, -7.0, name="CLIMAX_riser", kind="riser", cue="RISER_CLIMAX", frame=n0, check=False)
    # SURGE accents: snare roll in 32nds (the first hit is the SURGE cue itself)
    s0, s1 = F("SURGE"), E("SURGE")
    for i, f in enumerate(range(s0, s1 - 1, 2)):
        u_ = i / ((s1 - s0) // 2 - 1)
        sx = v_snare(i + 1, 0.10)
        mx.add("drums", cues.f2s(f), sx, -16.0 + 10.0 * u_, sends={"hall": -9.0}, name="SURGE_snare", kind="drum",
               cue="SURGE" if i == 0 else None, frame=f if i == 0 else None, check=False)


# ======================================================================================================
# ACT VIII - THE CADENCE  (A dominant -> D tonic)
# ======================================================================================================
def act8(mx):
    a, d = S("A_DOMINANT"), S("D_TONIC")
    # A_DOMINANT: enormous impact + the full A7 chord
    imp = cached("adom_imp", lambda: synth.impact(55.0, 1.55, seed=990, t60=3.4, tail=4.4, groan=0.8, sub0=0.4, steel_f=220.0,
                                                 mid=1.15, crack=1.15))
    mx.add("impacts", a, imp, LV["a_dom"], sends={"hall": -5.0}, name="A_DOMINANT", kind="cadence", cue="A_DOMINANT",
           frame=F("A_DOMINANT"), duck="big")
    dur = (F("D_TONIC") - F("A_DOMINANT")) / 30.0 - 0.02
    br = cached("adom_braam", lambda: synth.braam(HZ(VOICE["A7"]["braam"] + ["C#5"]), dur, seed=991, release=0.12, cut_peak=4200.0,
                                                 cut_end=900.0, cut_tau=0.9, hold=0.72, growl=0.75, attack=0.004))
    mx.add("music", a, br, LV["a_dom"] - 3.5, sends={"hall": -9.0}, name="A_DOMINANT_braam", kind="braam", cue="A_DOMINANT",
           frame=F("A_DOMINANT"), check=False)
    pd = synth.pad(HZ(VOICE["A7"]["pad"]), dur, seed=992, attack=0.25, release=0.10, lp_start=900.0, lp_end=3600.0,
                   voices=(-12.0, 0.0, 12.0), chorus_mix=0.5)
    mx.add("music", a, pd, -17.0, sends={"hall": -10.0}, name="A_DOMINANT_pad", kind="pad", cue="A_DOMINANT",
           frame=F("A_DOMINANT"), check=False)
    # D_TONIC: bigger impact tuned to D (D1 = 36.71 Hz), D major with an open voicing, long blooming tail
    imp = cached("dton_imp", lambda: synth.impact(36.71, 1.85, seed=995, t60=4.4, tail=6.0, groan=1.0, sub0=0.3, steel_f=146.83,
                                                 mid=1.2, crack=1.15, body_decay=1.15))
    mx.add("impacts", d, imp, LV["d_ton"], sends={"hall": -5.0, "finale": -4.0}, name="D_TONIC", kind="cadence", cue="D_TONIC",
           frame=F("D_TONIC"), duck="big")
    # D2 weight layer (73.42 Hz) with its own pitch drop, so the sub is audible on small speakers
    imp2 = cached("dton_imp2", lambda: synth.impact(73.42, 1.2, seed=996, t60=3.2, tail=4.0, groan=0.0, sub0=0.0, steel_f=293.66,
                                                   mid=0.8, crack=0.0, air=0.0, debris=0.0, sub_gain=1.0))
    mx.add("impacts", d, imp2, LV["d_ton"] - 7.0, sends={"finale": -9.0}, name="D_TONIC_D2", kind="cadence", cue="D_TONIC",
           frame=F("D_TONIC"), check=False)
    # brass chord: D2 A2 D3 F#3 A3 D4 E4 (add9) - authoritative, open; bloom
    tail_end = F("TAIL_END")
    dur_b = (F("END_SWELL") - F("D_TONIC")) / 30.0
    bd = cached("dton_braam", lambda: synth.braam(HZ(VOICE["D"]["braam"]), dur_b, seed=997, release=2.8, cut_peak=3400.0,
                                                 cut_end=1100.0, cut_tau=1.1, hold=0.30, sag_tau=1.1, growl=0.40, attack=0.012,
                                                 spread=0.95, chiff=0.25))
    mx.add("music", d, bd, LV["d_ton"] - 6.0, sends={"hall": -6.0, "finale": -4.0}, name="D_TONIC_brass", kind="braam",
           cue="D_TONIC", frame=F("D_TONIC"), check=False)
    # pad bloom: D major pad swells in under the hit and sustains under everything (then decays naturally)
    dur_p = (F("TAIL_END") - F("D_TONIC")) / 30.0 - 0.5
    pdD = cached("dton_pad", lambda: synth.pad(HZ(VOICE["D"]["pad"]), dur_p, seed=998, attack=1.6, release=0.2, lp_start=700.0,
                                              lp_end=3200.0, sweep_s=3.5, voices=(-12.0, -5.0, 0.0, 5.0, 12.0), chorus_mix=0.6))
    n = len(pdD)
    fr = F("D_TONIC") + np.arange(n) / cues.SPF
    pts = [(1440, -14.0), (1470, -10.0), (1500, -12.0), (1560, -13.5), (1632, -14.5), (1650, -12.5), (1668, -15.0), (1700, -23.0),
           (1735, -36.0), (1790, -66.0)]
    g = np.interp(fr, [p[0] for p in pts], [p[1] for p in pts])
    mx.add("music", d, pdD * dbl(g)[:, None], -10.0, sends={"finale": -4.5}, name="D_TONIC_pad", kind="pad", cue="D_TONIC",
           frame=F("D_TONIC"), check=False)
    chD = foley.choir(HZ(["D3", "A3", "D4", "F#4", "A4", "D5"]), (F("TAIL_END") - F("D_TONIC")) / 30.0 - 1.5, seed=9, attack=1.2,
                      release=1.4)
    frc = F("D_TONIC") + np.arange(len(chD)) / cues.SPF
    cgD = np.interp(frc, [1440, 1470, 1560, 1650, 1700, 1735, 1790], [-34.0, -18.0, -19.0, -20.0, -26.0, -38.0, -66.0])
    mx.add("music", d, chD * dbl(cgD)[:, None], 0.0, sends={"finale": -4.0}, name="CHOIR_D", kind="pad", cue="D_TONIC",
           frame=F("D_TONIC"), check=False)
    # sub pedal on D: D1 + D2 that sustain with a long natural decay
    nS = int((F("TAIL_END") - F("D_TONIC")) / 30.0 * SR)
    t = np.arange(nS) / SR
    sub = (np.sin(2 * np.pi * 36.71 * t) * 0.8 + np.sin(2 * np.pi * 73.42 * t) * 0.55 + np.sin(2 * np.pi * 110.0 * t) * 0.25)
    sub = sub * dsp.exp_env(nS, 3.2, attack=0.012)
    sub = dsp.tanh_os(sub, 1.2, q="lf")
    mx.add("bass", d, sub, -21.0, name="D_TONIC_sub", kind="pedal", cue="D_TONIC", frame=F("D_TONIC"), check=False)
    # high F#5 shimmer (+ A5, D6): glass halo that blooms
    dur_s = (F("TAIL_END") - F("D_TONIC")) / 30.0 - 2.4
    sh = cached("dton_shimmer", lambda: synth.shimmer(HZ(VOICE["D"]["shimmer"]), dur_s, seed=999, attack=2.6, release=2.2))
    n = len(sh)
    fr = F("D_TONIC") + np.arange(n) / cues.SPF
    pts = [(1440, -40.0), (1475, -25.0), (1560, -22.0), (1640, -23.0), (1660, -20.0), (1690, -25.0), (1740, -42.0), (1790, -70.0)]
    g = np.interp(fr, [p[0] for p in pts], [p[1] for p in pts])
    mx.add("music", d, sh * dbl(g)[:, None], -4.0, sends={"finale": -3.0}, name="D_TONIC_shimmer", kind="pad", cue="D_TONIC",
           frame=F("D_TONIC"), check=False)
    # SENTENCE: a soft precise whoosh as the line sets
    sn = synth.whoosh((E("SENTENCE") - F("SENTENCE")) / 30.0, "soft", f_lo=1400.0, f_hi=6200.0, q=3.2, pan0=-0.35, pan1=0.35,
                      seed=15, end_fade_ms=3.0, low=0.0)
    mx.add("fx", S("SENTENCE"), sn, -17.0, sends={"finale": -10.0}, name="SENTENCE", kind="whoosh", cue="SENTENCE",
           frame=F("SENTENCE"), check=False)
    # REBUS_CLICK + the resolved bell call A5 -> D6
    ck = cached("rebus", lambda: synth.mech_click(0))
    mx.add("fx", S("REBUS_CLICK"), ck, -7.0, sends={"room": -14.0}, name="REBUS_CLICK", kind="click", cue="REBUS_CLICK",
           frame=F("REBUS_CLICK"))
    bA = cached("motif_A5", lambda: synth.bell(note_hz("A5"), 6.5, seed=43, amp_tau=2.4, strike=0.7))
    mx.add("music", S("MOTIF_A5"), bA, -10.0, sends={"finale": -4.5, "hall": -8.0}, name="MOTIF_A5", kind="bell", cue="MOTIF_A5",
           frame=F("MOTIF_A5"))
    bD = cached("motif_D6", lambda: synth.bell(note_hz("D6"), 6.5, seed=44, amp_tau=2.6, strike=0.7))
    mx.add("music", S("MOTIF_D6"), bD, -9.0, sends={"finale": -4.5, "hall": -8.0}, name="MOTIF_D6", kind="bell", cue="MOTIF_D6",
           frame=F("MOTIF_D6"))
    # END_SWELL (gentle) + DESCRIPTOR tick
    sw = cached("end_swell", lambda: synth.shimmer(HZ(["D5", "F#5", "A5", "D6"]), (E("END_SWELL") - F("END_SWELL")) / 30.0 + 1.6,
                                                  seed=1001, attack=0.9, release=1.5, vib_cents=4.0))
    mx.add("music", S("END_SWELL"), sw, -17.5, sends={"finale": -4.0}, name="END_SWELL", kind="swell", cue="END_SWELL",
           frame=F("END_SWELL"), check=False)
    tk = synth.tick_tiny(0)
    mx.add("fx", S("DESCRIPTOR"), tk, -22.0, sends={"finale": -8.0, "room": -12.0}, name="DESCRIPTOR", kind="tick",
           cue="DESCRIPTOR", frame=F("DESCRIPTOR"))


# ======================================================================================================
# build
# ======================================================================================================
def build(max_act=9, verbose=True):
    mx = M.Mixer()
    mx.add_cut(S("TOP_LOCK"), hard=True)          # everything before the lock is cut dead at f72
    mx.add_cut(S("LOCK_CUT"))                      # the lock's own ring ends here
    mx.add_cut(S("HARD_SILENCE"), hard=True)       # f1376: cut to silence, no tail may cross
    mx.add_cut(cues.f2s(E("HARD_SILENCE")))
    steps = [("act I", act1), ("pedal", pedal), ("act II", act2), ("acts III-IV", acts34), ("act V", act5), ("act VI", act6),
             ("act VII", act7), ("act VIII-IX", act8), ("pads", pads), ("groove", groove)]
    for name, fn in steps:
        t0 = time.time()
        fn(mx)
        if verbose:
            _t(f"  {name:<12} {time.time() - t0:5.1f}s   ({len(mx.log)} events)")
    return mx


def export(out, stems_out):
    os.makedirs(OUT_STEMS, exist_ok=True)
    assert out.shape == (N_TOTAL, 2), out.shape
    sf.write(OUT_WAV, out, SR, subtype="PCM_24")
    for k, v in stems_out.items():
        sf.write(os.path.join(OUT_STEMS, f"{k}.wav"), np.clip(v, -1.0, 1.0), SR, subtype="PCM_24")


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-verify", action="store_true")
    ap.add_argument("--act", type=int, default=9)
    args = ap.parse_args(argv)
    T0 = time.time()
    _t("1/4 synthesis + arrangement")
    mx = build(args.act)
    _t("2/4 mix (reverbs, sidechain, stems)")
    stems = mx.finalize()
    _t("3/4 master (EQ, gates, glue, soft clip, true-peak limiter, -14 LUFS)")
    out, stems_out, info = M.master(stems)
    _t("4/4 export")
    export(out, stems_out)
    import json
    with open(os.path.join(OUT, "events.json"), "w") as fh:
        json.dump(dict(events=mx.log, master=info), fh)
    _t(f"audio done in {time.time() - T0:.1f}s -> {OUT_WAV}")
    if not args.no_verify:
        import verify
        verify.run(out=out, stems=stems_out, log=mx.log, info=info)
        _t(f"total {time.time() - T0:.1f}s")


if __name__ == "__main__":
    main()
