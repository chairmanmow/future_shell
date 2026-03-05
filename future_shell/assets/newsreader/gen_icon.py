#!/usr/bin/env python3
"""
gen_icon.py — Generate 12x6 ANSI .bin icons with SAUCE records.

Usage:
    python3 gen_icon.py                  # generate all icons
    python3 gen_icon.py --tier 1         # generate only tier 1
    python3 gen_icon.py --list           # list what would be generated
    python3 gen_icon.py --preview NAME   # ASCII preview of a single icon

Icon format: 12 cols x 6 rows, 2 bytes per cell (char + attr), 144 bytes raw + SAUCE.
"""
import struct, os, sys, argparse

W, H = 12, 6
OUTDIR = os.path.dirname(os.path.abspath(__file__))

# ── CP437 block characters ───────────────────────────────────────────
FULL  = 0xDB  # █
UPPER = 0xDF  # ▀
LOWER = 0xDC  # ▄
SHADE_L = 0xB0  # ░
SHADE_M = 0xB1  # ▒
SHADE_H = 0xB2  # ▓
SPACE = 0x20
# Box drawing
BOX_TL = 0xDA; BOX_TR = 0xBF; BOX_BL = 0xC0; BOX_BR = 0xD9
BOX_H  = 0xC4; BOX_V  = 0xB3

# ── Color helpers ────────────────────────────────────────────────────
BLK=0; BLU=1; GRN=2; CYN=3; RED=4; MAG=5; BRN=6; LGY=7
DGY=8; LBL=9; LGN=10; LCN=11; LRD=12; LMG=13; YEL=14; WHT=15

def attr(fg, bg=0):
    """Build attribute byte from fg (0-15) and bg (0-7)."""
    return ((bg & 0x07) << 4) | (fg & 0x0F)

def cell(ch, fg, bg=0):
    return (ch, attr(fg, bg))

TRANS = cell(SPACE, BLK, 0)  # transparent cell (black space)

# ── SAUCE writer ─────────────────────────────────────────────────────
def make_sauce(title='', author='icongen', width=W, height=H):
    sauce = bytearray(128)
    sauce[0:5] = b'SAUCE'
    sauce[5:7] = b'00'
    t = title.encode('ascii', 'replace')[:35].ljust(35)
    sauce[7:42] = t
    a = author.encode('ascii', 'replace')[:20].ljust(20)
    sauce[42:62] = a
    # FileSize field (bytes 90-93, LE) — raw data size without SAUCE/EOF
    file_size = width * height * 2
    struct.pack_into('<I', sauce, 90, file_size)
    sauce[94] = 5   # DataType: BinaryText
    sauce[95] = width // 2 if width > 0 else 6  # FileType: width/2 for BinaryText
    struct.pack_into('<H', sauce, 96, width)
    struct.pack_into('<H', sauce, 98, height)
    return bytes(sauce)

def write_bin(filename, grid, title=''):
    """Write a 12x6 grid to .bin with SAUCE. grid is list of 6 rows, each 12 (ch, attr) tuples."""
    raw = bytearray()
    for row in grid:
        for ch, a in row:
            raw.append(ch & 0xFF)
            raw.append(a & 0xFF)
    assert len(raw) == W * H * 2, f"Expected {W*H*2} bytes, got {len(raw)}"
    path = os.path.join(OUTDIR, filename)
    with open(path, 'wb') as f:
        f.write(raw)
        f.write(b'\x1a')
        f.write(make_sauce(title=title))
    return path

# ── Grid helpers ─────────────────────────────────────────────────────
def blank_grid(fg=BLK, bg=0):
    return [[cell(SPACE, fg, bg) for _ in range(W)] for _ in range(H)]

def fill_rect(grid, x, y, w, h, ch, fg, bg=0):
    for r in range(y, min(y+h, H)):
        for c in range(x, min(x+w, W)):
            grid[r][c] = cell(ch, fg, bg)

def put_text(grid, x, y, text, fg, bg):
    for i, ch in enumerate(text):
        if x+i < W:
            grid[y][x+i] = cell(ord(ch), fg, bg)

def put_char(grid, x, y, ch, fg, bg=0):
    if 0 <= x < W and 0 <= y < H:
        grid[y][x] = cell(ch, fg, bg)

# ═══════════════════════════════════════════════════════════════════════
# TIER 1: Top-level category icons (12)
# ═══════════════════════════════════════════════════════════════════════

def make_images():
    """Camera/photo icon for Images category"""
    g = blank_grid()
    # Camera body
    fill_rect(g, 1, 1, 10, 4, FULL, LGY, 0)
    # Lens (circle approximation)
    put_char(g, 4, 0, LOWER, DGY)
    put_char(g, 5, 0, LOWER, DGY)
    put_char(g, 6, 0, LOWER, DGY)
    # Body top edge
    for c in range(1, 11):
        put_char(g, c, 1, FULL, DGY)
    # Lens center
    put_char(g, 5, 3, FULL, CYN)
    put_char(g, 6, 3, FULL, CYN)
    put_char(g, 4, 3, UPPER, LCN, DGY)
    put_char(g, 7, 3, UPPER, LCN, DGY)
    put_char(g, 5, 2, LOWER, LCN, DGY)
    put_char(g, 6, 2, LOWER, LCN, DGY)
    put_char(g, 5, 4, UPPER, LCN, DGY)
    put_char(g, 6, 4, UPPER, LCN, DGY)
    # Flash
    put_char(g, 9, 1, FULL, YEL)
    # Bottom edge
    for c in range(1, 11):
        put_char(g, c, 5, UPPER, LGY)
    return g

def make_news_current_affairs():
    """Globe with signal waves for News & Current Affairs"""
    g = blank_grid()
    # Globe circle
    put_char(g, 4, 0, LOWER, LBL); put_char(g, 5, 0, LOWER, BLU); put_char(g, 6, 0, LOWER, LBL); put_char(g, 7, 0, LOWER, LBL)
    put_char(g, 3, 1, FULL, LBL); put_char(g, 4, 1, FULL, GRN); put_char(g, 5, 1, FULL, BLU); put_char(g, 6, 1, FULL, GRN); put_char(g, 7, 1, FULL, LBL); put_char(g, 8, 1, FULL, LBL)
    put_char(g, 3, 2, FULL, BLU); put_char(g, 4, 2, FULL, GRN); put_char(g, 5, 2, FULL, GRN); put_char(g, 6, 2, FULL, BLU); put_char(g, 7, 2, FULL, GRN); put_char(g, 8, 2, FULL, BLU)
    put_char(g, 3, 3, FULL, LBL); put_char(g, 4, 3, FULL, BLU); put_char(g, 5, 3, FULL, GRN); put_char(g, 6, 3, FULL, BLU); put_char(g, 7, 3, FULL, BLU); put_char(g, 8, 3, FULL, LBL)
    put_char(g, 4, 4, UPPER, BLU); put_char(g, 5, 4, UPPER, LBL); put_char(g, 6, 4, UPPER, BLU); put_char(g, 7, 4, UPPER, BLU)
    # Signal arcs on right side
    put_char(g, 10, 1, SHADE_L, LRD)
    put_char(g, 10, 2, SHADE_M, RED)
    put_char(g, 10, 3, SHADE_L, LRD)
    put_char(g, 11, 2, SHADE_L, YEL)
    # Small dot
    put_char(g, 9, 4, FULL, RED)
    return g

def make_technology():
    """Monitor/screen icon for Technology & Startups"""
    g = blank_grid()
    # Monitor frame
    for c in range(1, 11):
        put_char(g, c, 0, LOWER, LGY)
    put_char(g, 1, 1, FULL, LGY); put_char(g, 10, 1, FULL, LGY)
    put_char(g, 1, 2, FULL, LGY); put_char(g, 10, 2, FULL, LGY)
    put_char(g, 1, 3, FULL, LGY); put_char(g, 10, 3, FULL, LGY)
    for c in range(1, 11):
        put_char(g, c, 4, UPPER, LGY)
    # Screen content - code brackets
    fill_rect(g, 2, 1, 8, 3, FULL, BLU, 0)
    put_char(g, 3, 2, ord('<'), LGN, BLU)
    put_char(g, 4, 2, ord('/'), LGN, BLU)
    put_char(g, 5, 2, ord('>'), LGN, BLU)
    put_char(g, 7, 2, SHADE_M, CYN, BLU)
    put_char(g, 8, 2, SHADE_M, CYN, BLU)
    # Stand
    put_char(g, 5, 4, FULL, DGY); put_char(g, 6, 4, FULL, DGY)
    put_char(g, 4, 5, LOWER, DGY); put_char(g, 5, 5, LOWER, DGY); put_char(g, 6, 5, LOWER, DGY); put_char(g, 7, 5, LOWER, DGY)
    return g

def make_business_finance():
    """Bar chart with upward arrow for Business & Finance"""
    g = blank_grid()
    # Bars from left to right, increasing height
    put_char(g, 2, 4, FULL, GRN); put_char(g, 2, 5, FULL, GRN)
    put_char(g, 4, 3, FULL, LGN); put_char(g, 4, 4, FULL, LGN); put_char(g, 4, 5, FULL, LGN)
    put_char(g, 6, 2, FULL, CYN); put_char(g, 6, 3, FULL, CYN); put_char(g, 6, 4, FULL, CYN); put_char(g, 6, 5, FULL, CYN)
    put_char(g, 8, 1, FULL, LCN); put_char(g, 8, 2, FULL, LCN); put_char(g, 8, 3, FULL, LCN); put_char(g, 8, 4, FULL, LCN); put_char(g, 8, 5, FULL, LCN)
    # Dollar sign
    put_char(g, 10, 1, ord('$'), YEL)
    # Trend line
    put_char(g, 1, 4, ord('/'), LGN)
    put_char(g, 3, 3, ord('/'), LGN)
    put_char(g, 5, 2, ord('/'), CYN)
    put_char(g, 7, 1, ord('/'), LCN)
    # Arrow tip
    put_char(g, 9, 0, ord('^'), WHT)
    return g

def make_sports():
    """Trophy/cup icon for Sports"""
    g = blank_grid()
    # Trophy cup
    put_char(g, 3, 0, LOWER, YEL); put_char(g, 4, 0, LOWER, YEL); put_char(g, 5, 0, LOWER, YEL); put_char(g, 6, 0, LOWER, YEL); put_char(g, 7, 0, LOWER, YEL); put_char(g, 8, 0, LOWER, YEL)
    put_char(g, 3, 1, FULL, YEL); put_char(g, 4, 1, FULL, YEL); put_char(g, 5, 1, ord('#'), BRN, YEL); put_char(g, 6, 1, ord('1'), BRN, YEL); put_char(g, 7, 1, FULL, YEL); put_char(g, 8, 1, FULL, YEL)
    # Handles
    put_char(g, 2, 1, FULL, BRN); put_char(g, 9, 1, FULL, BRN)
    put_char(g, 2, 2, UPPER, BRN); put_char(g, 9, 2, UPPER, BRN)
    # Tapered body
    put_char(g, 4, 2, FULL, YEL); put_char(g, 5, 2, FULL, YEL); put_char(g, 6, 2, FULL, YEL); put_char(g, 7, 2, FULL, YEL)
    put_char(g, 5, 3, UPPER, YEL); put_char(g, 6, 3, UPPER, YEL)
    # Stem
    put_char(g, 5, 3, FULL, BRN); put_char(g, 6, 3, FULL, BRN)
    put_char(g, 5, 4, FULL, BRN); put_char(g, 6, 4, FULL, BRN)
    # Base
    put_char(g, 3, 5, LOWER, LGY); put_char(g, 4, 5, LOWER, LGY); put_char(g, 5, 5, LOWER, LGY); put_char(g, 6, 5, LOWER, LGY); put_char(g, 7, 5, LOWER, LGY); put_char(g, 8, 5, LOWER, LGY)
    return g

def make_entertainment():
    """Film clapperboard icon for Entertainment & Pop Culture"""
    g = blank_grid()
    # Clapper top (striped)
    for c in range(1, 11):
        if c % 2 == 0:
            put_char(g, c, 0, FULL, WHT)
        else:
            put_char(g, c, 0, FULL, DGY)
    for c in range(1, 11):
        if c % 2 == 0:
            put_char(g, c, 1, FULL, DGY)
        else:
            put_char(g, c, 1, FULL, WHT)
    # Board body
    fill_rect(g, 1, 2, 10, 3, FULL, DGY, 0)
    # Text lines on board
    put_text(g, 2, 2, "SCENE", WHT, DGY)
    put_text(g, 2, 3, "TAKE", LGY, DGY)
    put_char(g, 7, 3, ord('1'), YEL, DGY)
    # Bottom edge
    for c in range(1, 11):
        put_char(g, c, 5, UPPER, DGY)
    return g

def make_health_wellness():
    """Medical cross icon for Health & Wellness"""
    g = blank_grid()
    # Cross shape (red cross on white/light background)
    put_char(g, 5, 0, LOWER, LRD); put_char(g, 6, 0, LOWER, LRD)
    put_char(g, 5, 1, FULL, LRD); put_char(g, 6, 1, FULL, LRD)
    for c in range(3, 9):
        put_char(g, c, 2, FULL, LRD)
    for c in range(3, 9):
        put_char(g, c, 3, FULL, LRD)
    put_char(g, 5, 4, FULL, LRD); put_char(g, 6, 4, FULL, LRD)
    put_char(g, 5, 5, UPPER, LRD); put_char(g, 6, 5, UPPER, LRD)
    # Inner cross highlight
    put_char(g, 5, 2, FULL, RED); put_char(g, 6, 2, FULL, RED)
    put_char(g, 5, 3, FULL, RED); put_char(g, 6, 3, FULL, RED)
    return g

def make_travel_lifestyle():
    """Airplane icon for Travel & Lifestyle"""
    g = blank_grid()
    # Airplane body (pointing right)
    put_char(g, 2, 2, FULL, LGY); put_char(g, 3, 2, FULL, LGY); put_char(g, 4, 2, FULL, LGY)
    put_char(g, 5, 2, FULL, WHT); put_char(g, 6, 2, FULL, WHT); put_char(g, 7, 2, FULL, WHT)
    put_char(g, 8, 2, FULL, WHT); put_char(g, 9, 2, FULL, LGY); put_char(g, 10, 2, UPPER, LGY)
    # Wings
    put_char(g, 4, 1, LOWER, LBL); put_char(g, 5, 1, FULL, LBL); put_char(g, 6, 1, FULL, LBL); put_char(g, 7, 1, UPPER, LBL)
    put_char(g, 4, 3, UPPER, LBL); put_char(g, 5, 3, FULL, LBL); put_char(g, 6, 3, FULL, LBL); put_char(g, 7, 3, LOWER, LBL)
    # Tail fin
    put_char(g, 1, 1, LOWER, CYN); put_char(g, 2, 1, FULL, CYN)
    put_char(g, 1, 3, UPPER, CYN); put_char(g, 2, 3, FULL, CYN)
    # Windows
    put_char(g, 6, 2, FULL, CYN); put_char(g, 7, 2, FULL, CYN); put_char(g, 8, 2, FULL, CYN)
    # Contrail
    put_char(g, 3, 4, SHADE_L, LGY); put_char(g, 4, 4, SHADE_L, LGY)
    return g

def make_science_education():
    """Atom/orbital icon for Science & Education"""
    g = blank_grid()
    # Nucleus
    put_char(g, 5, 2, FULL, LCN); put_char(g, 6, 2, FULL, CYN)
    put_char(g, 5, 3, FULL, CYN); put_char(g, 6, 3, FULL, LCN)
    # Orbital ring 1 (horizontal ellipse)
    put_char(g, 2, 2, SHADE_M, LBL); put_char(g, 3, 2, SHADE_H, LBL)
    put_char(g, 8, 2, SHADE_H, LBL); put_char(g, 9, 2, SHADE_M, LBL)
    put_char(g, 2, 3, SHADE_M, LBL); put_char(g, 3, 3, SHADE_H, LBL)
    put_char(g, 8, 3, SHADE_H, LBL); put_char(g, 9, 3, SHADE_M, LBL)
    # Orbital ring 2 (diagonal hints)
    put_char(g, 3, 0, SHADE_L, LGN); put_char(g, 4, 1, SHADE_M, LGN)
    put_char(g, 7, 4, SHADE_M, LGN); put_char(g, 8, 5, SHADE_L, LGN)
    # Orbital ring 3
    put_char(g, 8, 0, SHADE_L, YEL); put_char(g, 7, 1, SHADE_M, YEL)
    put_char(g, 4, 4, SHADE_M, YEL); put_char(g, 3, 5, SHADE_L, YEL)
    # Electrons
    put_char(g, 1, 2, FULL, WHT)
    put_char(g, 10, 3, FULL, WHT)
    return g

def make_special_interests():
    """Star/compass icon for Special Interest & Hobbies"""
    g = blank_grid()
    # Star shape
    put_char(g, 5, 0, LOWER, YEL); put_char(g, 6, 0, LOWER, YEL)
    put_char(g, 4, 1, FULL, YEL); put_char(g, 5, 1, FULL, WHT); put_char(g, 6, 1, FULL, WHT); put_char(g, 7, 1, FULL, YEL)
    # Wide middle
    put_char(g, 1, 2, FULL, BRN); put_char(g, 2, 2, FULL, YEL); put_char(g, 3, 2, FULL, YEL)
    put_char(g, 4, 2, FULL, WHT); put_char(g, 5, 2, FULL, WHT); put_char(g, 6, 2, FULL, WHT); put_char(g, 7, 2, FULL, WHT)
    put_char(g, 8, 2, FULL, YEL); put_char(g, 9, 2, FULL, YEL); put_char(g, 10, 2, FULL, BRN)
    # Lower points
    put_char(g, 3, 3, FULL, YEL); put_char(g, 4, 3, FULL, WHT); put_char(g, 5, 3, FULL, WHT); put_char(g, 6, 3, FULL, WHT); put_char(g, 7, 3, FULL, WHT); put_char(g, 8, 3, FULL, YEL)
    put_char(g, 2, 4, UPPER, BRN); put_char(g, 3, 4, FULL, YEL); put_char(g, 4, 4, UPPER, YEL)
    put_char(g, 7, 4, UPPER, YEL); put_char(g, 8, 4, FULL, YEL); put_char(g, 9, 4, UPPER, BRN)
    return g

def make_arts_culture():
    """Paint palette icon for Arts & Culture"""
    g = blank_grid()
    # Palette shape (oval)
    put_char(g, 3, 0, LOWER, BRN); put_char(g, 4, 0, LOWER, BRN); put_char(g, 5, 0, LOWER, BRN); put_char(g, 6, 0, LOWER, BRN); put_char(g, 7, 0, LOWER, BRN); put_char(g, 8, 0, LOWER, BRN)
    put_char(g, 2, 1, FULL, BRN); put_char(g, 3, 1, FULL, BRN); put_char(g, 4, 1, FULL, BRN); put_char(g, 5, 1, FULL, BRN); put_char(g, 6, 1, FULL, BRN); put_char(g, 7, 1, FULL, BRN); put_char(g, 8, 1, FULL, BRN); put_char(g, 9, 1, FULL, BRN)
    put_char(g, 1, 2, FULL, BRN); put_char(g, 2, 2, FULL, BRN); put_char(g, 3, 2, FULL, BRN); put_char(g, 4, 2, FULL, BRN); put_char(g, 5, 2, FULL, BRN); put_char(g, 6, 2, FULL, BRN); put_char(g, 7, 2, FULL, BRN); put_char(g, 8, 2, FULL, BRN); put_char(g, 9, 2, FULL, BRN); put_char(g, 10, 2, FULL, BRN)
    put_char(g, 1, 3, FULL, BRN); put_char(g, 2, 3, FULL, BRN); put_char(g, 3, 3, FULL, BRN); put_char(g, 4, 3, FULL, BRN); put_char(g, 5, 3, FULL, BRN); put_char(g, 6, 3, FULL, BRN); put_char(g, 7, 3, FULL, BRN); put_char(g, 8, 3, FULL, BRN); put_char(g, 9, 3, FULL, BRN); put_char(g, 10, 3, FULL, BRN)
    put_char(g, 2, 4, UPPER, BRN); put_char(g, 3, 4, UPPER, BRN); put_char(g, 4, 4, UPPER, BRN); put_char(g, 5, 4, UPPER, BRN); put_char(g, 6, 4, UPPER, BRN); put_char(g, 7, 4, UPPER, BRN); put_char(g, 8, 4, UPPER, BRN); put_char(g, 9, 4, UPPER, BRN)
    # Paint blobs
    put_char(g, 3, 1, FULL, RED); put_char(g, 5, 1, FULL, BLU); put_char(g, 7, 1, FULL, YEL)
    put_char(g, 2, 2, FULL, LGN); put_char(g, 8, 3, FULL, LMG)
    # Thumb hole
    put_char(g, 4, 3, FULL, BLK); put_char(g, 5, 3, FULL, BLK)
    return g

def make_offbeat():
    """Question mark / weird face for Offbeat & Interesting"""
    g = blank_grid()
    # Question mark shape
    put_char(g, 4, 0, LOWER, LMG); put_char(g, 5, 0, LOWER, MAG); put_char(g, 6, 0, LOWER, MAG); put_char(g, 7, 0, LOWER, LMG)
    put_char(g, 3, 1, FULL, LMG); put_char(g, 4, 1, FULL, MAG); put_char(g, 7, 1, FULL, MAG); put_char(g, 8, 1, FULL, LMG)
    put_char(g, 6, 2, FULL, LMG); put_char(g, 7, 2, FULL, MAG)
    put_char(g, 5, 3, FULL, MAG); put_char(g, 6, 3, FULL, LMG)
    # Dot
    put_char(g, 5, 5, FULL, WHT); put_char(g, 6, 5, FULL, WHT)
    # Sparkles
    put_char(g, 1, 1, ord('*'), YEL); put_char(g, 10, 0, ord('*'), YEL)
    put_char(g, 2, 4, ord('+'), LCN); put_char(g, 9, 4, ord('+'), LCN)
    return g

# ═══════════════════════════════════════════════════════════════════════
# TIER 2: Continent icons (8)
# ═══════════════════════════════════════════════════════════════════════

def make_continent_global():
    """Globe icon for Global"""
    g = blank_grid()
    put_char(g, 3, 0, LOWER, LBL); put_char(g, 4, 0, LOWER, BLU); put_char(g, 5, 0, LOWER, LBL); put_char(g, 6, 0, LOWER, BLU); put_char(g, 7, 0, LOWER, LBL); put_char(g, 8, 0, LOWER, LBL)
    put_char(g, 2, 1, FULL, LBL); put_char(g, 3, 1, FULL, GRN); put_char(g, 4, 1, FULL, BLU); put_char(g, 5, 1, FULL, LGN); put_char(g, 6, 1, FULL, BLU); put_char(g, 7, 1, FULL, GRN); put_char(g, 8, 1, FULL, BLU); put_char(g, 9, 1, FULL, LBL)
    put_char(g, 1, 2, FULL, BLU); put_char(g, 2, 2, FULL, GRN); put_char(g, 3, 2, FULL, LGN); put_char(g, 4, 2, FULL, BLU); put_char(g, 5, 2, FULL, BLU); put_char(g, 6, 2, FULL, BLU); put_char(g, 7, 2, FULL, GRN); put_char(g, 8, 2, FULL, LGN); put_char(g, 9, 2, FULL, BLU); put_char(g, 10, 2, FULL, BLU)
    put_char(g, 1, 3, FULL, BLU); put_char(g, 2, 3, FULL, BLU); put_char(g, 3, 3, FULL, GRN); put_char(g, 4, 3, FULL, BLU); put_char(g, 5, 3, FULL, GRN); put_char(g, 6, 3, FULL, LGN); put_char(g, 7, 3, FULL, BLU); put_char(g, 8, 3, FULL, BLU); put_char(g, 9, 3, FULL, GRN); put_char(g, 10, 3, FULL, BLU)
    put_char(g, 2, 4, UPPER, BLU); put_char(g, 3, 4, UPPER, LBL); put_char(g, 4, 4, UPPER, BLU); put_char(g, 5, 4, UPPER, GRN); put_char(g, 6, 4, UPPER, BLU); put_char(g, 7, 4, UPPER, BLU); put_char(g, 8, 4, UPPER, LBL); put_char(g, 9, 4, UPPER, BLU)
    return g

def make_continent_africa():
    """Africa continent silhouette"""
    g = blank_grid()
    c1, c2 = GRN, LGN
    put_char(g, 5, 0, LOWER, c1); put_char(g, 6, 0, LOWER, c2); put_char(g, 7, 0, LOWER, c1)
    put_char(g, 5, 1, FULL, c2); put_char(g, 6, 1, FULL, c1); put_char(g, 7, 1, FULL, c2); put_char(g, 8, 1, FULL, c1)
    put_char(g, 4, 2, FULL, c1); put_char(g, 5, 2, FULL, YEL); put_char(g, 6, 2, FULL, c2); put_char(g, 7, 2, FULL, c1); put_char(g, 8, 2, FULL, c2)
    put_char(g, 4, 3, FULL, c2); put_char(g, 5, 3, FULL, c1); put_char(g, 6, 3, FULL, c2); put_char(g, 7, 3, FULL, c1)
    put_char(g, 5, 4, FULL, c1); put_char(g, 6, 4, FULL, c2)
    put_char(g, 5, 5, UPPER, c2); put_char(g, 6, 5, UPPER, c1)
    return g

def make_continent_asia():
    """Asia continent silhouette"""
    g = blank_grid()
    c1, c2 = RED, LRD
    put_char(g, 3, 0, LOWER, c1); put_char(g, 4, 0, LOWER, c2); put_char(g, 5, 0, LOWER, c1); put_char(g, 6, 0, LOWER, c2); put_char(g, 7, 0, LOWER, c1); put_char(g, 8, 0, LOWER, c2)
    put_char(g, 2, 1, FULL, c2); put_char(g, 3, 1, FULL, c1); put_char(g, 4, 1, FULL, c2); put_char(g, 5, 1, FULL, c1); put_char(g, 6, 1, FULL, c2); put_char(g, 7, 1, FULL, c1); put_char(g, 8, 1, FULL, c2); put_char(g, 9, 1, FULL, c1)
    put_char(g, 2, 2, FULL, c1); put_char(g, 3, 2, FULL, c2); put_char(g, 4, 2, FULL, c1); put_char(g, 5, 2, FULL, YEL); put_char(g, 6, 2, FULL, c1); put_char(g, 7, 2, FULL, c2); put_char(g, 8, 2, FULL, c1); put_char(g, 9, 2, FULL, c2); put_char(g, 10, 2, FULL, c1)
    put_char(g, 3, 3, FULL, c1); put_char(g, 4, 3, FULL, c2); put_char(g, 5, 3, FULL, c1); put_char(g, 6, 3, FULL, c2); put_char(g, 7, 3, FULL, c1); put_char(g, 8, 3, FULL, c2)
    put_char(g, 5, 4, UPPER, c2); put_char(g, 6, 4, UPPER, c1); put_char(g, 9, 3, FULL, c1); put_char(g, 10, 4, UPPER, c2)
    return g

def make_continent_europe():
    """Europe continent silhouette"""
    g = blank_grid()
    c1, c2 = BLU, LBL
    put_char(g, 4, 0, LOWER, c2); put_char(g, 5, 0, LOWER, c1); put_char(g, 6, 0, LOWER, c2)
    put_char(g, 3, 1, FULL, c1); put_char(g, 4, 1, FULL, c2); put_char(g, 5, 1, FULL, c1); put_char(g, 6, 1, FULL, c2); put_char(g, 7, 1, FULL, c1)
    put_char(g, 3, 2, FULL, c2); put_char(g, 4, 2, FULL, YEL); put_char(g, 5, 2, FULL, c1); put_char(g, 6, 2, FULL, c2); put_char(g, 7, 2, FULL, c1); put_char(g, 8, 2, FULL, c2)
    put_char(g, 4, 3, FULL, c1); put_char(g, 5, 3, FULL, c2); put_char(g, 6, 3, FULL, c1); put_char(g, 7, 3, FULL, c2)
    put_char(g, 4, 4, UPPER, c2); put_char(g, 5, 4, FULL, c1); put_char(g, 6, 4, UPPER, c2); put_char(g, 7, 4, UPPER, c1)
    put_char(g, 5, 4, UPPER, c1)
    return g

def make_continent_middle_east():
    """Middle East region silhouette"""
    g = blank_grid()
    c1, c2 = BRN, YEL
    put_char(g, 3, 0, LOWER, c1); put_char(g, 4, 0, LOWER, c2); put_char(g, 5, 0, LOWER, c1); put_char(g, 6, 0, LOWER, c2)
    put_char(g, 2, 1, FULL, c2); put_char(g, 3, 1, FULL, c1); put_char(g, 4, 1, FULL, c2); put_char(g, 5, 1, FULL, c1); put_char(g, 6, 1, FULL, c2); put_char(g, 7, 1, FULL, c1)
    put_char(g, 3, 2, FULL, c1); put_char(g, 4, 2, FULL, c2); put_char(g, 5, 2, FULL, c1); put_char(g, 6, 2, FULL, c2); put_char(g, 7, 2, FULL, c1); put_char(g, 8, 2, FULL, c2)
    put_char(g, 4, 3, FULL, c2); put_char(g, 5, 3, FULL, c1); put_char(g, 6, 3, FULL, c2); put_char(g, 7, 3, FULL, c1); put_char(g, 8, 3, FULL, c2); put_char(g, 9, 3, FULL, c1)
    put_char(g, 5, 4, UPPER, c1); put_char(g, 6, 4, UPPER, c2); put_char(g, 7, 4, UPPER, c1)
    # Crescent accent
    put_char(g, 10, 1, FULL, WHT)
    return g

def make_continent_north_america():
    """North America silhouette"""
    g = blank_grid()
    c1, c2 = GRN, LGN
    put_char(g, 3, 0, LOWER, c1); put_char(g, 4, 0, LOWER, c2); put_char(g, 5, 0, LOWER, c1); put_char(g, 6, 0, LOWER, c2); put_char(g, 7, 0, LOWER, c1)
    put_char(g, 2, 1, FULL, c2); put_char(g, 3, 1, FULL, c1); put_char(g, 4, 1, FULL, c2); put_char(g, 5, 1, FULL, c1); put_char(g, 6, 1, FULL, c2); put_char(g, 7, 1, FULL, c1); put_char(g, 8, 1, FULL, c2)
    put_char(g, 3, 2, FULL, c1); put_char(g, 4, 2, FULL, c2); put_char(g, 5, 2, FULL, BLU); put_char(g, 6, 2, FULL, c1); put_char(g, 7, 2, FULL, c2); put_char(g, 8, 2, FULL, c1); put_char(g, 9, 2, FULL, c2)
    put_char(g, 4, 3, FULL, c2); put_char(g, 5, 3, FULL, c1); put_char(g, 6, 3, FULL, c2); put_char(g, 7, 3, FULL, c1)
    put_char(g, 5, 4, FULL, c1); put_char(g, 6, 4, FULL, c2)
    put_char(g, 5, 5, UPPER, c2)
    return g

def make_continent_south_america():
    """South America silhouette"""
    g = blank_grid()
    c1, c2 = GRN, LGN
    put_char(g, 5, 0, LOWER, c1); put_char(g, 6, 0, LOWER, c2); put_char(g, 7, 0, LOWER, c1); put_char(g, 8, 0, LOWER, c2)
    put_char(g, 4, 1, FULL, c2); put_char(g, 5, 1, FULL, c1); put_char(g, 6, 1, FULL, YEL); put_char(g, 7, 1, FULL, c1); put_char(g, 8, 1, FULL, c2); put_char(g, 9, 1, FULL, c1)
    put_char(g, 4, 2, FULL, c1); put_char(g, 5, 2, FULL, c2); put_char(g, 6, 2, FULL, c1); put_char(g, 7, 2, FULL, c2); put_char(g, 8, 2, FULL, c1)
    put_char(g, 5, 3, FULL, c1); put_char(g, 6, 3, FULL, c2); put_char(g, 7, 3, FULL, c1)
    put_char(g, 5, 4, FULL, c2); put_char(g, 6, 4, FULL, c1)
    put_char(g, 5, 5, UPPER, c1)
    return g

def make_continent_oceania():
    """Oceania - Australia + islands"""
    g = blank_grid()
    c1, c2 = BRN, YEL
    # Australia
    put_char(g, 3, 2, FULL, c1); put_char(g, 4, 2, FULL, c2); put_char(g, 5, 2, FULL, c1); put_char(g, 6, 2, FULL, c2); put_char(g, 7, 2, FULL, c1)
    put_char(g, 3, 3, FULL, c2); put_char(g, 4, 3, FULL, c1); put_char(g, 5, 3, FULL, c2); put_char(g, 6, 3, FULL, c1); put_char(g, 7, 3, FULL, c2)
    put_char(g, 4, 4, UPPER, c1); put_char(g, 5, 4, UPPER, c2); put_char(g, 6, 4, UPPER, c1)
    # NZ
    put_char(g, 9, 3, FULL, LGN); put_char(g, 10, 4, FULL, GRN)
    # Islands
    put_char(g, 7, 0, FULL, GRN); put_char(g, 9, 1, FULL, LGN)
    # Water accent
    put_char(g, 1, 3, SHADE_L, BLU); put_char(g, 2, 4, SHADE_L, LBL)
    return g

# ═══════════════════════════════════════════════════════════════════════
# TIER 4: Subcategory icons (9)
# ═══════════════════════════════════════════════════════════════════════

def make_sub_local_news():
    """Megaphone/bullhorn for Local News"""
    g = blank_grid()
    # Horn mouth (opening right)
    put_char(g, 3, 1, FULL, LGY); put_char(g, 4, 1, FULL, LGY)
    put_char(g, 2, 2, FULL, DGY); put_char(g, 3, 2, FULL, WHT); put_char(g, 4, 2, FULL, WHT); put_char(g, 5, 2, FULL, LGY); put_char(g, 6, 2, FULL, LGY); put_char(g, 7, 2, FULL, LGY); put_char(g, 8, 2, FULL, LGY)
    put_char(g, 2, 3, FULL, DGY); put_char(g, 3, 3, FULL, LGY); put_char(g, 4, 3, FULL, LGY); put_char(g, 5, 3, FULL, DGY); put_char(g, 6, 3, FULL, DGY); put_char(g, 7, 3, FULL, DGY); put_char(g, 8, 3, FULL, DGY)
    put_char(g, 3, 4, UPPER, LGY); put_char(g, 4, 4, UPPER, LGY)
    # Sound waves
    put_char(g, 9, 1, SHADE_L, YEL); put_char(g, 10, 2, SHADE_M, YEL); put_char(g, 9, 4, SHADE_L, YEL)
    put_char(g, 10, 1, SHADE_L, LRD); put_char(g, 11, 2, SHADE_L, LRD); put_char(g, 10, 4, SHADE_L, LRD)
    return g

def make_sub_politics():
    """Capitol dome / ballot box for Politics & Society"""
    g = blank_grid()
    # Dome
    put_char(g, 5, 0, LOWER, WHT); put_char(g, 6, 0, LOWER, WHT)
    put_char(g, 4, 1, FULL, LGY); put_char(g, 5, 1, FULL, WHT); put_char(g, 6, 1, FULL, WHT); put_char(g, 7, 1, FULL, LGY)
    put_char(g, 3, 2, FULL, LGY); put_char(g, 4, 2, FULL, WHT); put_char(g, 5, 2, FULL, WHT); put_char(g, 6, 2, FULL, WHT); put_char(g, 7, 2, FULL, WHT); put_char(g, 8, 2, FULL, LGY)
    # Columns
    put_char(g, 3, 3, FULL, LGY); put_char(g, 5, 3, FULL, LGY); put_char(g, 6, 3, FULL, LGY); put_char(g, 8, 3, FULL, LGY)
    put_char(g, 3, 4, FULL, DGY); put_char(g, 5, 4, FULL, DGY); put_char(g, 6, 4, FULL, DGY); put_char(g, 8, 4, FULL, DGY)
    # Base
    for c in range(2, 10):
        put_char(g, c, 5, LOWER, LGY)
    return g

def make_sub_business():
    """Briefcase for Business & Economy"""
    g = blank_grid()
    # Handle
    put_char(g, 5, 0, LOWER, BRN); put_char(g, 6, 0, LOWER, BRN)
    # Body
    for c in range(2, 10):
        put_char(g, c, 1, LOWER, BRN)
    fill_rect(g, 2, 2, 8, 2, FULL, BRN, 0)
    # Clasp
    put_char(g, 5, 2, FULL, YEL); put_char(g, 6, 2, FULL, YEL)
    # Bottom
    for c in range(2, 10):
        put_char(g, c, 4, UPPER, BRN)
    return g

def make_sub_lifestyle():
    """Coffee cup for Lifestyle & Culture"""
    g = blank_grid()
    # Steam
    put_char(g, 4, 0, SHADE_L, LGY); put_char(g, 6, 0, SHADE_L, LGY)
    # Cup body
    fill_rect(g, 3, 1, 6, 3, FULL, BRN, 0)
    put_char(g, 4, 2, FULL, WHT, BRN)  # coffee surface
    put_char(g, 5, 2, FULL, WHT, BRN)
    put_char(g, 6, 2, FULL, WHT, BRN)
    put_char(g, 7, 2, FULL, WHT, BRN)
    # Handle
    put_char(g, 9, 2, FULL, BRN); put_char(g, 9, 3, UPPER, BRN)
    # Saucer
    for c in range(2, 10):
        put_char(g, c, 4, LOWER, LGY)
    return g

def make_sub_sports():
    """Soccer ball for Sports"""
    g = blank_grid()
    put_char(g, 4, 0, LOWER, WHT); put_char(g, 5, 0, LOWER, LGY); put_char(g, 6, 0, LOWER, WHT); put_char(g, 7, 0, LOWER, LGY)
    put_char(g, 3, 1, FULL, WHT); put_char(g, 4, 1, FULL, DGY); put_char(g, 5, 1, FULL, WHT); put_char(g, 6, 1, FULL, DGY); put_char(g, 7, 1, FULL, WHT); put_char(g, 8, 1, FULL, DGY)
    put_char(g, 3, 2, FULL, LGY); put_char(g, 4, 2, FULL, WHT); put_char(g, 5, 2, FULL, DGY); put_char(g, 6, 2, FULL, WHT); put_char(g, 7, 2, FULL, DGY); put_char(g, 8, 2, FULL, WHT)
    put_char(g, 3, 3, FULL, DGY); put_char(g, 4, 3, FULL, WHT); put_char(g, 5, 3, FULL, DGY); put_char(g, 6, 3, FULL, WHT); put_char(g, 7, 3, FULL, DGY); put_char(g, 8, 3, FULL, LGY)
    put_char(g, 4, 4, UPPER, WHT); put_char(g, 5, 4, UPPER, DGY); put_char(g, 6, 4, UPPER, WHT); put_char(g, 7, 4, UPPER, DGY)
    return g

def make_sub_science():
    """Microscope for Science & Technology"""
    g = blank_grid()
    # Eyepiece
    put_char(g, 5, 0, LOWER, LGY); put_char(g, 6, 0, LOWER, LGY)
    # Tube
    put_char(g, 6, 1, FULL, LGY); put_char(g, 6, 2, FULL, WHT)
    put_char(g, 7, 2, FULL, LGY)
    # Stage
    put_char(g, 5, 3, FULL, DGY); put_char(g, 6, 3, FULL, LCN); put_char(g, 7, 3, FULL, DGY); put_char(g, 8, 3, FULL, DGY)
    # Arm
    put_char(g, 5, 1, FULL, DGY); put_char(g, 5, 2, FULL, DGY)
    # Base
    put_char(g, 4, 4, FULL, DGY); put_char(g, 5, 4, FULL, DGY); put_char(g, 6, 4, FULL, DGY); put_char(g, 7, 4, FULL, DGY); put_char(g, 8, 4, FULL, DGY)
    for c in range(3, 10):
        put_char(g, c, 5, LOWER, LGY)
    return g

def make_sub_other():
    """Misc star for Other"""
    g = blank_grid()
    put_char(g, 5, 0, LOWER, DGY); put_char(g, 6, 0, LOWER, DGY)
    put_char(g, 5, 1, FULL, LGY); put_char(g, 6, 1, FULL, LGY)
    put_char(g, 3, 2, FULL, DGY); put_char(g, 4, 2, FULL, LGY); put_char(g, 5, 2, FULL, WHT); put_char(g, 6, 2, FULL, WHT); put_char(g, 7, 2, FULL, LGY); put_char(g, 8, 2, FULL, DGY)
    put_char(g, 4, 3, FULL, LGY); put_char(g, 5, 3, FULL, WHT); put_char(g, 6, 3, FULL, WHT); put_char(g, 7, 3, FULL, LGY)
    put_char(g, 3, 4, UPPER, DGY); put_char(g, 4, 4, FULL, LGY); put_char(g, 7, 4, FULL, LGY); put_char(g, 8, 4, UPPER, DGY)
    return g

def make_sub_world():
    """Mini globe for World / International"""
    g = blank_grid()
    put_char(g, 4, 0, LOWER, LBL); put_char(g, 5, 0, LOWER, BLU); put_char(g, 6, 0, LOWER, BLU); put_char(g, 7, 0, LOWER, LBL)
    put_char(g, 3, 1, FULL, BLU); put_char(g, 4, 1, FULL, GRN); put_char(g, 5, 1, FULL, BLU); put_char(g, 6, 1, FULL, GRN); put_char(g, 7, 1, FULL, BLU); put_char(g, 8, 1, FULL, BLU)
    put_char(g, 3, 2, FULL, BLU); put_char(g, 4, 2, FULL, BLU); put_char(g, 5, 2, FULL, GRN); put_char(g, 6, 2, FULL, BLU); put_char(g, 7, 2, FULL, GRN); put_char(g, 8, 2, FULL, BLU)
    put_char(g, 3, 3, FULL, BLU); put_char(g, 4, 3, FULL, GRN); put_char(g, 5, 3, FULL, BLU); put_char(g, 6, 3, FULL, BLU); put_char(g, 7, 3, FULL, GRN); put_char(g, 8, 3, FULL, BLU)
    put_char(g, 4, 4, UPPER, BLU); put_char(g, 5, 4, UPPER, LBL); put_char(g, 6, 4, UPPER, BLU); put_char(g, 7, 4, UPPER, BLU)
    return g

def make_sub_opinion():
    """Speech bubble for Opinion"""
    g = blank_grid()
    for c in range(2, 10):
        put_char(g, c, 0, LOWER, WHT)
    fill_rect(g, 1, 1, 10, 2, FULL, WHT, 0)
    for c in range(2, 10):
        put_char(g, c, 3, UPPER, WHT)
    # Tail
    put_char(g, 3, 3, FULL, WHT); put_char(g, 2, 4, FULL, WHT); put_char(g, 1, 5, UPPER, WHT)
    # Dots inside
    put_char(g, 4, 2, FULL, DGY); put_char(g, 6, 2, FULL, DGY); put_char(g, 8, 2, FULL, DGY)
    return g

# ═══════════════════════════════════════════════════════════════════════
# Registry
# ═══════════════════════════════════════════════════════════════════════

ICONS = {
    # Tier 1: Top-level categories
    'images':                  (1, make_images,              'Images'),
    'news_current_affairs':    (1, make_news_current_affairs, 'News & Current Affairs'),
    'technology':              (1, make_technology,           'Technology & Startups'),
    'business_finance':        (1, make_business_finance,     'Business & Finance'),
    'sports':                  (1, make_sports,               'Sports'),
    'entertainment':           (1, make_entertainment,        'Entertainment'),
    'health_wellness':         (1, make_health_wellness,      'Health & Wellness'),
    'travel_lifestyle':        (1, make_travel_lifestyle,     'Travel & Lifestyle'),
    'science_education':       (1, make_science_education,    'Science & Education'),
    'special_interests':       (1, make_special_interests,    'Special Interest'),
    'art_design':              (1, make_arts_culture,         'Arts & Culture'),
    'offbeat':                 (1, make_offbeat,              'Offbeat'),

    # Tier 2: Continents
    'cont_global':             (2, make_continent_global,         'Global'),
    'cont_africa':             (2, make_continent_africa,         'Africa'),
    'cont_asia':               (2, make_continent_asia,           'Asia'),
    'cont_europe':             (2, make_continent_europe,         'Europe'),
    'cont_middle_east':        (2, make_continent_middle_east,    'Middle East'),
    'cont_north_america':      (2, make_continent_north_america,  'North America'),
    'cont_south_america':      (2, make_continent_south_america,  'South America'),
    'cont_oceania':            (2, make_continent_oceania,        'Oceania'),

    # Tier 4: Subcategories
    'sub_local_news':          (4, make_sub_local_news,      'Local News'),
    'sub_politics':            (4, make_sub_politics,         'Politics & Society'),
    'sub_business':            (4, make_sub_business,         'Business & Economy'),
    'sub_lifestyle':           (4, make_sub_lifestyle,        'Lifestyle & Culture'),
    'sub_sports':              (4, make_sub_sports,           'Sports'),
    'sub_science':             (4, make_sub_science,          'Science & Tech'),
    'sub_other':               (4, make_sub_other,            'Other'),
    'sub_world':               (4, make_sub_world,            'World / International'),
    'sub_opinion':             (4, make_sub_opinion,          'Opinion'),
}

def preview_icon(name):
    if name not in ICONS:
        print(f"Unknown icon: {name}")
        return
    tier, func, title = ICONS[name]
    grid = func()
    cp437 = {0xDB:'█',0xDC:'▄',0xDF:'▀',0xB0:'░',0xB1:'▒',0xB2:'▓',0x20:' ',
             0xDA:'┌',0xBF:'┐',0xC0:'└',0xD9:'┘',0xC4:'─',0xB3:'│'}
    print(f"  [{name}] Tier {tier}: {title}")
    for row in grid:
        line = '  |'
        for ch, a in row:
            line += cp437.get(ch, chr(ch) if 32<=ch<127 else '?')
        line += '|'
        print(line)
    print()

def main():
    parser = argparse.ArgumentParser(description='Generate newsreader ANSI .bin icons')
    parser.add_argument('--tier', type=int, help='Generate only this tier')
    parser.add_argument('--list', action='store_true', help='List icons without generating')
    parser.add_argument('--preview', type=str, help='Preview a single icon by name')
    parser.add_argument('--preview-all', action='store_true', help='Preview all icons')
    args = parser.parse_args()

    if args.preview:
        preview_icon(args.preview)
        return

    if args.preview_all:
        for name in sorted(ICONS.keys(), key=lambda n: (ICONS[n][0], n)):
            preview_icon(name)
        return

    count = 0
    for name in sorted(ICONS.keys(), key=lambda n: (ICONS[n][0], n)):
        tier, func, title = ICONS[name]
        if args.tier is not None and tier != args.tier:
            continue
        filename = name + '.bin'
        if args.list:
            print(f"  Tier {tier}: {filename:30s} {title}")
        else:
            grid = func()
            path = write_bin(filename, grid, title=title)
            count += 1
            print(f"  [T{tier}] {filename}")

    if not args.list:
        print(f"\nGenerated {count} icons in {OUTDIR}")

if __name__ == '__main__':
    main()
