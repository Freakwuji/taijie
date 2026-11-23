import sys
import qrcode
from qrcode.constants import ERROR_CORRECT_H

URL = "https://freakwuji.github.io/taijie/"
OUT = sys.argv[1] if len(sys.argv) > 1 else "qrcode.png"

qr = qrcode.QRCode(version=None, error_correction=ERROR_CORRECT_H, box_size=20, border=4)
qr.add_data(URL)
qr.make(fit=True)

img = qr.make_image(fill_color="black", back_color="white")
img.save(OUT)
print(f"URL        : {URL}")
print(f"saved      : {OUT}")
print(f"size       : {img.size[0]}x{img.size[1]} px")
print(f"modules    : {qr.modules_count}x{qr.modules_count}")
print(f"correction : H (30%, 可中间压 logo)")
