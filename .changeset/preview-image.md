---
default: minor
---

#### The preview is returned inline as an image

`engrave_file` and `engrave_code` now attach the cropped preview PNG to the
tool result as an `image` content block, next to the JSON. Clients that
render tool images — Claude Desktop, Claude Code — show the engraving
inline, and the model can look at it without reading a file; Claude Desktop
had no way to see the result before. The file paths in `outputs` and
`previewPng` are unchanged. Pass `preview: false` to skip the image, e.g.
when engraving many files in a row.
