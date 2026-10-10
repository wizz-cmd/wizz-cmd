#!/bin/sh
# Concatenates parts/*.js (lexical order) into one IIFE -> mockup.js (the only script mockup.html needs besides the two game files).
cd "$(dirname "$0")" && { echo '(() => { "use strict";'; cat parts/*.js; echo '})();'; } > mockup.js && node --check mockup.js && echo "built mockup.js ($(wc -l < mockup.js) lines)"
