import type {Edit} from "./types";

/**
 * Default props for the ShortsEdit composition. Generated from the reference
 * test edit (public/shorts/poppi-test/edit.json) so `remotion studio` opens on
 * a real, validator-clean cut. Real work always passes --props.
 */
export const defaultEdit: Edit = {
  "aroll": "shorts/poppi-test/aroll.mp4",
  "words": "shorts/poppi-test/words.json",
  "matte": "shorts/poppi-test/person.webm",
  "face": {
    "cx": 0.5128,
    "cy": 0.3612,
    "w": 0.4979,
    "h": 0.2801,
    "eyeY": 0.3008
  },
  "accent": "#D97757",
  "accentSoft": "#F4A27A",
  "durationMs": 9200,
  "segments": [
    {
      "fromMs": 0,
      "toMs": 1520,
      "layout": "graphic",
      "panel": "cream",
      "gobo": true,
      "accentWords": [
        "amazon"
      ],
      "graphic": {
        "kind": "logoTile",
        "glyph": "P",
        "label": "poppi"
      }
    },
    {
      "fromMs": 1520,
      "toMs": 2260,
      "layout": "graphic",
      "panel": "slate",
      "accentWords": [
        "amazon"
      ],
      "graphic": {
        "kind": "wordmark",
        "text": "#1 BEST SELLER",
        "tags": [
          {
            "label": "Soda",
            "color": "#D97757"
          },
          {
            "label": "on Amazon",
            "color": "#4E5B70"
          }
        ]
      }
    },
    {
      "fromMs": 2260,
      "toMs": 2960,
      "layout": "face",
      "zoom": 1.12
    },
    {
      "fromMs": 2960,
      "toMs": 3710,
      "layout": "graphic",
      "panel": "ink",
      "accentWords": [
        "nightmare"
      ],
      "graphic": {
        "kind": "counter",
        "from": 0,
        "to": 28100,
        "format": "k",
        "label": "five-star reviews",
        "startMs": 2960,
        "durMs": 700,
        "sub": [
          {
            "label": "this week",
            "from": 0,
            "to": 2400
          }
        ]
      }
    },
    {
      "fromMs": 3710,
      "toMs": 4510,
      "layout": "graphic",
      "panel": "paper",
      "graphic": {
        "kind": "terminal",
        "title": "poppi — restock",
        "lines": [
          {
            "atMs": 3710,
            "text": "$ poppi stock --amazon"
          },
          {
            "atMs": 3960,
            "text": "> scanning fulfilment centres…",
            "color": "#8B949E"
          },
          {
            "atMs": 4210,
            "text": "✓ 12 pallets in stock",
            "color": "#8CF58F"
          }
        ]
      }
    },
    {
      "fromMs": 4510,
      "toMs": 5140,
      "layout": "face",
      "zoom": 1
    },
    {
      "fromMs": 5140,
      "toMs": 6240,
      "layout": "split",
      "panel": "slate",
      "graphic": {
        "kind": "compare",
        "startMs": 5140,
        "durMs": 950,
        "left": {
          "label": "Poppi",
          "color": "#D97757",
          "value": 91
        },
        "right": {
          "label": "Soda",
          "color": "#5B7CD9",
          "value": 37
        }
      }
    },
    {
      "fromMs": 6240,
      "toMs": 7540,
      "layout": "graphic",
      "panel": "slate",
      "graphic": {
        "kind": "lineChart",
        "points": [
          12,
          14,
          13,
          19,
          26,
          24,
          33,
          41,
          52,
          61,
          74,
          88
        ],
        "label": "Amazon rank · last 90 days",
        "startMs": 6240,
        "durMs": 1100
      }
    },
    {
      "fromMs": 7540,
      "toMs": 8440,
      "layout": "graphic",
      "panel": "paper",
      "gobo": true,
      "graphic": {
        "kind": "wordmark",
        "text": "VARIETY PACK",
        "tags": [
          {
            "label": "apple cider vinegar",
            "color": "#D97757"
          },
          {
            "label": "5 flavours",
            "color": "#232A36"
          }
        ]
      }
    },
    {
      "fromMs": 8440,
      "toMs": 9200,
      "layout": "face",
      "zoom": 1.25
    }
  ],
  "emphasis": [
    {
      "style": "semantic",
      "fromMs": 2470,
      "toMs": 2960,
      "text": "number one",
      "dir": "up"
    },
    {
      "style": "twoTier",
      "fromMs": 8480,
      "toMs": 9200,
      "lead": "comment",
      "key": "POPPI"
    }
  ],
  "fx": [
    {
      "kind": "sfx",
      "atMs": 1520,
      "name": "whoosh",
      "gainDb": -10
    },
    {
      "kind": "sfx",
      "atMs": 2960,
      "name": "pop",
      "gainDb": -14
    },
    {
      "kind": "lightLeak",
      "atMs": 5140
    },
    {
      "kind": "sfx",
      "atMs": 8440,
      "name": "ding",
      "gainDb": -16
    }
  ]
};
