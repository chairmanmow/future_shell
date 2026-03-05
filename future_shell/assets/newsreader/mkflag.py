#!/usr/bin/env python3
"""mkflag.py - Generate ONE flag .bin file. Usage:
  python3 mkflag.py <outfile> <pattern> <colors...>
Patterns:
  vstripes c1 c2 c3       - 3 vertical stripes (4 cols each)
  hstripes c1 c2 c3       - 3 horizontal stripes (2 rows each)
  hbands c1 c2             - 2 horizontal bands (3 rows each)
  nordic bg cross          - nordic cross (shifted left)
  saltire bg cross         - diagonal cross
  fill c1                  - solid fill
  quadrant c1 c2 c3 c4    - 4 quadrants (TL TR BL BR)
  hstripes5 c1 c2 c3 c4 c5 - 5 stripes (varying height)
  chevron bg c1            - left chevron/triangle
Colors: 0-15 CGA palette
"""
import struct, sys, os
W, H = 12, 6
FB = 0xDB  # fullblock

def mkgrid():
    return [[0]*W for _ in range(H)]

def write_bin(filename, grid):
    data = bytearray(W*H*2)
    for r in range(H):
        for c in range(W):
            off = (r*W+c)*2
            data[off] = FB
            data[off+1] = grid[r][c] & 0xFF
    sauce = bytearray(128)
    sauce[0:7] = b'SAUCE00'
    name = os.path.basename(filename).replace('.bin','').encode('ascii','replace')[:35].ljust(35)
    sauce[7:42] = name
    struct.pack_into('<I', sauce, 90, W*H*2)
    sauce[94] = 5; sauce[95] = W//2
    struct.pack_into('<H', sauce, 96, W)
    struct.pack_into('<H', sauce, 98, H)
    with open(filename, 'wb') as f:
        f.write(data); f.write(b'\x1a'); f.write(bytes(sauce))

def attr(fg, bg=None):
    if bg is None: bg = fg
    return ((bg & 7) << 4) | (fg & 0xF)

def pat_fill(grid, colors):
    c = attr(int(colors[0]))
    for r in range(H):
        for x in range(W): grid[r][x] = c

def pat_vstripes(grid, colors):
    c1,c2,c3 = [attr(int(x)) for x in colors[:3]]
    for r in range(H):
        for x in range(W):
            grid[r][x] = c1 if x < 4 else (c2 if x < 8 else c3)

def pat_hstripes(grid, colors):
    c1,c2,c3 = [attr(int(x)) for x in colors[:3]]
    for r in range(H):
        for x in range(W):
            grid[r][x] = c1 if r < 2 else (c2 if r < 4 else c3)

def pat_hbands(grid, colors):
    c1,c2 = [attr(int(x)) for x in colors[:2]]
    for r in range(H):
        for x in range(W): grid[r][x] = c1 if r < 3 else c2

def pat_nordic(grid, colors):
    bg, cr = attr(int(colors[0])), attr(int(colors[1]))
    for r in range(H):
        for x in range(W):
            grid[r][x] = cr if (x in (3,4) or r in (2,3)) else bg

def pat_saltire(grid, colors):
    bg, cr = attr(int(colors[0])), attr(int(colors[1]))
    for r in range(H):
        for x in range(W):
            # diagonal: x/W ~ r/H
            rx = x * H; ry = r * W
            rx2 = (W-1-x) * H
            on_diag = abs(rx - ry) < W or abs(rx2 - ry) < W
            grid[r][x] = cr if on_diag else bg

def pat_quadrant(grid, colors):
    c1,c2,c3,c4 = [attr(int(x)) for x in colors[:4]]
    for r in range(H):
        for x in range(W):
            if r < 3: grid[r][x] = c1 if x < 6 else c2
            else:      grid[r][x] = c3 if x < 6 else c4

def pat_hstripes5(grid, colors):
    cs = [attr(int(x)) for x in colors[:5]]
    # 5 stripes: heights roughly 1,1,2,1,1 for 6 rows
    mapping = [0,1,2,2,3,4]
    for r in range(H):
        for x in range(W): grid[r][x] = cs[mapping[r]]

def pat_chevron(grid, colors):
    bg, ch = attr(int(colors[0])), attr(int(colors[1]))
    for r in range(H):
        for x in range(W):
            # triangle: x <= (H/2 - abs(r - H/2)) * W/H * 0.6
            mid = (H-1)/2.0
            reach = (1.0 - abs(r - mid)/mid) * 4  # max ~4 cols
            grid[r][x] = ch if x < reach else bg

PATTERNS = {
    'fill': pat_fill, 'vstripes': pat_vstripes, 'hstripes': pat_hstripes,
    'hbands': pat_hbands, 'nordic': pat_nordic, 'saltire': pat_saltire,
    'quadrant': pat_quadrant, 'hstripes5': pat_hstripes5, 'chevron': pat_chevron,
}

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print(__doc__); sys.exit(1)
    out = sys.argv[1]; pat = sys.argv[2]; cols = sys.argv[3:]
    grid = mkgrid()
    if pat not in PATTERNS:
        print(f'Unknown pattern: {pat}'); sys.exit(1)
    PATTERNS[pat](grid, cols)
    write_bin(out, grid)
    print(f'OK: {out}')
