# How Finloraq works — homepage 3D section

Shown on its own page, `/how-it-works` (section id `#how-it-works`). It used to sit under the homepage hero; it moved out to keep the homepage short. It has to get one idea across in a few seconds:
**drop anything → Finloraq understands → records → analyzes → acts → responds.**

## Files

| File | What it does |
| --- | --- |
| `content.ts` | All copy: stages, phases, modules, and the five **DEMO** sample documents. Edit words here. |
| `inspect.ts` | Looks at a file a visitor drops, **inside their browser only** (format, size, PDF pages, image size, CSV columns/rows, email subject/sender, WhatsApp export lines), then guesses the document type. `classify()` is pure and has unit tests. |
| `markup.ts` | The section's HTML (rendered on the server, so it is indexable and works without JS) plus its scoped CSS. |
| `controller.ts` | Adds the interactive parts: the step rail, pause and overview buttons, drag and drop, sample chips, and the trace panel. It works without any framework. |
| `scene.ts` | The 3D story: layout (landscape and portrait), timeline, camera, labels projected into HTML, and hover and click on the input cards. |
| `gl/*` | A small WebGL2 renderer built for this scene (≈20 KB gzipped once minified), plus math helpers and the texture atlas for the card faces. There are no image assets and no dependencies. |
| `HowFinloraqWorks.tsx` | The React wrapper. It renders the markup and loads `controller` as a separate chunk after hydration. |

## Performance

- Nothing 3D loads before hydration. The scene starts only when the section is within 200px of the viewport, and it stops when the section is off-screen or the tab is hidden.
- Everything is instanced, so a frame takes about 40 draw calls. The CPU cost per frame is about 0.3 ms.
- Device pixel ratio is capped at 2 (1.5 on touch devices). If frames stay slow, the renderer lowers the resolution by itself.

## Accessibility and fallbacks

- `prefers-reduced-motion`: the scene doesn't animate. It shows the finished route for a sample, and the demo reveals every step at once.
- No WebGL2, or the context is lost: the section shows a styled six-stage outline instead. The demo and rail still work.
- The canvas and 3D labels are `aria-hidden`. The ordered stage outline and a polite live summary carry the meaning for screen readers.
- A Pause control is included because the tour moves for longer than 5 s (WCAG 2.2.2).

## Honesty rules

- Sample data uses fictional parties (`Demo … LLC`) and `DEMO-` references. Every place it appears is labelled **Demo data**.
- For a visitor's own file, the section only shows facts it really read. It never makes up extracted values: posting templates show account names, and amounts say "from doc".
- The intelligence bars have no numbers on purpose.

## Editing

- To change copy or samples, edit `content.ts`. The tests check that every sample posting balances.
- To change timing, edit `T` in `scene.ts`. The rail and the trace panel follow it automatically.
- To change the layout, edit `buildLayout()` in `scene.ts`, which has separate landscape and portrait branches.
