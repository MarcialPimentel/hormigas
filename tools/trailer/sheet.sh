#!/bin/sh
# Contact sheet of a folder of jpgs: tools/trailer/sheet.sh <dir> <cols>x<rows>
cd "$1" && i=0 && for f in [0-9]*.jpg; do cp "$f" "_s$i.jpg"; i=$((i+1)); done && ffmpeg -loglevel error -y -i _s%d.jpg -vf "scale=800:-1,tile=$2" sheet.png; for f in _s*.jpg; do rm -- "$f"; done
