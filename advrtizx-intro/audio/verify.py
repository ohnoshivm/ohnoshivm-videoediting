#!/usr/bin/env python3
"""verify.py - independent measurement of the delivered files + the images.

    python3 advrtizx-intro/audio/verify.py          # re-measure out/score.wav (+ stems if present), rewrite report.json / PNGs

Checks: exact sample count / format (ffprobe), integrated loudness and true peak (own BS.1770-4 meter,
pyloudnorm, ffmpeg ebur128 peak=true), DC, clipping, hard silences (f1376-1407, no tail past f1377, <= 5 ms cut,
last frame silent), per-cue onset alignment (measured onset vs round(frame x 1600), tolerance +-2 ms),
stems-sum, stereo / bass-mono / spectral balance, and renders spectrogram.png + waveform.png with the cues marked.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import time

import numpy as np
import soundfile as sf
from scipy import signal

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import cues  # noqa: E402
import dsp  # noqa: E402
from dsp import N_TOTAL, SR, f2s  # noqa: E402

OUT = os.path.join(HERE, "out")
WAV = os.path.join(OUT, "score.wav")
STEMS_DIR = os.path.join(OUT, "stems")
TOL_MS = 2.0


def _sh(cmd):
    return subprocess.run(cmd, capture_output=True, text=True)


def db(x):
    return float(20 * np.log10(max(float(x), 1e-12)))


# ----------------------------------------------------------------------------------------------------
# format / loudness cross-checks
# ----------------------------------------------------------------------------------------------------
def ffprobe_info():
    r = _sh(["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries",
             "stream=codec_name,sample_rate,channels,bits_per_raw_sample,duration,duration_ts,nb_samples",
             "-of", "json", WAV])
    s = json.loads(r.stdout)["streams"][0]
    return dict(codec=s.get("codec_name"), sample_rate=int(s["sample_rate"]), channels=int(s["channels"]),
                bits=int(s.get("bits_per_raw_sample") or 0), duration_ts=int(s.get("duration_ts", 0)),
                duration_s=float(s["duration"]))


def ffmpeg_ebur128():
    r = _sh(["ffmpeg", "-hide_banner", "-nostats", "-i", WAV, "-af", "ebur128=peak=true", "-f", "null", "-"])
    txt = r.stderr
    tail = txt[txt.rfind("Summary:"):]
    I = re.search(r"I:\s+(-?\d+\.\d+) LUFS", tail)
    LRA = re.search(r"LRA:\s+(-?\d+\.\d+) LU", tail)
    TP = re.search(r"Peak:\s+(-?\d+\.\d+) dBFS", tail)
    return dict(integrated_lufs=float(I.group(1)), lra_lu=float(LRA.group(1)), true_peak_dbtp=float(TP.group(1)))


def pyloudnorm_lufs(x):
    try:
        import pyloudnorm as pyln
        return float(pyln.Meter(SR).integrated_loudness(x))
    except Exception as e:  # pragma: no cover
        return None


# ----------------------------------------------------------------------------------------------------
# onset alignment
# ----------------------------------------------------------------------------------------------------
_HP_ONSET = signal.butter(4, 1500.0, "highpass", fs=SR, output="sos")


def _env(h, a, b, win=12):
    seg = np.abs(h[a:b])
    from scipy import ndimage
    return ndimage.maximum_filter1d(seg, size=win, mode="nearest")


def measure_onset(h, s0, pre_ms=45.0, search_pre_ms=10.0, post_ms=22.0):
    """first sample (in a +-window around the cue) where the high-passed envelope rises above
    baseline + 25 % of the rise to the local peak. Returns (delta_ms, ratio_peak_over_baseline) or (None, ratio)."""
    a = max(0, s0 - int(pre_ms * 1e-3 * SR))
    b = min(len(h), s0 + int(post_ms * 1e-3 * SR) + 64)
    env = _env(h, a, b)
    i0 = s0 - a
    pre = env[: max(1, i0 - int(8e-3 * SR))]
    base = float(np.percentile(pre, 95)) if len(pre) else 0.0
    post = env[i0: i0 + int(post_ms * 1e-3 * SR)]
    peak = float(post.max()) if len(post) else 0.0
    ratio = peak / max(base, 1e-9)
    if peak <= 0 or ratio < 3.0:
        return None, ratio
    thr = base + 0.25 * (peak - base)
    lo = max(0, i0 - int(search_pre_ms * 1e-3 * SR))
    idx = np.flatnonzero(env[lo:] >= thr)
    if len(idx) == 0:
        return None, ratio
    return (lo + int(idx[0]) - i0) / SR * 1000.0, ratio


def measure_onset_flux(h, s0, pre_ms=4.0, post_ms=7.0):
    """for dense passages (a train of hits, a hit over a loud bed): the steepest rise of the 0.3 ms-smoothed
    squared high-passed signal inside +-(4, 7) ms around the cue. Accepted when the energy 1 ms after the rise is at
    least 4x the energy 1 ms before it. Returns (delta_ms, ratio) or (None, ratio)."""
    a = max(0, s0 - int(pre_ms * 1e-3 * SR))
    b = min(len(h), s0 + int(post_ms * 1e-3 * SR))
    k = int(0.0003 * SR) | 1
    w = np.hanning(k + 2)[1:-1]
    w /= w.sum()
    pad = k
    seg = h[max(0, a - pad): b + pad]
    e2 = np.convolve(seg ** 2, w, mode="same")
    off = a - max(0, a - pad)
    e = e2[off: off + (b - a)]
    d = np.diff(e)
    i = int(np.argmax(d))
    one = int(0.001 * SR)
    before = float(e[max(0, i - one): i + 1].min()) + 1e-14
    after = float(e[i: i + one + 1].max())
    ratio = after / before
    if ratio < 4.0:
        return None, ratio
    return (a + i - s0) / SR * 1000.0, ratio


def onset_report(master, stems, log):
    """per-cue onset alignment: measured on the master; if the cue is masked there (dense groove), on the stem of
    the bus that carries it (the stems sum to the master, so this is the same signal path)."""
    hm = signal.sosfilt(_HP_ONSET, master.mean(axis=1))
    hs = {}
    by_cue: dict = {}
    for ev in log:
        if ev.get("cue"):
            by_cue.setdefault(ev["cue"], []).append(ev)
    rows = []
    for c in sorted(cues.CUES.values(), key=lambda c: (c.frame, c.name)):
        evs = by_cue.get(c.name, [])
        row = dict(cue=c.name, frame=c.frame, kind=c.kind, cue_sample=c.sample, time_s=round(c.sample / SR, 4))
        if not evs:
            row.update(method="n/a (marker / derived)", pass_=None)
            rows.append(row)
            continue
        starts = sorted({ev["sample"] for ev in evs})
        row["render_start_sample"] = int(min(starts))
        row["render_offset_samples"] = int(min(starts) - c.sample)
        chk = [ev for ev in evs if ev.get("check")]
        if not chk:
            row.update(method="render (gradual / bed event: starts on the cue sample by construction)",
                       pass_=bool(row["render_offset_samples"] == 0))
            rows.append(row)
            continue
        d, ratio = measure_onset(hm, c.sample)
        method = "master, HP 1.5 kHz envelope"
        buses = sorted({ev["bus"] for ev in chk})

        def stem_h(b):
            if b not in hs:
                hs[b] = signal.sosfilt(_HP_ONSET, stems[b].mean(axis=1))
            return hs[b]
        if d is None and stems is not None:
            best = None
            for b in buses:
                dd, rr = measure_onset(stem_h(b), c.sample)
                if dd is not None and (best is None or rr > best[1]):
                    best = (dd, rr, b)
            if best:
                d, ratio, b = best
                method = f"stem '{b}', HP 1.5 kHz envelope"
        if d is None:                                           # dense passage: steepest-rise (flux) detector
            dd, rr = measure_onset_flux(hm, c.sample)
            if dd is not None:
                d, ratio, method = dd, rr, "master, flux (dense passage)"
            elif stems is not None:
                best = None
                for b in buses:
                    dd, rr = measure_onset_flux(stem_h(b), c.sample)
                    if dd is not None and (best is None or rr > best[1]):
                        best = (dd, rr, b)
                if best:
                    d, ratio, b = best
                    method = f"stem '{b}', flux (dense passage)"
        row["ratio"] = round(float(ratio), 1)
        if d is None:
            row.update(method="unmeasurable (masked); render start exact", measured_ms=None,
                       pass_=bool(row["render_offset_samples"] == 0))
        else:
            row.update(method=method, measured_ms=round(float(d), 3), measured_samples=int(round(d * SR / 1000.0)),
                       pass_=bool(abs(d) <= TOL_MS))
        rows.append(row)
    return rows


# ----------------------------------------------------------------------------------------------------
# silences, spectrum, stereo
# ----------------------------------------------------------------------------------------------------
def silence_report(x):
    a, b = f2s(cues.F("HARD_SILENCE")), f2s(cues.E("HARD_SILENCE"))
    lim = f2s(cues.F("HARD_SILENCE") + 1)
    seg = np.abs(x[a:b]).max()
    # cut speed: last sample above -60 dBFS(re 1.0) before / after f1376
    pre = np.abs(x[a - int(0.030 * SR):a]).max(axis=1)
    post = np.abs(x[a:a + int(0.010 * SR)]).max(axis=1)
    above = np.flatnonzero(np.abs(x[a - int(0.030 * SR):a + int(0.010 * SR)]).max(axis=1) > 10 ** (-60 / 20))
    last_audible = (above[-1] + 1 - int(0.030 * SR)) / SR * 1000.0 if len(above) else None
    # fade length: samples from 90 % of the pre-cut level to < -60 dBFS
    last = x[-cues.SPF:]
    rep = dict(
        hard_silence_frames=[cues.F("HARD_SILENCE"), cues.E("HARD_SILENCE")],
        peak_in_silence_dbfs=db(seg) if seg > 0 else -200.0,
        exact_zero_in_silence=bool(seg == 0.0),
        peak_after_f1377_in_silence_dbfs=db(np.abs(x[lim:b]).max()) if np.abs(x[lim:b]).max() > 0 else -200.0,
        last_sample_above_minus60dbfs_ms_vs_f1376=None if last_audible is None else round(last_audible, 3),
        cut_within_5ms=bool(last_audible is None or last_audible <= 5.0),
        last_frame_peak_dbfs=db(np.abs(last).max()) if np.abs(last).max() > 0 else -200.0,
        last_sample_value=float(np.abs(x[-1]).max()),
        samples_before_end_with_signal_above_minus80=int((N_TOTAL - 1 - np.flatnonzero(np.abs(x).max(axis=1) > 1e-4)[-1])),
    )
    # quiet moments: f72-127 (wind only)
    w = x[f2s(cues.F("TOP_LOCK") + 14): f2s(cues.F("LINE1"))]
    rep["wind_section_rms_dbfs"] = db(np.sqrt((w ** 2).mean()))
    return rep


def spectral_report(x):
    bands = [(20, 40), (40, 80), (80, 160), (160, 320), (320, 640), (640, 1280), (1280, 2500), (2500, 5000),
             (5000, 10000), (10000, 20000)]
    out = {}
    for lo, hi in bands:
        s = signal.butter(4, [lo, min(hi, 0.99 * SR / 2)], "bandpass", fs=SR, output="sos")
        y = signal.sosfilt(s, x, axis=0)
        out[f"{lo}-{hi}"] = round(db(np.sqrt((y ** 2).mean())), 1)
    m, s_ = 0.5 * (x[:, 0] + x[:, 1]), 0.5 * (x[:, 0] - x[:, 1])
    sos = signal.butter(4, 120.0, "lowpass", fs=SR, output="sos")
    ml, sl = signal.sosfilt(sos, m), signal.sosfilt(sos, s_)
    hf = signal.sosfilt(signal.butter(8, 18000.0, "highpass", fs=SR, output="sos"), x, axis=0)
    return dict(octave_band_rms_dbfs=out,
                side_over_mid_below_120hz_db=round(float(10 * np.log10((sl ** 2).sum() / ((ml ** 2).sum() + 1e-18) + 1e-18)), 1),
                side_over_mid_total_db=round(float(10 * np.log10((s_ ** 2).sum() / ((m ** 2).sum() + 1e-18))), 1),
                lr_correlation=round(float(np.corrcoef(x[:, 0], x[:, 1])[0, 1]), 3),
                energy_above_18khz_dbfs=round(db(np.sqrt((hf ** 2).mean())), 1),
                dc_offset=[float(x[:, 0].mean()), float(x[:, 1].mean())],
                mono_sum_lufs=round(float(dsp.integrated_lufs(np.stack([m, m], axis=1))), 2))


# ----------------------------------------------------------------------------------------------------
# clicks, reverb, per-act loudness
# ----------------------------------------------------------------------------------------------------
def click_scan(x, log, top=8):
    """Unintended-discontinuity scan: |2nd difference| of the 1.5-kHz-high-passed signal against its local (+-10 ms)
    mean |2nd difference|. Noise sits around 3-6; a real click is > 15. Intentional transients (every logged event
    start, +-4 ms) and the hard-cut edges are excluded."""
    h = signal.sosfilt(_HP_ONSET, x, axis=0)
    d2 = np.abs(np.diff(h, 2, axis=0)).max(axis=1)
    w = int(0.020 * SR)
    ref = np.convolve(d2, np.ones(w) / w, mode="same") + 1e-7
    r = d2 / ref
    mask = np.zeros(len(r), bool)
    post = int(0.012 * SR)
    for ev in log:
        s0 = ev["sample"]
        mask[max(0, s0 - 3): s0 + post] = True
        e = ev.get("end")
        if e is not None and e < N_TOTAL:
            mask[max(0, e - 6): e + 6] = True                 # truncated events end with a fade; not a click source
            if ev.get("kind") == "tick":                      # ping clouds are many intentional transients
                mask[s0: e] = True
    for a_f, b_f, _ in cues.hard_silences():
        a, b = f2s(a_f), f2s(b_f)
        mask[a - int(0.006 * SR): a + 8] = True
        mask[b - 8: b + 8] = True
    r2 = np.where(mask, 0.0, r)
    idx = np.argsort(r2)[-top:][::-1]
    return [dict(frame=round((int(i) + 1) / cues.SPF, 2), ratio=round(float(r2[i]), 2)) for i in idx]


def reverb_report():
    """measured T60 (T30 extrapolated), pre-delay and decorrelation of the three halls"""
    import master as M
    out = {}
    for name, spec in M.HALL_SPECS.items():
        ir = dsp.make_hall_ir(**spec)
        h = ir[:, 0] + ir[:, 2]                         # mono input -> left output
        e = np.cumsum((h ** 2)[::-1])[::-1]
        e = 10 * np.log10(e / e[0] + 1e-18)
        i5, i35 = int(np.argmax(e < -5)), int(np.argmax(e < -35))
        t60 = (i35 - i5) / SR * 2.0
        hl, hr = ir[:, 0] + ir[:, 2], ir[:, 1] + ir[:, 3]
        env = np.abs(hl)
        first = int(np.argmax(env > 0.02 * env.max()))
        out[name] = dict(t60_s=round(t60, 2), nominal_mid_t60_s=spec["t60"], predelay_ms=round(spec["predelay"] * 1000, 1),
                         first_energy_ms=round(first / SR * 1000, 1),
                         lr_decorrelation_corr=round(float(np.corrcoef(hl, hr)[0, 1]), 3), ir_length_s=round(len(ir) / SR, 2))
    return out


def hit_hierarchy(out):
    """peak (first 50 ms) and K-weighted energy (0.4 s from the hit) of the major hits: the film's hits should grow."""
    names = ["CROWN_IMPACT", "TOP_LOCK", "LINE1", "SELL", "DROP", "CITY_DUBAI", "CITY_TOKYO", "GRID_2", "GRID_64", "UNISON",
             "DROP_WORLD", "CLIMAX", "A_DOMINANT", "D_TONIC"]
    rows = []
    for n in names:
        s0 = cues.CUES[n].sample
        seg = out[s0: s0 + int(0.4 * SR)]
        z = dsp.k_weight(seg)
        rows.append(dict(cue=n, frame=cues.CUES[n].frame, peak_50ms_dbfs=round(db(np.abs(out[s0: s0 + int(0.05 * SR)]).max()), 1),
                         energy_0p4s_lufs=round(float(-0.691 + 10 * np.log10((z ** 2).mean(axis=0).sum() + 1e-15)), 1)))
    return rows


def act_loudness(out, stems):
    acts = cues.ACTS + [(cues.TOTAL_FRAMES, "end")]
    rows = []

    def kw(x):
        z = dsp.k_weight(x)
        return round(float(-0.691 + 10 * np.log10((z ** 2).mean(axis=0).sum() + 1e-15)), 1)
    for i in range(len(acts) - 1):
        a, b = f2s(acts[i][0]), f2s(acts[i + 1][0])
        row = dict(act=acts[i][1], frames=[acts[i][0], acts[i + 1][0] - 1], mix_lufs_ungated=kw(out[a:b]),
                   peak_dbfs=round(db(np.abs(out[a:b]).max()), 1))
        if stems:
            row["stems_lufs"] = {k: kw(v[a:b]) for k, v in stems.items()}
        rows.append(row)
    return rows


# ----------------------------------------------------------------------------------------------------
# images
# ----------------------------------------------------------------------------------------------------
ACT_COLORS = ["#ffffff"]


def _markers():
    """(frame, label, strong) for the plots"""
    out = []
    for f, n in cues.ACTS:
        out.append((f, n, True))
    for name in ["CROWN_IMPACT", "TOP_LOCK", "LINE1", "LINE2", "SELL", "DROP", "CITY_DUBAI", "CITY_LONDON", "CITY_NEWYORK",
                 "CITY_SINGAPORE", "CITY_TOKYO", "GRID_2", "GRID_64", "UNISON", "ROLL", "DROP_WORLD", "STAMP_01", "STAMP_12",
                 "STORM_01", "CLIMAX", "SURGE", "HARD_SILENCE", "A_DOMINANT", "D_TONIC", "SENTENCE", "REBUS_CLICK", "END_SWELL",
                 "DESCRIPTOR"]:
        out.append((cues.F(name), name, False))
    return out


def plots(x, spec_path, wave_path):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    m = x.mean(axis=1)
    nper, hop = 4096, 1024
    f, t, Sxx = signal.spectrogram(m, SR, window="hann", nperseg=nper, noverlap=nper - hop, scaling="spectrum", mode="magnitude")
    Sd = 20 * np.log10(Sxx + 1e-9)
    top = float(np.percentile(Sd, 99.9))
    fig, ax = plt.subplots(figsize=(30, 9), dpi=100)
    keep = f >= 20
    im = ax.pcolormesh(t * 30.0, f[keep], Sd[keep], shading="auto", cmap="magma", vmin=top - 95, vmax=top)
    ax.set_yscale("log")
    ax.set_ylim(20, 20000)
    ax.set_xlim(0, 1800)
    ax.set_yticks([30, 55, 110, 220, 440, 880, 1760, 3520, 7040, 14080])
    ax.set_yticklabels(["30", "A1 55", "A2 110", "A3 220", "A4 440", "A5 880", "1.76k", "3.5k", "7k", "14k"], color="white")
    ax.set_xlabel("frame (30 fps)", color="white")
    ax.set_title("DOMINANT - spectrogram (mono sum), cue frames marked; log-frequency axis in A octaves", color="white")
    for fr, lab, strong in _markers():
        ax.axvline(fr, color="#ffffff" if strong else "#7fe3ff", lw=1.2 if strong else 0.5, alpha=0.9 if strong else 0.6)
        ax.text(fr + 2, 17500 if strong else 11000 * (0.8 if ((sum(map(ord, lab)) % 2)) else 1.0), lab, rotation=90, va="top",
                fontsize=7 if strong else 5.5, color="white" if strong else "#bfeeff")
    fig.patch.set_facecolor("#0b0b10")
    ax.set_facecolor("#0b0b10")
    ax.tick_params(colors="white")
    fig.colorbar(im, ax=ax, label="dB", pad=0.005)
    fig.tight_layout()
    fig.savefig(spec_path)
    plt.close(fig)

    # waveform + short-term loudness
    fig, ax = plt.subplots(2, 1, figsize=(30, 8), dpi=100, gridspec_kw={"height_ratios": [3, 1]}, sharex=True)
    step = 64
    n = (len(x) // step) * step
    for ch, col in ((0, "#4aa8ff"), (1, "#ff6b5f")):
        blk = x[:n, ch].reshape(-1, step)
        mx, mn = blk.max(axis=1), blk.min(axis=1)
        tt = (np.arange(len(mx)) * step) / SR * 30.0
        ax[0].fill_between(tt, mn, mx, color=col, alpha=0.55, lw=0)
    ax[0].set_ylim(-1.0, 1.0)
    ax[0].set_ylabel("amplitude")
    ax[0].set_title("DOMINANT - waveform (L blue / R red), cue frames marked", color="black")
    mom, tm = dsp.momentary_series(x, 0.4, 0.1)
    ax[1].plot(tm * 30.0, mom, color="#222222", lw=0.8)
    ax[1].set_ylabel("momentary LUFS")
    ax[1].set_ylim(-60, 0)
    ax[1].axhline(-14.0, color="#d01c1c", lw=0.8, ls="--")
    for fr, lab, strong in _markers():
        for a_ in ax:
            a_.axvline(fr, color="#222222" if strong else "#1f78b4", lw=1.0 if strong else 0.4, alpha=0.8 if strong else 0.55)
        ax[0].text(fr + 2, 0.97 - (0.14 if (not strong and (sum(map(ord, lab)) % 2)) else 0.0), lab, rotation=90, va="top", fontsize=7 if strong else 5.5)
    ax[1].set_xlim(0, 1800)
    ax[1].set_xlabel("frame (30 fps)")
    fig.tight_layout()
    fig.savefig(wave_path)
    plt.close(fig)


# ----------------------------------------------------------------------------------------------------
def run(out=None, stems=None, log=None, info=None, make_plots=True):
    t0 = time.time()
    if out is None:
        out, sr = sf.read(WAV, dtype="float64", always_2d=True)
        assert sr == SR
    else:                       # verify exactly what was written (24-bit rounding included)
        out, sr = sf.read(WAV, dtype="float64", always_2d=True)
    if stems is None and os.path.isdir(STEMS_DIR):
        stems = {}
        for k in ("impacts", "drums", "bass", "music", "fx", "ambience", "reverb"):
            p = os.path.join(STEMS_DIR, f"{k}.wav")
            if os.path.exists(p):
                stems[k], _ = sf.read(p, dtype="float64", always_2d=True)
    if log is None:
        lp = os.path.join(OUT, "events.json")
        log = json.load(open(lp))["events"] if os.path.exists(lp) else []

    rep = {"file": "advrtizx-intro/audio/out/score.wav"}
    fp = ffprobe_info()
    rep["format"] = dict(fp, samples=int(len(out)), expected_samples=N_TOTAL, exact_sample_count=bool(len(out) == N_TOTAL),
                         duration_s=round(len(out) / SR, 6))
    ff = ffmpeg_ebur128()
    own = float(dsp.integrated_lufs(out))
    tp_own = float(20 * np.log10(dsp.true_peak_linear(out)))
    rep["loudness"] = dict(integrated_lufs_own_bs1770=round(own, 3), integrated_lufs_pyloudnorm=pyloudnorm_lufs(out),
                           integrated_lufs_ffmpeg_ebur128=ff["integrated_lufs"], lra_lu_ffmpeg=ff["lra_lu"],
                           lra_lu_own=round(dsp.loudness_range(out), 2), target_lufs=-14.0, tolerance_lu=0.5,
                           pass_=bool(abs(own - (-14.0)) <= 0.5 and abs(ff["integrated_lufs"] + 14.0) <= 0.5))
    rep["true_peak"] = dict(own_4x_dbtp=round(tp_own, 3), ffmpeg_ebur128_dbtp=ff["true_peak_dbtp"],
                            sample_peak_dbfs=round(db(np.abs(out).max()), 3), limit_dbtp=-1.0,
                            pass_=bool(max(tp_own, ff["true_peak_dbtp"]) <= -1.0),
                            clipped_samples_ge_0dbfs=int((np.abs(out) >= 0.99999).sum()))
    rep["silences"] = silence_report(out)
    rep["spectral"] = spectral_report(out)
    rep["reverbs"] = reverb_report()
    rep["act_loudness"] = act_loudness(out, stems)
    rep["hit_hierarchy"] = hit_hierarchy(out)
    rep["click_scan_worst"] = click_scan(out, log)
    if stems:
        tot = sum(stems.values())
        err = float(np.abs(tot - out).max())
        rep["stems_sum"] = dict(stems=sorted(stems), max_abs_error=err, max_abs_error_dbfs=round(db(err), 1))
    ons = onset_report(out, stems, log)
    meas = [r for r in ons if "measured_ms" in r and r["measured_ms"] is not None]
    allpass = [r for r in ons if r.get("pass_") is not None]
    rep["onset_alignment"] = dict(
        tolerance_ms=TOL_MS, cues_total=len(ons), cues_measured_on_audio=len(meas),
        cues_pass=int(sum(1 for r in allpass if r["pass_"])), cues_checked=len(allpass),
        worst_measured_ms=max((abs(r["measured_ms"]) for r in meas), default=None),
        mean_abs_measured_ms=round(float(np.mean([abs(r["measured_ms"]) for r in meas])), 3) if meas else None,
        cues=ons)
    if info:
        rep["master_chain"] = info
    rep["build_notes"] = dict(sample_rate=SR, fps=cues.FPS, bpm=cues.BPM, rule="sample = round(frame * 1600)",
                              seed=dsp.SEED, numba=dsp.HAVE_NUMBA)
    json.dump(rep, open(os.path.join(OUT, "report.json"), "w"), indent=1)
    if make_plots:
        plots(out, os.path.join(OUT, "spectrogram.png"), os.path.join(OUT, "waveform.png"))
    # console summary
    L, T = rep["loudness"], rep["true_peak"]
    print(f"verify ({time.time() - t0:.1f}s): {rep['format']['samples']} samples, {fp['sample_rate']} Hz, {fp['channels']} ch, "
          f"{fp['bits']} bit")
    print(f"  loudness: own {L['integrated_lufs_own_bs1770']} | pyloudnorm {L['integrated_lufs_pyloudnorm']:.2f} | ffmpeg "
          f"{L['integrated_lufs_ffmpeg_ebur128']} LUFS   LRA {L['lra_lu_ffmpeg']} LU")
    print(f"  true peak: own {T['own_4x_dbtp']} | ffmpeg {T['ffmpeg_ebur128_dbtp']} dBTP; sample peak {T['sample_peak_dbfs']} dBFS")
    s = rep["silences"]
    print(f"  hard silence: exact zero {s['exact_zero_in_silence']}, peak {s['peak_in_silence_dbfs']} dBFS, cut<=5ms {s['cut_within_5ms']}; "
          f"last frame peak {s['last_frame_peak_dbfs']} dBFS")
    o = rep["onset_alignment"]
    print(f"  onset alignment: {o['cues_pass']}/{o['cues_checked']} pass (+-{TOL_MS} ms); measured on audio {o['cues_measured_on_audio']}, "
          f"worst {o['worst_measured_ms']} ms, mean |d| {o['mean_abs_measured_ms']} ms")
    if "stems_sum" in rep:
        print(f"  stems sum vs master: max error {rep['stems_sum']['max_abs_error_dbfs']} dBFS")
    return rep


if __name__ == "__main__":
    run()
