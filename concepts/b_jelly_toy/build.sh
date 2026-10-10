#!/bin/sh
# Concatenates parts/*.js (in order) into mockup.js — the single script mockup.html loads.
cd "$(dirname "$0")" && cat parts/*.js > mockup.js && node --check mockup.js && echo "built mockup.js ($(wc -l < mockup.js) lines)"
