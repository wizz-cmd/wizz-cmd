#!/usr/bin/env bash
# FIZZ & POP build: src/[0-9][0-9]_*.js (lexical order) -> dist/bundle.js -> dist/fizzpop.html (+ dist/fizzpop.artifact.html fragment)
# Usage: ./build.sh            (works from any cwd)
# Exit code is non-zero on any failure (missing files, syntax error, bad template).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$ROOT/src"
DIST="$ROOT/dist"
TEMPLATE="$SRC/template.html"
BUNDLE="$DIST/bundle.js"
OUT="$DIST/fizzpop.html"
MARKER='<!--@@SCRIPTS@@-->'

die() { echo "build.sh: ERROR: $*" >&2; exit 1; }

[[ -f "$TEMPLATE" ]] || die "missing template: $TEMPLATE"
grep -qF -- "$MARKER" "$TEMPLATE" || die "template has no $MARKER line"

# Collect module files. LC_ALL=C makes the sort order locale independent.
shopt -s nullglob
FILES=()
while IFS= read -r f; do
  if [[ -n "$f" ]]; then FILES+=("$f"); fi
done < <(printf '%s\n' "$SRC"/[0-9][0-9]_*.js | LC_ALL=C sort)
shopt -u nullglob
[[ ${#FILES[@]} -gt 0 ]] || die "no src/NN_*.js files found"

mkdir -p "$DIST"

# Concatenate, each module separated by a banner comment; wrap in strict-mode IIFE.
{
  echo '(() => { "use strict";'
  for f in "${FILES[@]}"; do
    echo
    echo "/* ===== $(basename "$f") ===== */"
    cat "$f"
    echo
  done
  echo '})();'
} > "$BUNDLE"

node --check "$BUNDLE" || die "syntax check failed for $BUNDLE"

# A literal </script> inside the JS would terminate the inline script element early.
if grep -qi -- '</script' "$BUNDLE"; then
  die "bundle contains a literal '</script' sequence; write it as '<\\/script' in the source"
fi

if grep -qF -- '<!--' "$BUNDLE"; then
  echo "build.sh: WARNING: bundle contains '<!--' (HTML parsers treat it specially inside <script>)" >&2
fi

# Inject the bundle into the template, replacing the marker line. The JS is read from a
# file by perl (never interpolated into a regex/replacement), so $ & \ etc. are safe.
BUNDLE_PATH="$BUNDLE" TEMPLATE_PATH="$TEMPLATE" OUT_PATH="$OUT" MARKER="$MARKER" perl -e '
  use strict; use warnings;
  my ($tpl, $bun, $out, $marker) = @ENV{qw(TEMPLATE_PATH BUNDLE_PATH OUT_PATH MARKER)};
  local $/ = undef;
  open(my $bh, "<:raw", $bun) or die "cannot read $bun: $!"; my $js = <$bh>; close $bh;
  open(my $th, "<:raw", $tpl) or die "cannot read $tpl: $!"; my $html = <$th>; close $th;
  my $idx = index($html, $marker);
  die "marker not found\n" if $idx < 0;
  die "marker appears more than once\n" if index($html, $marker, $idx + 1) >= 0;
  # Replace the whole line that contains the marker with an inline script element.
  my $ls = rindex($html, "\n", $idx); $ls = ($ls < 0) ? 0 : $ls + 1;
  my $le = index($html, "\n", $idx);  $le = ($le < 0) ? length($html) : $le;
  my $indent = substr($html, $ls, $idx - $ls);
  $indent = "" if $indent =~ /\S/;
  substr($html, $ls, $le - $ls) = $indent . "<script>\n" . $js . "</script>";
  open(my $oh, ">:raw", $out) or die "cannot write $out: $!"; print $oh $html; close $oh;
' || die "injection failed"

[[ -s "$OUT" ]] || die "output is empty: $OUT"

# Artifact fragment (FIXPLAN sec. 0): <title>, every <style> block, the body markup and the script -- no doctype / html /
# head / body tags, because the Artifact host wraps the page in its own skeleton. Cut from the TEMPLATE (never from the
# finished page, whose JS could contain tag-like text), then the same script injection as above.
FRAGMENT="$DIST/fizzpop.artifact.html"
BUNDLE_PATH="$BUNDLE" TEMPLATE_PATH="$TEMPLATE" OUT_PATH="$FRAGMENT.tmp.$$" MARKER="$MARKER" perl -e '
  use strict; use warnings;
  my ($tpl, $bun, $out, $marker) = @ENV{qw(TEMPLATE_PATH BUNDLE_PATH OUT_PATH MARKER)};
  local $/ = undef;
  open(my $bh, "<:raw", $bun) or die "cannot read $bun: $!"; my $js = <$bh>; close $bh;
  open(my $th, "<:raw", $tpl) or die "cannot read $tpl: $!"; my $html = <$th>; close $th;
  my ($title) = $html =~ m{(<title>.*?</title>)}s or die "template has no <title>\n";
  my @styles = $html =~ m{(<style\b.*?</style>)}sg;
  die "template has no <style> block\n" unless @styles;
  my ($body) = $html =~ m{<body[^>]*>(.*)</body>}s or die "template has no <body>\n";
  my $idx = index($body, $marker);
  die "marker not found in the body\n" if $idx < 0;
  my $ls = rindex($body, "\n", $idx); $ls = ($ls < 0) ? 0 : $ls + 1;
  my $le = index($body, "\n", $idx);  $le = ($le < 0) ? length($body) : $le;
  substr($body, $ls, $le - $ls) = "<script>\n" . $js . "</script>";
  $body =~ s/^\s+//;
  open(my $oh, ">:raw", $out) or die "cannot write $out: $!";
  print $oh $title, "\n", join("\n", @styles), "\n", $body, "\n";
  close $oh;
' || die "artifact fragment failed"
[[ -s "$FRAGMENT.tmp.$$" ]] || die "artifact fragment is empty"
mv -f "$FRAGMENT.tmp.$$" "$FRAGMENT"

SIZE=$(wc -c < "$OUT" | tr -d ' ')
FSIZE=$(wc -c < "$FRAGMENT" | tr -d ' ')
echo "build.sh: OK  ${#FILES[@]} modules -> $OUT  ($SIZE bytes, $(( (SIZE + 1023) / 1024 )) KB); artifact fragment -> $FRAGMENT ($FSIZE bytes)"
