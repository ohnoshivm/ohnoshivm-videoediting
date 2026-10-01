#!/usr/bin/env python3
"""verify.py - independent checks of public/audio/score.wav (ffprobe, ffmpeg ebur128 / loudnorm, PNGs,
DC offset, clipping, silence gaps, per-shot levels, sample-accurate onsets, stems-sum)."""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys

import numpy as np
import soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import hitsheet as hs  # noqa: E402
from dsp import FPS, N_TOTAL, SR, f2s, integrated_lufs, k_weight  # noqa: E402


def ungated_lufs(x):
    z = k_weight(x)
    return -0.691 + 10 * np.log10(max((z ** 2).mean(axis=0).sum(), 1e-15))

ROOT = os.path.dirname(HERE)
WAV = os.path.join(ROOT, "public", "audio", "score.wav")
STEMS = os.path.join(ROOT, "public", "audio", "stems")


def sh(cmd):
    return subprocess.run(cmd, capture_output=True, text=True)


def ffprobe():
    r = sh(["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries",
            "stream=codec_name,sample_rate,channels,bits_per_raw_sample,duration,duration_ts,nb_samples:format=duration,size",
            "-of", "json", WAV])
    j = json.loads(r.stdout)
    s = j["streams"][0]
    print("ffprobe:", {k: s.get(k) for k in ("codec_name", "sample_rate", "channels", "bits_per_raw_sample",
                                             "duration", "duration_ts")}, "size", j["format"].get("size"))
    return s


def ebur128():
    r = sh(["ffmpeg", "-hide_banner", "-nostats", "-i", WAV, "-af", "ebur128=peak=true", "-f", "null", "-"])
    txt = r.stderr
    tail = txt[txt.rfind("Summary:"):]
    I = re.search(r"I:\s+(-?\d+\.\d+) LUFS", tail)
    LRA = re.search(r"LRA:\s+(-?\d+\.\d+) LU", tail)
    TP = re.search(r"Peak:\s+(-?\d+\.\d+) dBFS", tail)
    print(f"ffmpeg ebur128: I = {I.group(1)} LUFS, LRA = {LRA.group(1)} LU, true peak = {TP.group(1)} dBTP")
    return float(I.group(1)), float(LRA.group(1)), float(TP.group(1))


def loudnorm():
    r = sh(["ffmpeg", "-hide_banner", "-nostats", "-i", WAV, "-af", "loudnorm=print_format=json", "-f", "null", "-"])
    m = re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", r.stderr, re.S)
    j = json.loads(m.group(0))
    print("ffmpeg loudnorm:", {k: j[k] for k in ("input_i", "input_tp", "input_lra", "input_thresh")})
    return j


def pngs():
    wave = os.path.join(HERE, "waveform.png")
    spec = os.path.join(HERE, "spectrogram.png")
    sh(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", WAV, "-filter_complex",
        "showwavespic=s=1800x360:split_channels=1:colors=#E80101|#222222", "-frames:v", "1", wave])
    r = sh(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", WAV, "-lavfi",
            "showspectrumpic=s=1800x720:legend=1:scale=log:fscale=log:drange=96:limit=-6", spec])
    if r.returncode != 0:
        sh(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", WAV, "-lavfi",
            "showspectrumpic=s=1800x720:legend=1:scale=log", spec])
    print("png:", wave, spec)


def analysis():
    x, sr = sf.read(WAV, dtype="float64", always_2d=True)
    assert sr == SR
    print(f"samples: {len(x)} (expect {N_TOTAL}) -> {'OK' if len(x) == N_TOTAL else 'MISMATCH'}; channels {x.shape[1]}")
    pk = np.abs(x).max()
    print(f"sample peak {20 * np.log10(pk):.2f} dBFS; clipped samples (|x|>=0.9999): {(np.abs(x) >= 0.9999).sum()}")
    dc = x.mean(axis=0)
    print(f"DC offset L/R: {dc[0]:+.2e} / {dc[1]:+.2e} ({20 * np.log10(np.abs(dc).max() + 1e-12):.1f} dBFS)")
    print(f"own K-weighted integrated loudness: {integrated_lufs(x):.2f} LUFS")
    # silence / gap scan: 10 ms RMS windows
    w = int(0.010 * SR)
    n = (len(x) // w) * w
    r = np.sqrt((x[:n] ** 2).mean(axis=1).reshape(-1, w).mean(axis=1))
    rdb = 20 * np.log10(np.maximum(r, 1e-9))
    body = rdb[: int((59.8) * 100)]                      # ignore the final fade-out
    i = int(np.argmin(body))
    low = np.flatnonzero(body < -75.0)
    print(f"quietest 10 ms window before the end fade: {body[i]:.1f} dBFS at {i / 100:.2f} s (f{i / 100 * FPS:.0f}); "
          f"windows below -75 dBFS: {len(low)}")
    # width / mono-compat sanity
    m, s = (x[:, 0] + x[:, 1]) / 2, (x[:, 0] - x[:, 1]) / 2
    print(f"side/mid energy: {10 * np.log10((s ** 2).sum() / (m ** 2).sum()):.1f} dB; "
          f"corr L/R {np.corrcoef(x[:, 0], x[:, 1])[0, 1]:.2f}")
    # per-shot overview
    print("per-shot level (peak dBFS | RMS dBFS | ungated LUFS):")
    for k, (sid, f0, name) in enumerate(hs.SHOTS):
        f1 = hs.SHOTS[k + 1][1] if k + 1 < len(hs.SHOTS) else 1800
        seg = x[f2s(f0):f2s(f1)]
        l = ungated_lufs(seg)
        print(f"  {sid} f{f0:>4}-{f1 - 1:<4} {name:<26} peak {20 * np.log10(np.abs(seg).max() + 1e-12):6.1f} | "
              f"rms {20 * np.log10(np.sqrt((seg ** 2).mean()) + 1e-12):6.1f} | {l:6.1f}")
    return x


def onsets(stems):
    """Measured onset of isolated hits in the stems vs the hit-sheet sample: first sample above 10% of the local
    peak, relative to round(frame/30*48000). Positive = samples after the hit sample (the tick's own rise time)."""
    print("onset check on stems (first sample over 10% of local peak, minus the hit-sheet sample):")
    tests = [(165, "sfx", "KNOCK 160 + TICK 660"), (303, "sfx", "TICK 2000 after silence"), (458, "sfx", "SET after silence"),
             (900, "sfx", "KNOCK 70"), (1092, "music", "BELL 440 after silence"), (1285, "sfx", "KNOCK 70"),
             (1440, "logo", "SUB big + BELL chord"), (1680, "logo", "BELL 330 (sonic logo)"), (1710, "sfx", "TICK 2200"),
             (1192.5, "music", "HAT half-frame (HP 6k)"), (96, "sfx", "TICK 880")]
    from scipy import signal as _sg
    hp6 = _sg.butter(4, 6000.0, "highpass", fs=SR, output="sos")
    for f, stem, name in tests:
        src = stems[stem]
        if "HP 6k" in name:
            src = _sg.sosfilt(hp6, src, axis=0)
        x = np.abs(src).max(axis=1)
        s0 = f2s(f)
        post = x[s0:s0 + 2400]
        pre = x[s0 - 400:s0 - 8].max()
        thr = 0.10 * post.max()
        j = int(np.argmax(post >= thr))
        print(f"  f{f:<7} {stem:<5} {name:<26} onset +{j:>3} samples ({j / SR * 1000:5.2f} ms); level just before "
              f"{20 * np.log10(pre + 1e-12):6.1f} dBFS, hit {20 * np.log10(post.max() + 1e-12):6.1f} dBFS")


def clicks(x):
    """Click scan: |second difference| against a 5 ms local RMS of the signal; report worst outliers that are NOT
    explained by an intentional transient (hit-sheet sample +/- 3 ms) and the gate edges."""
    from scipy import signal as _sg
    x = _sg.sosfilt(_sg.butter(4, 2500.0, "lowpass", fs=SR, output="sos"), x, axis=0)   # a click is broadband
    d2 = np.abs(np.diff(x, 2, axis=0)).max(axis=1)
    w = int(0.005 * SR)
    env = np.sqrt(np.convolve((x ** 2).mean(axis=1), np.ones(w) / w, mode="same")) + 1e-6
    r = d2 / env[1:-1]
    import hitsheet
    hits = hitsheet.build()
    mask = np.zeros(len(r), bool)
    for h in hits:
        if h.inst == "ROOM":
            continue
        s0 = h.sample
        mask[max(0, s0 - 2): s0 + int(0.003 * SR)] = True
    for g0, g1, *_ in hitsheet.GATES:
        mask[f2s(g0) - int(GATE_FADE * SR) - 4: f2s(g0) + 4] = True
        mask[f2s(g1) - 4: f2s(g1) + 8] = True
    r2 = np.where(mask, 0.0, r)
    idx = np.argsort(r2)[-5:][::-1]
    print("click scan (worst unexplained |d2|/local rms, ratio; typical audio < 1.5):",
          [(f"f{(i + 1) / SPF_:.2f}", round(float(r2[i]), 2)) for i in idx])


GATE_FADE = 0.004
SPF_ = SR // FPS


def spectrum_checks(x):
    from scipy import signal
    sos = signal.butter(8, 18000.0, "highpass", fs=SR, output="sos")
    hf = signal.sosfilt(sos, x, axis=0)
    print(f"energy above 18 kHz: {10 * np.log10((hf ** 2).mean() + 1e-18):.1f} dBFS RMS (alias/foldback check)")
    sos = signal.butter(4, 120.0, "lowpass", fs=SR, output="sos")
    low = signal.sosfilt(sos, x, axis=0)
    side = (low[:, 0] - low[:, 1]) / 2
    mid = (low[:, 0] + low[:, 1]) / 2
    print(f"bass mono: side/mid below 120 Hz = {10 * np.log10((side ** 2).sum() / ((mid ** 2).sum() + 1e-18) + 1e-18):.1f} dB")
    mono = x.mean(axis=1, keepdims=True).repeat(2, axis=1)
    print(f"mono-compat: mono-sum loudness {integrated_lufs(mono):.2f} LUFS vs stereo {integrated_lufs(x):.2f} LUFS")
    bands = [(20, 60), (60, 120), (120, 250), (250, 500), (500, 1000), (1000, 2000), (2000, 4000), (4000, 8000), (8000, 20000)]
    row = []
    for lo, hi in bands:
        s = signal.butter(4, [lo, hi], "bandpass", fs=SR, output="sos")
        y = signal.sosfilt(s, x, axis=0)
        row.append(f"{lo}-{hi}: {10 * np.log10((y ** 2).mean() + 1e-15):.1f}")
    print("octave-band RMS (dBFS):", " | ".join(row))


def load_stems():
    out = {}
    for k in ("music", "sfx", "logo", "room"):
        s, _ = sf.read(os.path.join(STEMS, f"{k}.wav"), dtype="float64", always_2d=True)
        assert len(s) == N_TOTAL
        out[k] = s
    return out


def gates_check(stems):
    print("gates (exact digital silence in music/sfx/logo stems; ROOM ducked, not cut):")
    import hitsheet
    for g0, g1, label, duck in hitsheet.GATES:
        s0, s1 = f2s(g0), f2s(g1)
        peak = max(np.abs(stems[k][s0:s1]).max() for k in ("music", "sfx", "logo"))
        room = np.abs(stems["room"][s0:s1]).max()
        before = np.abs(stems["room"][s0 - 4800:s0 - 960]).max()
        print(f"  f{g0}-{g1}: non-room peak {20 * np.log10(peak + 1e-12):7.1f} dBFS, ROOM {20 * np.log10(room + 1e-12):6.1f} dBFS "
              f"(before: {20 * np.log10(before + 1e-12):6.1f}) {label}")


def stems_sum(x, stems):
    tot = np.zeros_like(x)
    for k, s in stems.items():
        tot += s
        print(f"  stem {k:<6} peak {20 * np.log10(np.abs(s).max() + 1e-12):6.1f} dBFS  RMS {20 * np.log10(np.sqrt((s ** 2).mean()) + 1e-12):6.1f} dBFS")
    d = np.abs(tot - x).max()
    print(f"stems sum vs master: max abs difference {d:.2e} ({20 * np.log10(d + 1e-12):.1f} dBFS; 24-bit rounding ~ -138)")


def run():
    print("=== verify ===")
    ffprobe()
    ebur128()
    loudnorm()
    pngs()
    x = analysis()
    spectrum_checks(x)
    clicks(x)
    stems = load_stems()
    onsets(stems)
    gates_check(stems)
    stems_sum(x, stems)


if __name__ == "__main__":
    run()
