"""hitsheet.py - the frame-keyed hit sheet for "TRUE ANGLE" (mirrors TREATMENT 5.3).

Every row is `H(frame, instrument, note, **params)`. Frames are 30 fps; the renderer places each
hit at sample round(frame/30*48000). Fractional frames are allowed (e.g. HAT at 1192.5).
Rows whose picture event spans several frames are expanded by small generator loops below
(knots, beats, flaps, POLY grids, scroll-rule crossings) so that `build()` returns the literal list
of every hit, which is also what cue_sheet.md prints.

Instrument ids map 1:1 to the recipes of TREATMENT 5.2 (see synths.py):
  I1 PEN  I2 TICK  I3 KNOCK  I4 TWANG  I5 SUB  I6 HINGE  I7 SET  I8 FLAP  I9 PAD  I10 POLY
  I11 RISER  I12 BELL  I13 MARIMBA  I14 HAT  I15 CLICK  I16 KEYS  I17 SLAB  I18 WIPE  I19 ROOM
  + WALLS (the "walls thicken" crescendo of S11, which has no I-number in 5.2).
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from dsp import EASE, f2s, rng_for

BEAT, BAR = 15, 60

# act structure (TREATMENT 1 / 5.1)
ACT_STARTS = [0, 330, 900, 1350]
ACT_T60 = [0.35, 0.9, 1.5, 2.6]
ACT_NAMES = ["I MEASURE", "II MEANING", "III THE DOOR", "IV THE MARK"]
XFADE_FRAMES = 15          # sends crossfade over one beat at f330 / f900 / f1350

# hard-silence moments: (start_frame, end_frame, label, duck_room)
GATES = [
    (300, 303, "freeze: hard silence (ROOM ducked)", True),
    (450, 458, "cut to red: PAD+pulse cut, 8f silence", True),
    (870, 876, "dead stop: silence", True),
    (1086, 1092, "scroll brake: hard silence", True),
    (1349, 1350, "push into white: cut dead", False),
]

SHOTS = [("S01", 0, "Twelve Knots"), ("S02", 120, "The Compass Proof"), ("S03", 240, "Spec Hatch"),
         ("S04", 330, "The Fold"), ("S05", 450, "Nobody Buys Square Feet"), ("S06", 540, "Sun Study"),
         ("S07", 720, "Which Buyer"), ("S08", 900, "The Door Is 9:16"), ("S09", 1020, "Thumb-Stop"),
         ("S10", 1170, "The Stair"), ("S11", 1350, "The Plan Was the Mark"),
         ("S12", 1500, "The True Angle"), ("S13", 1650, "Red Angle / End Card")]


@dataclass
class Hit:
    frame: float
    inst: str
    p: dict = field(default_factory=dict)
    note: str = ""
    stem: str = ""          # '' -> default routing by instrument; 'logo' forces the logo stem
    idx: int = 0

    @property
    def sample(self) -> int:
        return f2s(self.frame)


HITS: list[Hit] = []


def H(frame, inst, note="", stem="", **p):
    HITS.append(Hit(float(frame), inst, p, note, stem))


def pan_x(x):
    """Pen/label pan from screen x (TREATMENT I1): 0.6*(2x/1920 - 1)."""
    return 0.6 * (2.0 * x / 1920.0 - 1.0)


# --------------------------------------------------------------------------------------
# S07 label tables (TREATMENT 4, S07) and flap helpers
# --------------------------------------------------------------------------------------
LABEL_ORDER = ["BEDROOM", "KITCHEN", "LIVING", "ENTRY", "BATH"]
LABEL_PAN = {"BEDROOM": pan_x(1577), "KITCHEN": pan_x(1175), "LIVING": pan_x(854),
             "ENTRY": pan_x(1271), "BATH": pan_x(1359)}
# treatment S07 table, column order: BEDROOM | KITCHEN | LIVING | ENTRY | BATH
_COLS = ["BEDROOM", "KITCHEN", "LIVING", "ENTRY", "BATH"]
BUYER_SETS = {
    720: dict(zip(_COLS, ["Ours", "Learning to cook", "Friends over", "Our name here", "Ten quiet minutes"])),
    740: dict(zip(_COLS, ["Nursery, for now", "Lunchboxes", "Floor picnics", "Small shoes", "Bath time"])),
    760: dict(zip(_COLS, ["Studio", "Lunch at one", "Calls at nine", "Commute: 0 min", "Reset"])),
    780: dict(zip(_COLS, ["Late breakfasts", "Slow Sundays", "Grandkids' weekend", "Coats off", "Long soak"])),
    800: dict(zip(_COLS, ["Rental-ready", "Low upkeep", "Tenant-proof", "Keyless entry", "Easy let"])),
}
POOL = ["Dog's corner", "Piano wall", "Night shifts", "First Diwali here", "Cricket on TV", "Prayer corner",
        "Plants", "Two desks", "Quiet street", "Near school", "Walk to metro", "Room for Ma"]


def flap_run(frame0, nchars, spacing, pan, note, db=-30.0, until=None):
    """One FLAP per character flip, char index drives the band (idx mod 4).
    `until`: flips at or after this frame never happen (the picture cuts at the dead stop)."""
    for i in range(nchars):
        f = frame0 + spacing * i
        if until is not None and f >= until:
            break
        H(f, "FLAP", note, idx=i, pan=pan, db=db)


def grid_times(start, end, period):
    """Times on `period`-frame grid anchored at bar starts (multiples of 60f), in [start, end)."""
    out = []
    bar0 = int(start // BAR) * BAR
    t_bar = bar0
    while t_bar < end:
        k = 0
        while k * period < BAR - 1e-9:
            t = t_bar + k * period
            if start - 1e-9 <= t < end - 1e-9:
                out.append(t)
            k += 1
        t_bar += BAR
    return out


# --------------------------------------------------------------------------------------
def build() -> list[Hit]:
    HITS.clear()
    draft = EASE["DRAFT"]

    # ================================ ACT I - MEASURE (0-329) ================================
    # ---- S01 Twelve Knots ----
    H(0, "ROOM", "S01 white paper: ROOM only (the paper's air, constant, never cut)", stem="room", db=-48)
    H(6, "PEN", "S01 rope draws on (DRAFT 30f), pan follows pen tip", dur=30, ease="DRAFT", x0=240, x1=1680)
    for i in range(13):                                    # knot i at f = 6 + 30*DRAFT^-1(i/12)
        f = 6 + 30 * float(draft.inverse(i / 12.0))
        H(f, "TICK", f"S01 rope knot {i} as the pen passes", f=2200, pan=pan_x(240 + 120 * i))
    H(45, "KNOCK", "S01 peg V0 drops", f=180)
    H(60, "KNOCK", "S01 peg V3 drops", f=200)
    H(75, "KNOCK", "S01 peg V7 drops", f=220)
    H(45, "TWANG", "S01 rope pulled taut: sine glide 55->110 Hz under 45-75 (TAUT)", kind="glide", dur=30,
      ease="TAUT", db=-26)
    H(75, "TWANG", "S01 rope twang pluck (Karplus-Strong 110 Hz)", kind="pluck", db=-16)
    H(78, "BELL", "S01 numeral `3`: logo chord, 330 Hz (1st statement, arpeggiated)", stem="logo", f=330)
    H(83, "BELL", "S01 numeral `4`: logo chord, 440 Hz", stem="logo", f=440)
    H(88, "BELL", "S01 numeral `5`: logo chord, 550 Hz", stem="logo", f=550)
    H(96, "TICK", "S01 `90°` sets in the right-angle corner", f=880)

    # ---- S02 The Compass Proof ----
    H(135, "HINGE", "S02 compass arm swings down about V0 (HINGE 30f) + sine glide 165->220 Hz (harmonic 3->4)",
      dur=30, ease="HINGE", fc0=400, fc1=3000, pan0=0.0, pan1=0.35, db=-18, glide=(165, 220), glide_db=-30)
    H(165, "KNOCK", "S02 tip lands at (1260,780)", f=160)
    H(165, "TICK", "S02 16px cross snaps at the tip", f=660)
    H(165, "PEN", "S02 vertical construction line (DRAFT 12f)", dur=12, ease="DRAFT", x0=1260, x1=1260)
    H(177, "PEN", "S02 top edge V7->(1262,300) (DRAFT 8f)", dur=8, ease="DRAFT", x0=1020, x1=1262)
    H(185, "PEN", "S02 inking: the true A outline (DRAFT 15f)", dur=15, ease="DRAFT",
      path=[(0.0, 664), (0.33, 1020), (0.5, 1262), (0.75, 1262), (1.0, 664)])
    H(200, "TICK", "S02 base dimension string 28'-2\"", f=1320, pan=pan_x(960))
    H(212, "TICK", "S02 side dimension string 22'-5\"", f=1320, pan=pan_x(1286))

    # pulse begins at 180: SUB soft on every beat (f240 is SUB normal, f300 falls in the freeze)
    for b in range(180, 436, BEAT):
        if b == 240 or 300 <= b < 303:
            continue
        H(b, "SUB", "pulse: SUB soft on the beat (continues through S04, cut at f450)", db=-24)

    # ---- S03 Spec Hatch ----
    H(240, "SUB", "S03 hatch floods: SUB normal (downbeat)", db=-10)
    for k in range(16):
        H(240 + 2 * k, "FLAP", f"S03 hatch row {k + 1} slides in (2f stagger)", idx=k,
          pan=(-0.55 if k % 2 == 0 else 0.55) * (1.0 - 0.02 * k), db=-30)
    # granular tickers: partials 12-24 of 110 Hz, density ramps 8 -> 32 per second over 240-300
    rng = rng_for(2000)
    dur_s = 2.0
    # N(t) = 8 t + 6 t^2  (rate 8 + 12 t -> 32 at t = 2)   (cumulative count)
    ncount = int(8 * dur_s + 6 * dur_s ** 2)
    for k in range(ncount):
        c = k + rng.random()
        t = (-8 + np.sqrt(64 + 24 * c)) / 12.0
        n_part = int(rng.integers(12, 25))
        H(240 + 30 * t, "TICK", f"S03 ticker grain, partial {n_part} of 110 Hz", f=110.0 * n_part,
          db=-26, pan=float(rng.uniform(-0.7, 0.7)), tau=0.006)
    # f300-303 freeze: hard silence (see GATES)
    for k in range(20):                                    # rows collapse: 20 TICKs 2 kHz -> 200 Hz
        fq = 2000.0 * (0.1 ** (k / 19.0))
        H(303 + 1.2 * k, "TICK", f"S03 row collapse tick {k + 1}/20", f=fq, db=-20,
          pan=(-0.3 if k % 2 == 0 else 0.3))

    # ================================ ACT II - MEANING (330-899) ================================
    # ---- S04 The Fold ----
    H(330, "HINGE", "S04 elevation folds flat (HINGE 20f), fc 6000->300", dur=20, ease="HINGE", fc0=6000, fc1=300,
      pan0=0.0, pan1=0.0, db=-18)
    H(360, "HINGE", "S04 plan unfolds up (HINGE 25f), fc 300->6000", dur=25, ease="HINGE", fc0=300, fc1=6000,
      pan0=0.0, pan1=0.0, db=-18)
    H(360, "PAD", "S04 PAD enters (-28), LP 900 Hz (Act II)", dur=90, db=-28, attack=0.6, release=0.004,
      lp=[(360, 900)], lvl=[(360, 0.0)])
    for k, f in enumerate((390, 405, 420, 435)):
        H(f, "SET", f"S04 label {['LIVING', 'KITCHEN', 'BEDROOM', 'BATH'][k]} sets", pan=pan_x([854, 1175, 1577, 1359][k]))

    # ---- S05 Nobody Buys Square Feet ----   (f450 cut to red: gate 450-458)
    H(458, "SUB", "S05 `Nobody`: SUB normal", db=-10)
    H(458, "SET", "S05 `Nobody` sets (mask rising)")
    H(465, "SET", "S05 `buys` sets")
    H(473, "SUB", "S05 `square feet.` SUB big", db=-6, tau=0.5)
    H(473, "TICK", "S05 `square feet.` dry TICK cluster 1760 Hz (no reverb send)", f=1760, tau=0.010, db=-18, send=None)
    H(473, "TICK", "S05 `square feet.` dry TICK cluster 2200 Hz (no reverb send)", f=2200, tau=0.010, db=-18, send=None)

    # ---- S06 Sun Study ----
    H(540, "PAD", "S06 PAD returns, LP opens to 1400 Hz, partials 3/4/5 +3 dB; acceleration opens LP 1400->4000 (820-869)",
      dur=330, db=-24, attack=0.4, release=0.004,
      partials=[(1, 0), (2, 0), (3, 3), (4, 3), (5, 3), (6, 0), (8, 0)],
      lp=[(540, 900), (600, 1400), (820, 1400), (869, 4000)],
      lvl=[(540, -4), (720, -2), (820, 0)])
    for f in range(545, 634, 2):
        H(f, "TICK", "S06 clock counts SUN 06:12 -> 07:40 (1 minute per 2 frames)", f=3500, db=-38, pan=pan_x(300))
    H(633, "BELL", "S06 `SUN 07:40` lands", f=440)
    flap_run(640, 15, 1.0, LABEL_PAN["BEDROOM"], "S06 BEDROOM -> Sunday mornings (1 char/frame)")
    # (POLY voice 3 enters at f660: generated with the rest of the polyrhythm in S07 below)
    for f, lab, label, n, who in ((675, "KITCHEN", "First coffee", 12, 550), (683, "LIVING", "Long dinners", 12, 550),
                                  (690, "ENTRY", "Shoes off", 9, 550), (698, "BATH", "Ten quiet minutes", 17, 550)):
        H(f, "TICK", f"S06 relabel {lab} cue", f=550, pan=LABEL_PAN[lab])
        flap_run(f, n, 1.0, LABEL_PAN[lab], f"S06 {lab} -> {label} (1 char/frame)")

    # ---- S07 Which Buyer ----
    for f in (720, 740, 760, 780, 800):
        for lab in LABEL_ORDER:
            word = BUYER_SETS[f][lab]
            extra = -3.0 if f in (720, 760, 800) else 0.0     # headline SET lands on those frames
            flap_run(f, len(word), 0.5, LABEL_PAN[lab], f"S07 {lab} -> {word} (0.5f/char)", db=-30 + extra)
    H(720, "SUB", "S07 **Which buyer.** SUB normal", db=-10)
    H(720, "SET", "S07 **Which buyer.** headline sets")
    H(760, "SUB", "S07 **Which reason.** SUB normal", db=-10)
    H(760, "SET", "S07 **Which reason.** headline sets")
    H(800, "SUB", "S07 **Which hour.** SUB normal", db=-10)
    H(800, "SET", "S07 **Which hour.** headline sets")
    for f in (815, 830, 845):
        H(f, "TICK", "S07 clock flips (SUN/WED/SAT/FRI)", f=440, pan=pan_x(160))
    # acceleration 820-869: steps on the 5-grid (12f) then every 6f; new header + labels each step
    steps = [820, 832, 844, 850, 856, 862, 868]
    for k, f in enumerate(steps):
        for j, lab in enumerate(LABEL_ORDER):
            word = POOL[(5 * k + j) % len(POOL)]
            n = min(len(word), 6) if (k >= 3) else len(word)
            flap_run(f, n, 0.5, LABEL_PAN[lab], f"S07 accel step {k + 1}: {lab} -> {word}"
                     + (" (first 6 chars flip)" if k >= 3 else ""), db=-31, until=870)
    # POLY: the triangle as rhythm (3:4:5). voices enter 660 / 720 / 800(->first grid hit 804)
    voices = {3: (330.0, 0.040, 20.0, -0.35, 660), 4: (440.0, 0.030, 15.0, 0.0, 720), 5: (550.0, 0.024, 12.0, 0.35, 800)}
    for v, (hz, tau, period, pn, start) in voices.items():
        regions = [(start, 820, period), (820, 850, period / 2), (850, 870, period / 3)]
        for s, e, per in regions:
            for t in grid_times(s, e, per):
                dbv = -32 if (v == 3 and t < 720) else -26
                accent = (abs(t % BAR) < 1e-6)
                H(t, "POLY", f"POLY voice {v}: TICK {hz:.0f} Hz, every {per:g}f" + (" (bar downbeat)" if accent else ""),
                  voice=v, f=hz, tau=tau, db=dbv + (2.0 if accent else 0.0), pan=pn)
    # f870 dead stop: silence 870-876 (GATES)
    H(876, "RISER", "S07 the dive into the gap: noise-only riser, ends exactly at f899 (end of f898)",
      kind="noise", dur=23, db_start=-40, db_end=-14)

    # ================================ ACT III - THE DOOR (900-1349) ================================
    # ---- S08 The Door Is 9:16 ----
    H(900, "SUB", "S08 red | slot | red: SUB big", db=-6, tau=0.5)
    H(900, "KNOCK", "S08 red | slot | red: KNOCK 70 Hz", f=70)
    H(915, "SLAB", "S08 the door opens: slabs slide apart (HINGE 30f)", dur=30, ease="HINGE")
    H(945, "KNOCK", "S08 slab end-stop", f=90, db=-16)
    H(950, "SET", "S08 **The first door**")
    H(958, "SET", "S08 **they open is** 9:16.")
    H(958, "TICK", "S08 dry TICK on `9:16.` (no reverb send)", f=880, send=None)
    H(970, "PEN", "S08 horizontal dimension string `1080` (DRAFT 10f)", dur=10, ease="DRAFT", x0=680, x1=1240)
    H(970, "TICK", "S08 dimension `1080`", f=1320, pan=pan_x(960))
    H(980, "PEN", "S08 vertical dimension string `1920` (DRAFT 10f)", dur=10, ease="DRAFT", x0=1236, x1=1236)
    H(980, "TICK", "S08 dimension `1920`", f=1320, pan=pan_x(1236))

    # ---- S09 Thumb-Stop ----
    H(1020, "RISER", "S09 feed scroll: full riser, saws 110->880 Hz + HP noise, ends at brake f1086",
      kind="full", dur=66, db_start=-40, db_end=-12)
    scroll = EASE["SCROLL"]
    ps = np.linspace(0, 1, 4001)
    vel = np.gradient(scroll(ps), ps)
    vmax = vel.max()
    for k in range(1, 11):                                 # card rule k crosses screen centre at Y = 1080k - 540
        y = (1080.0 * k - 540.0) / 10800.0
        p = float(scroll.inverse(y))
        v = float(np.interp(p, ps, vel)) / vmax
        H(1020 + 66 * p, "TICK", f"S09 card rule {k} crosses screen centre (Y=10800*SCROLL(p), speed {v:.2f})",
          f=1760, db=-22 + 4 * v, pan=0.0)
    # f1086-1092: brake, hard silence (GATES)
    H(1092, "BELL", "S09 stop card holds: BELL 440 Hz, long", f=440, long=True)
    H(1095, "PAD", "S09 sun rises: PAD partials 3+4+5 (165/220/275 Hz) swell over 15f (-30 -> -24)",
      dur=254, db=-24, attack=0.05, release=0.3, freqs=[(165.0, 0.0), (220.0, 0.0), (275.0, 0.0)],
      lp=[(1095, 2000)], lvl=[(1095, -6.0), (1110, 0.0), (1330, 0.0), (1349, -9.0)])
    for i in range(28):
        H(1110 + 0.5 * i, "FLAP", "S09 spec line types (2 chars/frame)", idx=i, pan=0.0, db=-30)

    # ---- S10 The Stair ----
    H(1170, "SLAB", "S10 slabs slide fully offscreen (reverse: accelerating, no end-stop) (LIFT 15f)",
      dur=15, ease="LIFT", reverse=True, endstop=False)
    H(1170, "HINGE", "S10 slabs out: HINGE swell (LIFT 15f)", dur=15, ease="LIFT", fc0=700, fc1=5000, pan0=0.0,
      pan1=0.0, db=-18)
    treads = [1185, 1200, 1215, 1230, 1245, 1260, 1275]
    notes = [330, 440, 550, 660, 880, 1100, 1320]
    names = ["SEEN", "STOPPED", "TAPPED", "ENQUIRED", "CALLED BACK", "VISITED", "KEYS"]
    for i, (f, hz, nm) in enumerate(zip(treads, notes, names)):
        H(f, "MARIMBA", f"S10 tread {i + 1} `{nm}`: harmonic {hz // 110} of 110 Hz", f=hz,
          pan=-0.5 + i / 6.0)
        H(f, "SUB", f"S10 tread {i + 1} `{nm}`: SUB soft", db=-24)
    for k in range(9):                                      # HAT on every off-beat from 1192.5 (audio-exact)
        H(1192.5 + 15 * k, "HAT", "S10 off-beat HAT (groove carries on)", pan=(0.25 if k % 2 == 0 else -0.25))
    for f in (1290, 1305):
        H(f, "SUB", "S10 groove carries on past the stair: SUB soft on the beat", db=-24)
    H(1215, "CLICK", "S10 `TAPPED`: CLICK (the groove ignores it)")
    H(1230, "SET", "S10 **We don't stop at the click.**")
    H(1285, "KNOCK", "S10 door block rises from the landing (SET 12f)", f=70)
    H(1300, "KEYS", "S10 KEYS: seven FM pings (the keys)")
    H(1305, "HINGE", "S10 door leaf swings open (HINGE 15f), fc 500->2500", dur=15, ease="HINGE", fc0=500, fc1=2500,
      pan0=-0.3, pan1=0.3, db=-18)
    H(1320, "RISER", "S10 push through the slot into white: noise-only riser, cut dead at f1349", kind="noise",
      dur=29, db_start=-40, db_end=-14)

    # ================================ ACT IV - THE MARK (1350-1799) ================================
    # ---- S11 The Plan Was the Mark ----
    H(1350, "PAD", "S11 plan redraws: PAD as chord 110+330+440+550 Hz (attack 30 ms), LP 2400 Hz (Act IV)",
      dur=90, db=-24, attack=0.03, release=0.6, freqs=[(110.0, 0.0), (330.0, -2.0), (440.0, -3.0), (550.0, -4.0)],
      lp=[(1350, 2400)], lvl=[(1350, 0.0)])
    H(1350, "PEN", "S11 PEN burst: the whole plan draws on in 15f", dur=15, ease="DRAFT", x0=520, x1=1400, wide=True,
      db=-28)
    for f, hz in ((1380, 1320), (1388, 880), (1395, 550), (1403, 330)):
        H(f, "TICK", "S11 retraction in reverse drawing order, descending", f=hz, db=-24, pan=0.0)
    H(1408, "WALLS", "S11 the walls thicken: saws 55+110 Hz crescendo -36 -> -14 dB, LP 200 -> 2000 Hz", dur=32)
    H(1440, "SUB", "S11 solid mark: SUB big", stem="logo", db=-6, tau=0.5)
    for hz in (330, 440, 550):
        H(1440, "BELL", f"S11 solid mark: BELL {hz} Hz together, soft", stem="logo", f=hz, db=-20)

    # ---- S12 The True Angle ----
    H(1500, "PEN", "S12 construction hairlines at the sharp vertex (DRAFT 12f), soft", dur=12, ease="DRAFT", x0=430,
      x1=700, db=-34)
    H(1505, "PEN", "S12 angle arc r=40 MU and `53.13°` (DRAFT 10f), soft", dur=10, ease="DRAFT", x0=560, x1=720, db=-36)
    H(1515, "SET", "S12 **Every property has an angle.**")
    H(1515, "TICK", "S12 end line 1: TICK 440 Hz", f=440, db=-22)
    H(1575, "SET", "S12 **We find the true one.**")
    H(1575, "TICK", "S12 end line 2: TICK 550 Hz", f=550, db=-22)
    for k, hz in enumerate((1320, 1100, 880, 660, 550, 440)):
        H(1620 + 5 * k, "TICK", "S12 annotations retract: descending TICKs, soft", f=hz, db=-30, pan=0.0)

    # ---- S13 Red Angle / End Card ----
    H(1650, "WIPE", "S13 angle wipe (BRAKE 20f) sweeps L->R at 53.13 deg", dur=20, ease="BRAKE")
    H(1680, "BELL", "S13 SONIC LOGO 1/3: BELL 330 Hz (3)", stem="logo", f=330)
    H(1684, "BELL", "S13 SONIC LOGO 2/3: BELL 440 Hz (4)", stem="logo", f=440)
    H(1688, "BELL", "S13 SONIC LOGO 3/3: BELL 550 Hz (5)", stem="logo", f=550)
    for hz in (330, 440, 550):
        H(1695, "BELL", f"S13 X crosses: BELL {hz} Hz re-struck", stem="logo", f=hz, db=-17)
    H(1695, "SUB", "S13 X crosses: SUB soft 55 Hz, tau 2 s", stem="logo", db=-24, tau=2.0)
    H(1695, "PAD", "S13 X crosses: PAD 110 (harmonics 1-5 of 110 Hz), holds to the end", stem="logo", dur=105,
      db=-24, attack=0.03, release=0.0, unit=110.0, partials=[(1, 0), (2, 0), (3, 0), (4, 0), (5, 0)],
      lp=[(1695, 2400)], lvl=[(1695, 0.0)])
    H(1710, "TICK", "S13 `AI-FIRST ADVERTISING FOR REAL ESTATE` sets: TICK 2200 Hz", f=2200, db=-28)

    # ----------------------------------------------------------------- finish
    HITS.sort(key=lambda h: (h.frame, h.inst))
    for i, h in enumerate(HITS):
        h.idx = i
    _assert_no_hit_in_gate()
    return list(HITS)


def _assert_no_hit_in_gate():
    for h in HITS:
        if h.inst == "ROOM":
            continue
        for g0, g1, *_ in GATES:
            if g0 <= h.frame < g1:
                raise AssertionError(f"hit {h.inst}@{h.frame} falls inside gate {g0}-{g1}")


# --------------------------------------------------------------------------------------
def describe(h: Hit) -> str:
    """Short human description of a hit for the cue sheet."""
    p = h.p
    i = h.inst
    if i == "TICK" or i == "POLY":
        return f"{i} {p.get('f', 0):.0f} Hz" + (f" {p['db']:+.0f} dB" if "db" in p else "")
    if i == "BELL":
        return f"BELL {p['f']} Hz" + (" (long)" if p.get("long") else "") + (f" {p['db']:+.0f} dB" if "db" in p else "")
    if i == "MARIMBA":
        return f"MARIMBA {p['f']} Hz"
    if i == "KNOCK":
        return f"KNOCK {p.get('f', 180)} Hz"
    if i == "SUB":
        db = p.get("db", -10)
        nm = {-6: "big", -10: "normal", -24: "soft"}.get(int(db), f"{db:+.0f} dB")
        return f"SUB {nm}"
    if i in ("HINGE",):
        return f"HINGE fc {p['fc0']}->{p['fc1']} Hz, {p['dur']}f"
    if i == "FLAP":
        return f"FLAP char#{p['idx']} (band {[2.2, 2.9, 3.6, 4.4][p['idx'] % 4]} kHz)"
    if i in ("PEN", "SLAB", "WIPE", "RISER", "WALLS"):
        extra = f" {p['kind']}" if "kind" in p else ""
        return f"{i}{extra} {p['dur']}f"
    if i == "PAD":
        return f"PAD {p['dur']}f"
    if i == "TWANG":
        return f"TWANG {p['kind']}"
    return i
