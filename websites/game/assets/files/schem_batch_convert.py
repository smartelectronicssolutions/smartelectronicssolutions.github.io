"""schem_batch_convert.py — drop into a folder with .nbt / .litematic files, run it.

Walks the script's own folder for Minecraft structure NBT files and Litematica
files, converts everything it can into Sponge-format .schem (or .schematic) and
writes the results into `_converted/`. Failures are logged to `_results.txt`.

Usage (drop the script into your folder of NBT files):
    python schem_batch_convert.py
    python schem_batch_convert.py --ext schematic
    python schem_batch_convert.py --input "C:\\path\\to\\nbts" --output "C:\\out"

No external dependencies. Python 3.8+.
"""
import argparse
import gzip
import math
import re
import struct
import sys
from pathlib import Path


# ──────────────────────────────────────────────────────────────────────
# NBT reader / writer
# ──────────────────────────────────────────────────────────────────────

class NbtReader:
    def __init__(self, data):
        self.data = data
        self.i = 0

    def read(self, n):
        if self.i + n > len(self.data):
            raise EOFError('truncated')
        out = self.data[self.i:self.i + n]
        self.i += n
        return out

    def u8(self):  return self.read(1)[0]
    def i8(self):  return struct.unpack('>b', self.read(1))[0]
    def i16(self): return struct.unpack('>h', self.read(2))[0]
    def i32(self): return struct.unpack('>i', self.read(4))[0]
    def i64(self): return struct.unpack('>q', self.read(8))[0]
    def f32(self): return struct.unpack('>f', self.read(4))[0]
    def f64(self): return struct.unpack('>d', self.read(8))[0]
    def string(self): return self.read(self.i16()).decode('utf-8', 'replace')

    def payload(self, tag):
        if tag == 1:  return self.i8()
        if tag == 2:  return self.i16()
        if tag == 3:  return self.i32()
        if tag == 4:  return self.i64()
        if tag == 5:  return self.f32()
        if tag == 6:  return self.f64()
        if tag == 7:  return self.read(self.i32())
        if tag == 8:  return self.string()
        if tag == 9:
            t = self.u8(); n = self.i32()
            return [self.payload(t) for _ in range(n)]
        if tag == 10:
            out = {}
            while True:
                c = self.u8()
                if c == 0:
                    return out
                name = self.string()
                out[name] = self.payload(c)
        if tag == 11: return [self.i32() for _ in range(self.i32())]
        if tag == 12: return [self.i64() for _ in range(self.i32())]
        raise ValueError(f'bad tag {tag}')

    def root(self):
        tag = self.u8()
        if tag != 10:
            raise ValueError('root is not a compound')
        name = self.string()
        return name, self.payload(tag)


class NbtWriter:
    def __init__(self):
        self.out = bytearray()

    def write(self, data):
        self.out.extend(data)

    def u8(self, v): self.write(bytes([v & 0xff]))
    def i16(self, v): self.write(struct.pack('>h', v))
    def i32(self, v): self.write(struct.pack('>i', v))

    def string(self, v):
        d = v.encode('utf-8'); self.i16(len(d)); self.write(d)

    def named(self, tag, name):
        self.u8(tag); self.string(name)

    def write_payload(self, tag, value):
        if tag == 1:   self.write(struct.pack('>b', value))
        elif tag == 2: self.i16(value)
        elif tag == 3: self.i32(value)
        elif tag == 7: self.i32(len(value)); self.write(value)
        elif tag == 8: self.string(value)
        elif tag == 9:
            t, vs = value
            self.u8(t); self.i32(len(vs))
            for it in vs: self.write_payload(t, it)
        elif tag == 10:
            for cn, ct, cv in value:
                self.named(ct, cn); self.write_payload(ct, cv)
            self.u8(0)
        elif tag == 11:
            self.i32(len(value))
            for it in value: self.i32(it)
        else:
            raise ValueError(f'unsupported tag {tag}')

    def root(self, name, children):
        self.named(10, name); self.write_payload(10, children)
        return bytes(self.out)


def parse_nbt(raw):
    if raw[:2] == b'\x1f\x8b':
        raw = gzip.decompress(raw)
    return NbtReader(raw).root()[1]


# ──────────────────────────────────────────────────────────────────────
# Conversion helpers
# ──────────────────────────────────────────────────────────────────────

def detect_format(raw, filename):
    n = filename.lower()
    if n.endswith('.litematic'):
        return 'litematic'
    if n.endswith('.nbt'):
        try:
            data = parse_nbt(raw)
        except Exception:
            return 'unknown'
        if 'Regions' in data and 'Metadata' in data:
            return 'litematic'
        if 'palette' in data and 'blocks' in data and 'size' in data:
            return 'vanilla_nbt'
    return 'unknown'


def block_state_string(entry):
    name = entry.get('Name', 'minecraft:air')
    props = entry.get('Properties')
    if isinstance(props, dict) and props:
        bits = ','.join(f'{k}={props[k]}' for k in sorted(props))
        return f'{name}[{bits}]'
    return name


def write_varints(values):
    out = bytearray()
    for v in values:
        v = int(v)
        while True:
            t = v & 0x7f; v >>= 7
            if v: out.append(t | 0x80)
            else: out.append(t); break
    return bytes(out)


def clean_basename(filename):
    base = Path(filename).stem
    name = re.sub(r'[^a-z0-9_+-]+', '_', base.lower())
    name = re.sub(r'_+', '_', name).strip('_')
    return name or 'structure'


def decode_vanilla(raw):
    data = parse_nbt(raw)
    size, palette, blocks = data.get('size'), data.get('palette'), data.get('blocks')
    if not (isinstance(size, list) and len(size) == 3
            and isinstance(palette, list) and isinstance(blocks, list)):
        raise ValueError('not a Minecraft structure NBT')
    w, h, l = [int(v) for v in size]
    if w <= 0 or h <= 0 or l <= 0:
        raise ValueError('invalid structure size')
    states = [block_state_string(p) for p in palette]
    if 'minecraft:air' not in states:
        states.insert(0, 'minecraft:air'); offset = 1
    else:
        offset = 0
    air = states.index('minecraft:air')
    indices = [air] * (w * h * l)
    for blk in blocks:
        pos, state = blk.get('pos'), blk.get('state')
        if not (isinstance(pos, list) and len(pos) == 3 and isinstance(state, int)):
            continue
        x, y, z = [int(v) for v in pos]
        if 0 <= x < w and 0 <= y < h and 0 <= z < l:
            indices[x + z * w + y * w * l] = state + offset
    return (w, h, l), states, indices, int(data.get('DataVersion', 3955))


def unpack_litematic(longs, bits, total):
    if bits <= 0:
        return [0] * total
    u = [(L & 0xFFFFFFFFFFFFFFFF) for L in longs]
    mask = (1 << bits) - 1
    out = []
    for i in range(total):
        bs = i * bits
        li = bs // 64
        bo = bs % 64
        if li >= len(u):
            out.append(0); continue
        if bo + bits <= 64:
            v = (u[li] >> bo) & mask
        else:
            rem = (bo + bits) - 64
            if li + 1 < len(u):
                v = ((u[li] >> bo) | ((u[li + 1] & ((1 << rem) - 1)) << (64 - bo))) & mask
            else:
                v = (u[li] >> bo) & mask
        out.append(v)
    return out


def decode_litematic(raw):
    data = parse_nbt(raw)
    regions = data.get('Regions')
    if not isinstance(regions, dict) or not regions:
        raise ValueError('no Regions in litematic')
    data_version = int(data.get('MinecraftDataVersion', 3955))
    info = []
    min_x = min_y = min_z = math.inf
    max_x = max_y = max_z = -math.inf
    for rname, r in regions.items():
        sz = r.get('Size') or {}; ps = r.get('Position') or {}
        sx, sy, sz_ = int(sz.get('x', 0)), int(sz.get('y', 0)), int(sz.get('z', 0))
        px, py, pz = int(ps.get('x', 0)), int(ps.get('y', 0)), int(ps.get('z', 0))
        x0 = px + (sx + 1 if sx < 0 else 0)
        y0 = py + (sy + 1 if sy < 0 else 0)
        z0 = pz + (sz_ + 1 if sz_ < 0 else 0)
        ax, ay, az = abs(sx), abs(sy), abs(sz_)
        if ax == 0 or ay == 0 or az == 0:
            continue
        info.append((rname, r, x0, y0, z0, ax, ay, az, sx, sy, sz_))
        min_x = min(min_x, x0); min_y = min(min_y, y0); min_z = min(min_z, z0)
        max_x = max(max_x, x0 + ax); max_y = max(max_y, y0 + ay); max_z = max(max_z, z0 + az)
    if not info:
        raise ValueError('all regions empty')
    w, h, l = int(max_x - min_x), int(max_y - min_y), int(max_z - min_z)
    if w <= 0 or h <= 0 or l <= 0:
        raise ValueError('invalid computed bounding box')
    states = ['minecraft:air']
    def pidx(n):
        if n in states: return states.index(n)
        states.append(n); return len(states) - 1
    air = 0
    indices = [air] * (w * h * l)
    for (rn, r, x0, y0, z0, ax, ay, az, sx, sy, sz_) in info:
        palette = r.get('BlockStatePalette'); bs = r.get('BlockStates')
        if not isinstance(palette, list) or not isinstance(bs, list):
            continue
        local = [block_state_string(p) for p in palette]
        l2u = [pidx(s) for s in local]
        bits = max(2, math.ceil(math.log2(max(2, len(palette)))))
        total = ax * ay * az
        unp = unpack_litematic(bs, bits, total)
        fx, fy, fz = sx < 0, sy < 0, sz_ < 0
        for i, v in enumerate(unp):
            if v < 0 or v >= len(l2u):
                continue
            uv = l2u[v]
            if uv == air:
                continue
            lx = i % ax
            lz = (i // ax) % az
            ly = i // (ax * az)
            if fx: lx = ax - 1 - lx
            if fy: ly = ay - 1 - ly
            if fz: lz = az - 1 - lz
            gx = (x0 - min_x) + lx; gy = (y0 - min_y) + ly; gz = (z0 - min_z) + lz
            if 0 <= gx < w and 0 <= gy < h and 0 <= gz < l:
                indices[gx + gz * w + gy * w * l] = uv
    return (w, h, l), states, indices, data_version


def write_sponge_schem(size, states, indices, data_version):
    w, h, l = size
    pchildren = [(s, 3, i) for i, s in enumerate(states)]
    root = [
        ('Version', 3, 2),
        ('DataVersion', 3, int(data_version)),
        ('Width', 2, w),
        ('Height', 2, h),
        ('Length', 2, l),
        ('Offset', 11, [0, 0, 0]),
        ('PaletteMax', 3, len(states)),
        ('Palette', 10, pchildren),
        ('BlockData', 7, write_varints(indices)),
        ('BlockEntities', 9, (10, [])),
        ('Entities', 9, (10, [])),
        ('Metadata', 10, [
            ('WEOriginX', 3, 0), ('WEOriginY', 3, 0), ('WEOriginZ', 3, 0),
        ]),
    ]
    return gzip.compress(NbtWriter().root('Schematic', root))


def convert_one(path, out_ext='schem'):
    raw = path.read_bytes()
    fmt = detect_format(raw, path.name)
    if fmt == 'unknown':
        raise ValueError('unrecognised format (need .nbt or .litematic)')
    if fmt == 'vanilla_nbt':
        size, states, indices, dv = decode_vanilla(raw)
    else:
        size, states, indices, dv = decode_litematic(raw)
    return write_sponge_schem(size, states, indices, dv), fmt, size


# ──────────────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n', 1)[0])
    parser.add_argument('--input', '-i', help='Input folder (default: folder of this script)')
    parser.add_argument('--output', '-o', help='Output folder (default: <input>/_converted)')
    parser.add_argument('--ext', '-e', choices=['schem', 'schematic'], default='schem',
                        help='Output extension (both are Sponge format)')
    args = parser.parse_args()

    script_dir = Path(__file__).resolve().parent
    in_dir = Path(args.input).resolve() if args.input else script_dir
    out_dir = Path(args.output).resolve() if args.output else (in_dir / '_converted')
    out_dir.mkdir(parents=True, exist_ok=True)

    candidates = sorted(
        [p for p in in_dir.iterdir()
         if p.is_file() and p.suffix.lower() in ('.nbt', '.litematic')
         and p.resolve() != Path(__file__).resolve()],
        key=lambda p: p.name.lower()
    )

    print(f'Input:  {in_dir}')
    print(f'Output: {out_dir}')
    print(f'Found:  {len(candidates)} candidate file(s)')
    print('-' * 60)

    converted, failed, used_names = [], [], {}
    for path in candidates:
        try:
            body, fmt, size = convert_one(path, args.ext)
            stem = clean_basename(path.name)
            base = f'{stem}.{args.ext}'
            used_names[base] = used_names.get(base, 0) + 1
            if used_names[base] > 1:
                base = f'{stem}_{used_names[base]-1}.{args.ext}'
            out_path = out_dir / base
            out_path.write_bytes(body)
            converted.append((path.name, base, fmt, size))
            print(f'  OK  {path.name}  ->  {base}  ({size[0]}x{size[1]}x{size[2]}, {fmt})')
        except Exception as e:
            failed.append((path.name, str(e)))
            print(f'  FAIL {path.name}  --  {e}')

    summary = out_dir / '_results.txt'
    with summary.open('w', encoding='utf-8') as f:
        f.write(f'Converted: {len(converted)}\n')
        f.write(f'Failed:    {len(failed)}\n\n')
        for src, dst, fmt, size in converted:
            f.write(f'OK  {src}  ->  {dst}  ({size[0]}x{size[1]}x{size[2]}, {fmt})\n')
        if failed:
            f.write('\nFailures:\n')
            for src, err in failed:
                f.write(f'FAIL {src}  --  {err}\n')

    print('-' * 60)
    print(f'Converted {len(converted)}, failed {len(failed)}. Log: {summary}')
    return 0 if converted or not candidates else 1


if __name__ == '__main__':
    sys.exit(main())
