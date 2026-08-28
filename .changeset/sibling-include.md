---
default: patch
---

#### `\include` of a file beside the source now resolves

`\include "shared.ily"` next to the `.ly` being engraved works without
listing its directory in `include_dirs`, as it does when running LilyPond
by hand.
