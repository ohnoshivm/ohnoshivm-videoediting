"""master.py - the bus / mix stage and the master chain of the DOMINANT score.

Signal flow
    events --(score.py)--> dry buses (impacts, drums, bass, music, fx, ambience) + three reverb sends
    sends  --> 3 synthetic halls (hall T60~4.2 s, room ~1.0 s, finale ~5.3 s; pre-delay 20 / 6 / 28 ms;
               decorrelated 2x2 IRs) convolved PER SEGMENT, so no tail ever crosses a hard cut (f72, f81, f1376)
    sidechain: kick / impact / landing / stamp events duck bass, music, ambience and the reverb return
               (look-ahead: the duck starts 3-4 ms BEFORE the hit, so there is no click and the hit stays on the frame)
    buses  --> HP / bass-mono below 120 Hz --> stems: impacts, drums, bass, music, fx, ambience, reverb
    master   HP 20 Hz, 2-5 kHz tame (broad -2 dB), 19 kHz air LP  ->  hard-silence gates (<= 3 ms fade)
             -> gentle glue compressor (1.8:1) -> 4x-oversampled soft clip -> 4x look-ahead true-peak limiter
             -> make-up gain solved so BS.1770-4 integrated loudness lands on -14.0 LUFS -> exact digital silence
             inside the hard cuts -> 24-bit export.
    Every master stage after the linear EQ is a pure gain curve applied identically to every stem, so the
    stems sum to score.wav (checked in verify.py).
"""
from __future__ import annotations

import time

import numpy as np
from scipy import signal

import cues
import dsp
from dsp import N_TOTAL, SR, dbl, f2s

BUSES = ["impacts", "drums", "bass", "music", "fx", "ambience"]
SENDS = ["hall", "room", "finale"]
STEMS = BUSES + ["reverb"]

# mix-desk trims (dB) applied to each bus after the events are summed
BUS_TRIM_DB = {"impacts": 0.0, "drums": -1.5, "bass": -2.0, "music": -1.0, "fx": -3.0, "ambience": 0.0}
RETURN_DB = {"hall": -4.5, "room": -5.5, "finale": -6.0}      # reverb return levels

HALL_SPECS = {   # t60 (nominal, mid band), pre-delay, band multipliers, seed
    "hall": dict(t60=5.0, predelay=0.020, seed=(101,), hp_hz=120.0, lp_hz=10000.0),
    "room": dict(t60=1.15, predelay=0.006, seed=(102,), hp_hz=140.0, lp_hz=12000.0,
                 mult=[0.8, 0.9, 1.0, 1.0, 0.9, 0.75, 0.55, 0.35, 0.2], er_level=0.30, er_span=0.050),
    "finale": dict(t60=6.2, predelay=0.028, seed=(103,), hp_hz=110.0, lp_hz=9000.0),
}

# sidechain presets: depth in dB per target, look-ahead (pre), hold and exponential release (seconds)
DUCK = {
    "kick": dict(bass=9.0, music=1.7, ambience=1.2, wet=0.0, pre=0.003, hold=0.0, rel=0.11),
    "big": dict(bass=10.0, music=6.0, ambience=5.0, wet=2.5, pre=0.004, hold=0.05, rel=0.55),
    "med": dict(bass=6.0, music=3.0, ambience=2.5, wet=1.2, pre=0.004, hold=0.02, rel=0.28),
    "small": dict(bass=3.0, music=1.4, ambience=1.0, wet=0.5, pre=0.003, hold=0.0, rel=0.14),
    "stamp": dict(bass=2.5, music=2.0, ambience=1.0, wet=0.8, pre=0.003, hold=0.0, rel=0.16),
    # a one-frame vacuum: everything but the hit itself ducks out for `hold` seconds (set to the gap length by the caller)
    "gap": dict(bass=40.0, music=40.0, ambience=40.0, wet=40.0, pre=0.004, hold=0.033, rel=0.004),
}

BASS_MONO_HZ = 120.0
LUFS_TARGET = -14.0
CEILING_DBFS = -1.25
END_FADE_FRAME = 1768          # a safety fade (inaudible: the tonic is already < -50 dB) so the last frame is exact silence


def _log(msg):
    print(msg, flush=True)


class Mixer:
    """collects events into buses, sends and sidechain keys; `finalize()` renders reverbs and the stems."""

    def __init__(self):
        self.dry = {b: np.zeros((N_TOTAL, 2)) for b in BUSES}
        self.snd = {s: np.zeros((N_TOTAL, 2)) for s in SENDS}
        self.duck_events: list[tuple[int, str, float]] = []
        self.log: list[dict] = []
        self.irs: dict[str, np.ndarray] = {}
        self.cuts = [0, N_TOTAL]          # reverb segment boundaries (hard cuts)
        self.hard_cuts: list[int] = []    # events that span one of these samples are truncated there

    # ----------------------------------------------------------------------------------------------
    def ir(self, name: str) -> np.ndarray:
        if name not in self.irs:
            self.irs[name] = dsp.make_hall_ir(**HALL_SPECS[name])
        return self.irs[name]

    def add_cut(self, sample: int, hard=False):
        """a reverb-segment boundary (tails never cross it); hard=True additionally truncates every event that
        starts before it and would sound across it (a true cut to silence)."""
        if sample not in self.cuts:
            self.cuts.append(int(sample))
            self.cuts.sort()
        if hard and sample not in self.hard_cuts:
            self.hard_cuts.append(int(sample))

    def add(self, bus, s0, x, gain_db=0.0, sends=None, until=None, name=None, kind=None, duck=None, duck_scale=1.0,
            cue=None, frame=None, check=True):
        """place stereo (or mono) event x at sample s0. `until` truncates the event (raised-cosine 1.2 ms fade-out)
        so a hard cut really is one. Returns the sample range actually written."""
        s0 = int(s0)
        if s0 >= N_TOTAL or s0 < 0:
            return None
        if x.ndim == 1:
            x = np.stack([x, x], axis=1)
        e = min(N_TOTAL, s0 + len(x))
        for hc in self.hard_cuts:
            if s0 < hc < e:
                until = hc if until is None else min(until, hc)
        if until is not None:
            if s0 >= until:
                return None
            e = min(e, int(until))
        seg = x[: e - s0] * float(dbl(gain_db))
        if until is not None and e == int(until) and (e - s0) < len(x):
            nf = min(int(0.0012 * SR), e - s0)
            seg = seg.copy()
            seg[-nf:] *= (0.5 + 0.5 * np.cos(np.pi * (np.arange(nf) + 1) / (nf + 1)))[:, None]
        self.dry[bus][s0:e] += seg
        if sends:
            for k, db in sends.items():
                self.snd[k][s0:e] += seg * float(dbl(db))
        if duck:
            self.duck_events.append((s0, duck, duck_scale))
        self.log.append(dict(name=name or kind or bus, cue=cue, frame=frame, sample=s0, end=e, bus=bus, kind=kind,
                             check=check, duck=duck))
        return s0, e

    # ----------------------------------------------------------------------------------------------
    def _reverb(self):
        """three halls, convolved per segment (tails never cross a hard cut); the heavy FFT convolutions run in threads."""
        t0 = time.time()
        wet = np.zeros((N_TOTAL, 2))
        sos = np.vstack([signal.butter(2, 150.0, "highpass", fs=SR, output="sos"),
                         signal.butter(2, 9500.0, "lowpass", fs=SR, output="sos")])
        segs = list(zip(self.cuts[:-1], self.cuts[1:]))
        names = [n for n in SENDS if np.any(self.snd[n])]
        dsp.par_map(self.ir, names, 3)                           # impulse responses, in parallel
        tasks = []
        for name in names:
            send = dsp.sosfilt_st(sos, self.snd[name])
            self.snd[name] = None
            for a, b in segs:
                seg = send[a:b]
                nz = np.flatnonzero(np.abs(seg).max(axis=1) > 1e-9)
                if len(nz) == 0:
                    continue
                i0, i1 = int(nz[0]), int(nz[-1]) + 1
                tasks.append((name, a, b, i0, seg[i0:i1]))

        def run(t):
            name, a, b, i0, x = t
            ir = self.irs[name]
            y = dsp.conv_stereo(x, ir, out_len=len(x) + len(ir) - 1)
            m_ = min(len(y), (b - a) - i0)                      # truncated at the segment (= hard cut) boundary
            y = y[:max(m_, 0)] * float(dbl(RETURN_DB[name]))
            if m_ > 0 and i0 + m_ >= (b - a):                   # cut by the boundary: 1.5 ms fade so the cut itself is clean
                nf = min(int(0.0015 * SR), m_)
                y[-nf:] *= (0.5 + 0.5 * np.cos(np.pi * (np.arange(nf) + 1) / (nf + 1)))[:, None]
            return a + i0, y

        for start, y in dsp.par_map(run, tasks, 4):
            if len(y):
                wet[start:start + len(y)] += y
        _log(f"  reverbs (hall/room/finale) in {time.time() - t0:.1f}s")
        return wet

    def _duck_curves(self):
        t0 = time.time()
        g = {k: np.ones(N_TOTAL) for k in ("bass", "music", "ambience", "wet")}
        for s0, preset, scale in self.duck_events:
            p = DUCK[preset]
            pre, hold, rel = p["pre"], p["hold"], p["rel"]
            npre = int(pre * SR)
            nh = int(hold * SR)
            nr = int(6.0 * rel * SR)
            a = max(0, s0 - npre)
            b = min(N_TOTAL, s0 + nh + nr)
            tt = np.arange(a, b) - s0
            shape = np.zeros(len(tt))
            ramp = tt < 0
            shape[ramp] = 0.5 - 0.5 * np.cos(np.pi * (tt[ramp] + npre) / max(1, npre))
            flat = (tt >= 0) & (tt < nh)
            shape[flat] = 1.0
            dec = tt >= nh
            shape[dec] = np.exp(-(tt[dec] - nh) / (rel * SR))
            for k in g:
                depth = p[k] * scale
                if depth <= 0:
                    continue
                gl = 1.0 - (1.0 - float(dbl(-depth))) * shape
                np.minimum(g[k][a:b], gl, out=g[k][a:b])
        _log(f"  sidechain curves ({len(self.duck_events)} keys) in {time.time() - t0:.1f}s")
        return g

    # ----------------------------------------------------------------------------------------------
    def finalize(self):
        """-> dict of stems (N,2): impacts, drums, bass, music, fx, ambience, reverb (post duck, post bass-mono)."""
        t0 = time.time()
        wet = self._reverb()
        g = self._duck_curves()
        stems = {}
        for b in BUSES:
            x = self.dry.pop(b)
            gain = np.full(N_TOTAL, float(dbl(BUS_TRIM_DB[b])))
            if b in g:
                gain *= g[b]
            x *= gain[:, None]                                  # in place: no extra 46 MB temporaries
            stems[b] = x
        wet *= g["wet"][:, None]
        stems["reverb"] = wet
        hp_by = {"impacts": 20.0, "drums": 24.0, "bass": 22.0, "music": 40.0, "fx": 90.0, "ambience": 20.0, "reverb": 100.0}
        mono_bass = {k: k not in ("fx", "reverb", "bass") for k in stems}

        def proc(k):
            sos = signal.butter(2, hp_by[k], "highpass", fs=SR, output="sos")
            y = dsp.sosfilt_st(sos, stems[k])
            if mono_bass[k]:
                side = 0.5 * (y[:, 0] - y[:, 1])
                low = signal.sosfiltfilt(signal.butter(4, BASS_MONO_HZ, "lowpass", fs=SR, output="sos"), side)
                y[:, 0] -= low
                y[:, 1] += low
            return y

        for k in list(stems):
            stems[k] = proc(k)
        _log(f"  buses -> stems in {time.time() - t0:.1f}s")
        return stems


# ======================================================================================================
# master
# ======================================================================================================
def gate_mask():
    """(N,) smooth gain: raised-cosine fade (<=3 ms) INTO every hard silence, zero inside, 1 after; plus the
    end-card safety fade. Also returns the exact mask (1 / 0) used to clear any filter residue afterwards."""
    g = np.ones(N_TOTAL)
    hard = np.ones(N_TOTAL)
    for a_f, b_f, fade_ms in cues.hard_silences():
        a, b = f2s(a_f), f2s(b_f)
        nf = int(fade_ms * 1e-3 * SR)
        g[a - nf:a] *= 0.5 + 0.5 * np.cos(np.pi * (np.arange(nf) + 1) / (nf + 1))
        g[a:b] = 0.0
        hard[a:b] = 0.0
    e0 = f2s(END_FADE_FRAME)
    nfade = N_TOTAL - e0
    g[e0:] *= 0.5 + 0.5 * np.cos(np.pi * np.arange(nfade) / (nfade - 1))
    hard[-1] = 0.0
    return g, hard


_EQ_SOS = np.vstack([
    signal.butter(2, 20.0, "highpass", fs=SR, output="sos"),
    dsp.peq_sos(3300.0, 0.75, -2.0),                     # tame 2-5 kHz harshness (broad)
    dsp.peq_sos(7200.0, 1.2, -0.8),
    dsp.shelf_sos(10500.0, 1.4, "high"),                  # a little air above the harshness dip
    signal.butter(2, 19000.0, "lowpass", fs=SR, output="sos"),
])


def _eq(x):
    return dsp.sosfilt_st(_EQ_SOS, x)


def master(stems, target_lufs=LUFS_TARGET, ceiling_db=CEILING_DBFS):
    t0 = time.time()
    G, hard = gate_mask()
    names = list(stems)
    proc = {}
    mix = None
    for k in names:
        y = _eq(stems[k])
        y *= G[:, None]
        proc[k] = y
        if mix is None:
            mix = y.copy()
        else:
            mix += y
    # glue-compressor detector: HP 90 Hz, mono (L+R)/2
    det = signal.sosfilt(signal.butter(2, 90.0, "highpass", fs=SR, output="sos"), mix.mean(axis=1))
    _log(f"  EQ + gates in {time.time() - t0:.1f}s")

    def chain(drive_db):
        dg = float(dbl(drive_db))
        g1 = dsp.compressor_gain(det * dg, thr_db=-9.0, ratio=1.5, attack_ms=35.0, release_ms=280.0, knee_db=10.0)
        x = mix * dg                                           # the only big temporary per iteration
        x *= g1[:, None]
        g2 = dsp.softclip_gain(x, knee=0.62)
        x *= g2[:, None]
        g3 = dsp.limiter_gain(x, ceiling_db, 2.0, 110.0)
        x *= (g3 * hard)[:, None]
        return x, (g1 * g2 * g3 * dg), g1, g2, g3

    d = target_lufs - dsp.integrated_lufs(mix) + 1.5
    hist = []
    out = gtot = None
    for it in range(9):
        out, gtot, g1, g2, g3 = chain(d)
        L = dsp.integrated_lufs(out)
        _log(f"    drive {d:+.2f} dB -> {L:.3f} LUFS   (comp GR max {-20 * np.log10(g1.min()):.1f} dB, "
             f"softclip GR max {-20 * np.log10(g2.min()):.1f} dB, limiter GR max {-20 * np.log10(g3.min()):.1f} dB)")
        hist.append((d, L))
        if abs(L - target_lufs) < 0.03:
            break
        if len(hist) == 1:
            slope = 0.75
        else:
            (da, la), (db_, lb) = hist[-2], hist[-1]
            slope = (lb - la) / (db_ - da) if abs(db_ - da) > 1e-6 else 0.75
            slope = float(np.clip(slope, 0.3, 1.2))
        d += (target_lufs - L) / slope
    tot = (gtot * hard)[:, None]
    for k in proc:
        proc[k] *= tot                                         # stems carry the master's own gain curve -> they sum to score.wav
    info = dict(drive_db=float(d), lufs=float(L), comp_gr_max_db=float(-20 * np.log10(g1.min())),
                softclip_gr_max_db=float(-20 * np.log10(g2.min())), limiter_gr_max_db=float(-20 * np.log10(g3.min())),
                limiter_gr_mean_db=float(np.mean(-20 * np.log10(g3))),
                tp_dbtp=float(20 * np.log10(dsp.true_peak_linear(out))))
    _log(f"  master in {time.time() - t0:.1f}s: {info}")
    return out, proc, info
