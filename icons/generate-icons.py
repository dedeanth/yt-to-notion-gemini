"""
Icon generator for Chrome extension.
Generates valid PNG files at required dimensions (16x16, 48x48, 128x128)
using standard Python libraries (struct, zlib) without external dependencies.
"""

import os
import struct
import zlib

def create_png(filename, width, height, bg_color=(235, 33, 46, 255), fg_color=(255, 255, 255, 255)):
    raw_data = bytearray()
    for y in range(height):
        raw_data.append(0)  # Filter type None
        for x in range(width):
            dx = (x - width / 2.0) / (width / 2.0)
            dy = (y - height / 2.0) / (height / 2.0)
            nx = abs(dx)
            ny = abs(dy)
            
            # Rounded badge shape
            if max(nx, ny) <= 0.85:
                # Inside card: draw play triangle
                px = (x - width * 0.38) / (width * 0.35)
                py = (y - height * 0.5) / (height * 0.35)
                
                is_play = (0 <= px <= 1.0) and (abs(py) <= (1.0 - px) * 0.9)
                
                if is_play:
                    raw_data.extend(fg_color)
                else:
                    raw_data.extend(bg_color)
            else:
                # Transparent outside
                raw_data.extend((0, 0, 0, 0))
                
    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        crc = zlib.crc32(tag + data) & 0xffffffff
        return c + struct.pack('>I', crc)
        
    png = bytearray(b'\x89PNG\r\n\x1a\n')
    ihdr = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    png.extend(chunk(b'IHDR', ihdr))
    idat = zlib.compress(bytes(raw_data), 9)
    png.extend(chunk(b'IDAT', idat))
    png.extend(chunk(b'IEND', b''))
    
    os.makedirs(os.path.dirname(filename), exist_ok=True)
    with open(filename, 'wb') as f:
        f.write(png)
    print(f"Generated {filename} ({width}x{height})")

if __name__ == '__main__':
    base_dir = os.path.dirname(__file__)
    create_png(os.path.join(base_dir, 'icon-16.png'), 16, 16)
    create_png(os.path.join(base_dir, 'icon-48.png'), 48, 48)
    create_png(os.path.join(base_dir, 'icon-128.png'), 128, 128)
