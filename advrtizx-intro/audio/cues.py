"""cues.py - THE single source of truth for every frame-keyed decision in the DOMINANT score.

    sample = round(frame x 1600)            (30 fps, 48 kHz  ->  1 frame = 1600 samples = 33.333 ms)
    1800 frames = 2,880,000 samples = exactly 60.000 s
    112.5 BPM : beat = 16 f = 25,600 samples, bar = 64 f, 16th = 4 f, 32nd = 2 f

How to move things later
    * GLOBAL_SHIFT nudges the entire score against the picture (frames, may be negative).
    * SHIFT maps a cue name (or a prefix ending in '*', e.g. "FLOOR_*") to extra frames.
    * Derived events (a whip's start, a riser, a layer boundary) are computed FROM their anchor cue, so moving
      the anchor moves everything that hangs off it. Nothing else in the code base hard-codes a frame.

Musical idea (the heart of the score)
    A is the dominant of D. The first impact plants an A (f3) and the score sits on an A pedal and refuses to
    resolve for 46 seconds: Dm/A, Bb/A, Gm/A, A, A7, A7b9 stacked above it, tension growing. At f1408 the A chord
    lands, at f1440 D arrives - a perfect cadence, the AD monogram spelt as music.  The bell call A5 -> D6 is
    teased unresolved (A5 alone) at f224 and f832 and resolves only at f1536.
"""
from __future__ import annotations

from dataclasses import dataclass, field

FPS = 30
SR = 48_000
SPF = SR // FPS                  # 1600
TOTAL_FRAMES = 1800
N_TOTAL = TOTAL_FRAMES * SPF     # 2,880,000
BPM = 112.5
BEAT, BAR, S16, S32 = 16, 64, 4, 2

# ----------------------------------------------------------------------------------------------------------------
# shifting
# ----------------------------------------------------------------------------------------------------------------
GLOBAL_SHIFT = 0                 # frames, whole score
SHIFT: dict[str, int] = {}       # {"SELL": +1, "FLOOR_*": -1, ...}


def _shift_for(name: str) -> int:
    s = GLOBAL_SHIFT
    if name in SHIFT:
        return s + SHIFT[name]
    for k, v in SHIFT.items():
        if k.endswith("*") and name.startswith(k[:-1]):
            return s + v
    return s


def f2s(frame) -> int:
    return int(round(float(frame) * SPF))


# ----------------------------------------------------------------------------------------------------------------
# cue registry
# ----------------------------------------------------------------------------------------------------------------
ACTS = [  # (first frame, name)
    (0, "I THE CROWN"), (128, "II THE STATEMENT"), (256, "III DUBAI"), (384, "IV EVERY CITY"),
    (640, "V AT ONCE"), (896, "VI THE WORLD"), (1152, "VII CLIMAX"), (1408, "VIII THE CADENCE"),
    (1632, "IX END CARD"),
]


def act_of(frame: float) -> str:
    name = ACTS[0][1]
    for f, n in ACTS:
        if frame >= f:
            name = n
    return name


@dataclass
class Cue:
    name: str
    base: int                    # frame as written in the brief
    kind: str                    # impact | slam | lock | whoosh | riser | swell | stab | hit | drum | click | tick | pedal ...
    desc: str
    end_base: int | None = None  # for events with a duration (whoosh, riser, wind ...)
    p: dict = field(default_factory=dict)

    @property
    def frame(self) -> int:
        return self.base + _shift_for(self.name)

    @property
    def end(self) -> int | None:
        return None if self.end_base is None else self.end_base + _shift_for(self.name)

    @property
    def sample(self) -> int:
        return f2s(self.frame)

    @property
    def act(self) -> str:
        return act_of(self.base)


CUES: dict[str, Cue] = {}


def _c(name, frame, kind, desc, end=None, **p) -> Cue:
    assert name not in CUES, name
    CUES[name] = Cue(name, int(frame), kind, desc, None if end is None else int(end), p)
    return CUES[name]


def F(name: str) -> int:
    """effective start frame of a cue"""
    return CUES[name].frame


def E(name: str) -> int:
    """effective end frame of a cue that has one"""
    e = CUES[name].end
    assert e is not None, name
    return e


def S(name: str) -> int:
    return CUES[name].sample


def group(prefix: str) -> list[Cue]:
    return sorted([c for c in CUES.values() if c.name.startswith(prefix)], key=lambda c: (c.frame, c.name))


# ================================================================================================================
# ACT I - THE CROWN (f0-127)
# ================================================================================================================
_c("FALL", 0, "whoosh", "a massive object rips downward through the air (f0-3), red void drone underneath", end=3)
_c("DRONE_VOID", 0, "pedal", "faint red-void drone on A under the fall and the tower rise (cut at TOP_LOCK)", end=72)
_c("CROWN_IMPACT", 3, "impact", "the biggest hit so far: tuned sub A1 = 55 Hz - the first A of the film", size=1.0)

FLOOR_FRAMES = [12, 20, 27, 33, 38, 42, 46, 49, 52, 55, 57, 59, 61, 63] + list(range(64, 72))
for _i, _f in enumerate(FLOOR_FRAMES, 1):
    _c(f"FLOOR_{_i:02d}", _f, "slam", f"floor module {_i} locks into the tower being jacked out of the ground",
       index=_i - 1)
_c("ROAR", 56, "riser", "the per-frame floor hits merge into a roar (riser) - builds f56, full from f63, ends at TOP_LOCK",
   end=72)
_c("TOP_LOCK", 72, "lock", "colossal steel lock, then everything cuts to silence instantly")
_c("LOCK_CUT", 72 + 9, "gate", "the lock's ring is truncated here (t = 0.30 s): nothing but wind remains")
_c("WIND", 72, "ambience", "very quiet high-altitude wind (fades in over ~1 s)", end=128)
_c("DRONE_RETURN", 96, "pedal", "a faint sub drone on A returns", end=128)

# ================================================================================================================
# ACT II - THE STATEMENT (f128-255)
# ================================================================================================================
_c("LINE1", 128, "drum", "NO TOWER RISES - a deep drum hit; the low tense A pulse begins")
_c("PULSE_A", 128, "pedal", "low tense A pulse (beats, then 8ths from f192)", end=224)
_c("LINE2", 160, "drum", "UNSOLD. - a hit")
_c("SELL_SWELL", 224 - 24, "swell", "reverse-reverb swell sucking into SELL", end=224 - 2)
_c("SELL", 224, "braam", "WE SELL THEM. - huge A-major dominant braam + impact + unresolved A5 bell tease", size=1.12)
_c("TEASE_1", 224, "bell", "motif tease: A5 alone, unresolved")
_c("DIVE", 240, "whoosh", "camera plunges to the ground: falling whoosh + riser into the drop", end=256)

# ================================================================================================================
# ACT III - DUBAI (f256-383)
# ================================================================================================================
_c("DROP", 256, "impact", "the full groove begins: kick, A-pedal 16th bass, cinematic percussion", size=1.0)
ERUPT_FRAMES = [256, 264, 272, 280, 288] + list(range(296, 376, 8))      # wave of 5, then lighter 8ths until f375
# on-screen position -> pan: the wave opens from the centre outwards, then the landings scatter (golden-ratio walk)
ERUPT_PAN = [0.00, -0.38, 0.38, -0.72, 0.72]
_g = 0.0
for _k in range(len(ERUPT_FRAMES) - 5):
    _g = (_g + 0.6180339887) % 1.0
    ERUPT_PAN.append(round((2 * _g - 1) * 0.86, 3))
for _i, _f in enumerate(ERUPT_FRAMES, 1):
    _c(f"ERUPT_{_i:02d}", _f, "landing", "tower erupts / lands (pan = on-screen position)",
       index=_i - 1, pan=ERUPT_PAN[_i - 1], heavy=_i <= 5)
CITY_TOPS = ["A4", "Bb4", "C#5", "D5", "E5", "F5", "G5", "A5", "Bb5", "C#6"]    # D harmonic minor from A4: the rising city line
_c("CITY_DUBAI", 288, "city", f"city hit: impact + tonal stab, top note {CITY_TOPS[0]} (the city line starts)", note_idx=0)

# ================================================================================================================
# ACT IV - EVERY CITY (f384-639): each city = a WHIP leading into a CITY_HIT on the downbeat
# ================================================================================================================
CITY_LIST = [  # name, hit frame, whip start frame
    ("LONDON", 384, 376), ("NEWYORK", 448, 440), ("SINGAPORE", 512, 504), ("MUMBAI", 544, 536),
    ("MIAMI", 576, 572), ("SYDNEY", 592, 588), ("RIYADH", 608, 604), ("HONGKONG", 624, 620), ("TOKYO", 632, 628),
]
CITY_LABEL = {"LONDON": "London", "NEWYORK": "New York", "SINGAPORE": "Singapore", "MUMBAI": "Mumbai", "MIAMI": "Miami",
              "SYDNEY": "Sydney", "RIYADH": "Riyadh", "HONGKONG": "Hong Kong", "TOKYO": "Tokyo"}
for _i, (_n, _hit, _w0) in enumerate(CITY_LIST, 1):
    _c(f"WHIP_{_n}", _w0, "whoosh", f"whip-pan right into {CITY_LABEL[_n]}", end=_hit, city=_n, order=_i)
    _c(f"CITY_{_n}", _hit, "city", f"city hit: {CITY_LABEL[_n]}, top note {CITY_TOPS[_i]}", note_idx=_i, order=_i)
_c("RISER_CITIES", 608, "riser", "riser under the last cities, into the grid (f608-639)", end=640)

# ================================================================================================================
# ACT V - AT ONCE (f640-895): the screen splits into ever more panels of simultaneous cities
# ================================================================================================================
GRID_LIST = [(640, 2, "ANY TOWER."), (672, 4, "ANY CITY."), (704, 8, "ANY LANGUAGE."), (736, 16, ""),
             (768, 32, "AT ONCE."), (800, 64, "")]
for _i, (_f, _np, _t) in enumerate(GRID_LIST, 1):
    _c(f"GRID_{_np}", _f, "grid", f"grid hit: {_np} panels {_t}".strip(), panels=_np, order=_i)
_c("UNISON", 832, "unison", "ONE INTELLIGENCE. - every tower in 64 cities lands on ONE transient (+ unresolved A5 bell)",
   size=1.30)
_c("TEASE_2", 832, "bell", "motif tease #2: A5 alone, unresolved")
_c("UNISON_GAP", 832 - 1, "gate", "one-frame vacuum before the unison: groove, pads and tails duck out so ONE transient lands in a clean room",
   end=832)
_c("DROPOUT", 832, "gate", "1-beat dropout: groove muted, tails and pedal drone survive", end=832 + BEAT)
_c("ROLL", 864, "riser", "riser into the drop, drum roll from 16ths to 32nds", end=896)

# ================================================================================================================
# ACT VI - THE WORLD (f896-1151)
# ================================================================================================================
_c("DROP_WORLD", 896, "braam", "the fullest groove of the film", size=1.25)
STAMP_FRAMES = [896, 912, 928, 944, 960, 976, 992, 1008, 1016, 1024, 1032, 1040]
STAMP_NOTES = ["A3", "C#4", "E4", "G4", "A4", "C#5", "E5", "G5", "A5", "C#6", "E6", "G6"]   # rising dominant arpeggio
for _i, (_f, _n) in enumerate(zip(STAMP_FRAMES, STAMP_NOTES), 1):
    _c(f"STAMP_{_i:02d}", _f, "stamp", f"SOLD stamp, language board {_i}: {_n}", note=_n, index=_i - 1)
STORM_FRAMES = list(range(1048, 1088, 4))                                  # 10 sixteenths
STORM_NOTES = ["A5", "C#6", "E6", "G6", "A6", "G6", "E6", "C#6", "A5", "C#6"]
for _i, (_f, _n) in enumerate(zip(STORM_FRAMES, STORM_NOTES), 1):
    _c(f"STORM_{_i:02d}", _f, "stamp", f"SOLD_STORM 16th flurry {_i}: {_n}", note=_n, index=_i - 1, storm=True)
_c("TENSION", 1088, "riser", "rising tension: Shepard creeps in, harmony leans on Bb/A", end=1152)

# ================================================================================================================
# ACT VII - CLIMAX (f1152-1407)
# ================================================================================================================
_c("CLIMAX", 1152, "impact", "long build: Shepard riser, drums intensify, A7b9 over the pedal", size=0.95)
_c("SHEPARD", 1152, "riser", "endless Shepard riser (octave-stacked sines under a fixed Gaussian window, accelerating)", end=1376)
_c("RISER_CLIMAX", 1152 + 2 * BAR, "riser", "noise riser for the last 3 bars of the build, accelerating tremolo", end=1376)
_c("SURGE", 1344, "riser", "peak density: 32nd-note drums, everything open", end=1376)
_c("HARD_SILENCE", 1376, "gate", "cut to silence within 5 ms; no reverb tail past f1377", end=1408)

# ================================================================================================================
# ACT VIII - THE CADENCE (f1408-1631)
# ================================================================================================================
_c("A_DOMINANT", 1408, "cadence", "enormous impact + the full A dominant chord (A7)", size=1.55)
_c("D_TONIC", 1440, "cadence", "bigger impact + D major: the resolution; a long blooming tail sustains below everything", size=1.85)
_c("SENTENCE", 1504, "whoosh", "soft precise whoosh as 'EVERY SKYLINE STARTS WITH AN' sets", end=1536)
_c("REBUS_CLICK", 1536, "click", "precise mechanical click")
MOTIF_GAP = 8                                                              # frames between A5 and D6 (an eighth)
_c("MOTIF_A5", 1536, "bell", "bell call resolves: A5 ...")
_c("MOTIF_D6", 1536 + MOTIF_GAP, "bell", "... D6 (a perfect fourth up)")

# ================================================================================================================
# ACT IX - END CARD (f1632-1799)
# ================================================================================================================
_c("END_SWELL", 1632, "swell", "gentle swell of the tonic", end=1664)
_c("DESCRIPTOR", 1664, "tick", "a tiny tick")
_c("TAIL_END", 1799, "gate", "the tonic has decayed to silence by here")

# ================================================================================================================
# harmony above the A pedal (frame, chord): growing tension  Dm/A -> Bb/A -> Gm/A -> A -> A7 -> A7b9
# ================================================================================================================
HARMONY = [
    (0, "A5"),
    (128, "Dm/A"), (160, "Bb/A"), (192, "Gm/A"), (224, "A"),
    (256, "Dm/A"), (320, "Bb/A"), (384, "Gm/A"), (448, "A"), (512, "Dm/A"), (576, "Bb/A"), (608, "A"),
    (640, "Dm/A"), (672, "Bb/A"), (704, "Gm/A"), (736, "A"), (768, "Dm/A"), (800, "Gm/A"), (832, "A"), (864, "A7"),
    (896, "A7"), (1088, "Bb/A"), (1120, "A7b9"),
    (1152, "A7b9"),
    (1408, "A7"), (1440, "D"),
]


def chord_at(frame: float) -> str:
    cur = HARMONY[0][1]
    for f, c in HARMONY:
        if frame >= f + GLOBAL_SHIFT:
            cur = c
    return cur


def chord_spans() -> list[tuple[int, int, str]]:
    out = []
    for i, (f, c) in enumerate(HARMONY):
        e = HARMONY[i + 1][0] if i + 1 < len(HARMONY) else TOTAL_FRAMES
        out.append((f + GLOBAL_SHIFT, e + GLOBAL_SHIFT, c))
    return out


# ================================================================================================================
# groove layers: (start, end) frame spans in which a layer plays. All derived from cues above.
# ================================================================================================================
def groove_spans():
    drop, uni, dropout_end = F("DROP"), F("UNISON"), E("DROPOUT")
    roll, dw, hs = F("ROLL"), F("DROP_WORLD"), F("HARD_SILENCE")
    return dict(
        kick=[(drop, uni), (dropout_end, roll), (dw, hs)],
        bass=[(drop, uni), (dropout_end, dw), (dw, hs)],
        clap=[(F("DROP") + BAR, uni), (dropout_end, roll), (dw, hs)],
        taiko=[(drop, uni), (dropout_end, roll), (dw, hs)],
        ticks8=[(drop + BAR, uni), (dropout_end, roll), (dw, hs)],
        ticks16=[(F("CITY_NEWYORK"), uni), (dropout_end, roll), (dw, hs)],
    )


# ================================================================================================================
# hard cuts: spans where the master is forced to digital silence (reverb returns included)
# ================================================================================================================
def hard_silences():
    """[(start_frame, end_frame, fade_ms)] - everything (lock/wind excepted at f72) is gone inside these spans."""
    return [(F("HARD_SILENCE"), E("HARD_SILENCE"), 3.0)]


def timeline_rows():
    """every cue, sorted: (frame, sample, name, kind, act, desc, end)."""
    rows = []
    for c in sorted(CUES.values(), key=lambda c: (c.frame, c.name)):
        rows.append(dict(name=c.name, frame=c.frame, sample=c.sample, kind=c.kind, act=c.act, desc=c.desc,
                         end=c.end))
    return rows


if __name__ == "__main__":
    print(f"{len(CUES)} cues; {TOTAL_FRAMES} frames = {N_TOTAL} samples")
    for r in timeline_rows():
        e = f"-{r['end']}" if r["end"] is not None else ""
        print(f"f{r['frame']:>4}{e:<6} s{r['sample']:>9,}  {r['name']:<14} {r['kind']:<8} {r['desc']}")
