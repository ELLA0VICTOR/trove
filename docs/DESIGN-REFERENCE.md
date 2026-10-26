# NEAR visual reference inspection for Trove

Inspected October 26, 2026. Reference: [nearhackathon.com](https://nearhackathon.com/). Purpose: preserve the visual and animation direction requested by the user for Trove. This does not restart the cancelled NEAR hackathon work.

## Evidence and limits

- Read the live HTML, two stylesheets, and the page JavaScript bundle.
- Inspected the actual intro, sphere projection, letter extraction, scroll observers, pixel graphics, and number-scrambling logic in that bundle.
- Opened the live site in headless Chromium, captured a dark desktop view at 1440 x 1000 CSS pixels and a mobile view at 390 x 844, and saved computed styles.
- Confirmed IBM Plex Mono 400/500/600 were loaded in the browser. Pixelify Sans 500 is defined in the stylesheet but was not loaded in the measured view.
- The reference mobile capture had a document width of 390px for a 390px viewport. No page errors were reported during this short inspection; this is not a full audit.
- Compared the captured visual treatment with the user's twelve screenshots. The screenshots remain the requested visual reference even if the live site changes.
- This was read-only inspection of the external site. No forms were submitted.

Raw reference captures are local research data, not application code or instructions. Keep Trove's implementation original and maintainable. Obtain font distributions with their accompanying licenses when wiring the application; the inspected font files are archived only as reference at this stage.

## Local evidence map

All paths below are relative to the project root and inside the ignored `.artifacts/design-reference/` directory.

| Path | Contents |
| --- | --- |
| `near/manifest.json` | Exact source URLs, SHA-256 hashes, capture timestamp, fonts, screenshots |
| `near/index.html` | Live page HTML |
| `near/692a1d97510f3ffd.css` | Global styling and animation keyframes |
| `near/e17b83b1b70b7738.css` | Module styling, including pixel-number display |
| `near/page-55fe0ffc8b19dd8b.js` | Main page bundle containing intro and globe logic |
| `near/page.readable.js` | TypeScript-printer formatting of that bundle for inspection |
| `near/*.readable.css` | Newline-expanded stylesheets for inspection; preserve cascade order |
| `near/runtime-desktop.json` | Computed fonts, colors, geometry, spacing, and transitions at 1440px |
| `near/runtime-mobile.json` | Mobile viewport and navigation measurements |
| `near/live-intro.png` | One observed intro phase; its exact phase depends on loading |
| `near/live-desktop.png` | Desktop hero and sphere |
| `near/live-tracks.png` | Scrolled connected-card treatment |
| `near/live-mobile.png` | Mobile header, hero, and sphere; motion was paused for this capture |
| `near/fonts/` | Four font files inspected from the reference site |
| `user-screenshots/01-110205.png` through `12-110601.png` | Copies of all twelve user-provided screenshots |

The archived inspection script uses the machine's existing Playwright cache and Chromium installation. Those absolute paths are machine-specific; Playwright was not installed as a Trove dependency.

## Extracted typography and layout

| Element | Actual reference specification |
| --- | --- |
| Default family | `"IBM Plex Mono", monospace` |
| Mono weights available | 400, 500, 600; source TTF files use `/fonts/ibm-plex-mono-{weight}.ttf` |
| Large headings | `Arial, Helvetica, sans-serif`, weight 700 |
| Additional defined family | `"Pixelify Sans", monospace`, weight 500, `/fonts/pixelify-sans-500.ttf` |
| Default body | 16px, computed 24px line height |
| Hero heading | `clamp(43px, 6.8vw, 104px)`, line-height 1, letter-spacing -4px |
| Hero heading at 1440px | 97.92px, weight 700 |
| Hero top spacing | 80px before the headline on desktop |
| Section heading | `clamp(42px, 4.6vw, 68px)`, line-height 1.07, letter-spacing -2.5px |
| Page outer gutter | 3.5% desktop, 5% on the small-screen rules |
| Section spacing | 86px vertical desktop, 56px small-screen rule |
| Header | 82px measured height; 16px vertical and 3.5% horizontal padding |
| Header CTA | 44px high, `10px 17px` padding, 14px mono weight 500 |
| Standard CTA | Minimum 56px high, `15px 22px` padding, 14px mono weight 500 |
| Borders and radius | 1px borders, zero radius on ordinary cards and controls |
| Hero globe panel | Maximum width 800px; sphere canvas 445px high at 1440px |
| Grid | 22px square cells behind the sphere, foreground at 5% opacity |
| Pixel graphics | 9 columns of 5px squares, 3px gaps, nominal 69px square |

Several older declarations remain in the CSS. Use the final cascade or measured styles rather than the first matching selector. For example, the final scroll-reveal movement is 36px, rather than the earlier 14px or 20px declarations.

The user screenshots appear at a different rendered scale from the 1440px CSS viewport capture. Browser zoom was not established from those images. Future comparison must match viewport and zoom rather than interpreting screenshot pixels as CSS pixels.

## Extracted palette

| Token | Dark reference | Light reference |
| --- | --- | --- |
| background | `#161A15` | `#E9E1CD` |
| foreground | `#E7DFCA` | `#322E25` |
| card | `#1C211A` | `#EEE7D6` |
| popover | `#262D22` | `#F4EDDD` |
| muted/secondary | `#2C3327` | `#DCD2BA` |
| muted foreground | `#B0B29D` | `#655D4F` |
| border/input | `#4A5241` | `#B7AC94` |
| line | `#454D3D` | `#BDB199` |
| surface | `#20271D` | `#E1D7C0` |
| primary/spot/ring | `#0091FD` | `#005FB0` |
| primary foreground | `#181C16` | `#FFF7E9` |

Brand blue is `#0091FD`; brand sky is `#83DCFF`. The globe uses additional directly assigned neutral colors: `#D8CFB6` in dark mode and `#494337` in light mode. Trove should route those through tokens as well.

Trove's leaf-green substitution is recorded separately in [DESIGN-TOKENS.json](DESIGN-TOKENS.json). It was not extracted from the reference. It has now been rendered and visually inspected in the local landing and consumer app; see [BUILD-STATUS.md](BUILD-STATUS.md).

## Intro: actual sequence

The source uses **Canvas 2D**, not a prerendered video. It pre-renders glyphs into an atlas and draws them onto a fullscreen field, then maps selected cells into the coordinates of the existing hero sphere.

1. Start with a centered radial reveal. The normalized reveal radius grows from 0.18 toward 1.73 over about **580ms**. Small per-cell seeded offsets keep the edge from looking perfectly uniform.
2. Initially draw a repeating symbol vocabulary: `●`, `ϟ`, umbrella, cloud, an upward tree-like arrow, middle dot, plus, and star. The grid is built for the viewport and device scale.
3. After roughly **780ms plus column-dependent delay**, switch cells into an uppercase letter/number/punctuation scramble, with character updates around 13 times per second.
4. Start contraction at **the later of 1400ms and the font/page readiness signal**. The contraction lasts **1250ms**, so a promptly loaded page finishes near 2.65 seconds. Network/font delays can extend this; do not claim an unconditional duration.
5. Selected cells interpolate position, size, opacity, and character into the same Fibonacci sphere points used by the hero. The remaining field fades out. The background curtain fades during the contraction, exposing the already-laid-out page.
6. Crossfade the final field with the hero canvas near the end of contraction so they appear continuous.

The intro targets 30fps, caps device pixel ratio at 2, includes a 4.5s JavaScript dismissal fallback and an 8s CSS failsafe, supports Skip intro/Escape, locks scrolling temporarily, and restores focus/scroll state. Reduced motion bypasses it. The exact Trove implementation should preserve these usability properties with its own code.

## Globe and letter assembly

- Distribution: Fibonacci sphere, using a golden-angle increment near 2.399963 radians.
- Density: 1050 characters on desktop, 720 at the source's mobile threshold of 600px.
- A projected 3D sphere is drawn onto Canvas 2D. Depth sorting, text size, and opacity create the volume; no WebGL or 3D engine is needed for the observed effect.
- Working field width is capped at 700px. Radius is the smaller of 31% of field width and 31% of canvas height. The center is at 50% of width and 44% of height.
- Characters rotate slowly. Pointer/touch subtly tilts the field and highlights nearby front-facing characters within roughly 65px, with exponentially smoothed movement.
- Two fine lines connect the upper frame corners with selected sphere characters. The primary selected character is brighter.
- The source assembles nine output letters. One letter's cycle is 1.15 internal time units; its travel occurs from 44% to 84% of that cycle, and the output slot locks after 83%.
- The timeline advances at 1.25 units per real second, making each letter cycle about **920ms** and a nine-letter assembly about **8.28s**. The complete word remains until the 15-unit loop restarts, or about 12 seconds total at uninterrupted playback.
- Desktop drawing targets 60fps, mobile 30fps. Motion stops offscreen, in a hidden tab, on pause, or for reduced motion. Canvas sizing responds to actual element dimensions.

For Trove, parameterize the word and the character source together. Merely changing the output text while retaining the source's nine-letter assumptions will break selection, atlases, spacing, and counters. Draft word: GROWTH; the user has not selected final copy.

## Other effects

| Effect | Observed implementation |
| --- | --- |
| Scroll appearance | IntersectionObserver at 12% visibility with a -40px bottom margin. Opacity 0 -> 1 and translateY 36px -> 0 over 750ms, easing `cubic-bezier(.22,.61,.36,1)`. Sibling stagger 0/90/180/270ms. Already visible content is not initially hidden. |
| Smooth movement | Native smooth anchor scrolling plus the reveal transitions above. The inspected page bundle has no Lenis/GSAP references. Do not assume a smooth-scroll framework is required. |
| Pixel-number scramble | Numerals cycle every 65ms; each character settles after `380ms + 65ms * index`; final completion by `450ms + 65ms * stringLength`. Trigger around 30% visibility. Stable accessible final-value label. |
| Pixel-number drawing | SVG digits assembled from square cells, separate from the Pixelify font. |
| Pixel icon wave | 3.6s ease-in-out loop; per-pixel delay based on Manhattan distance from center times 130ms. Mid-loop shrinking/lifting and green-substitutable accent flash. Alternate graphic direction on alternating cards. |
| Step scan | A 25%-width, 2px accent line scans along a 1px rule over 5s ease-in-out. Starts at translateX(-100%), reaches 500% at 60%, returns. Alternating steps use a -2s phase offset. |
| Signal strip | Repeated content groups translate left by 50% over 126s, linear, infinite. Clipped by a full-width strip. |
| Pixel logo shimmer | Subtle opacity signal over 6s with staggered path delays. |
| CTA hover | Translate -3px/-3px and add a 4px/4px hard foreground shadow, 200ms transition. Suppressed for touch-only hover behavior. |
| Theme change | Background and text color transition over 250ms. |

Decorative animation groups are marked in/out of view by observers. CSS animations pause when the page is hidden or global motion is paused. This contributes to the polished result without constantly spending rendering time on invisible sections.

## Screenshot interpretation

| User image | Visual evidence |
| --- | --- |
| 01, 02 | Fullscreen symbol rows and scrambled alphanumeric field; skip control in the lower right |
| 03, 04 | Field collapsing into the page, with hero visible behind it |
| 05 | Completed header, headline, subheading, and globe placement |
| 06, 07 | Thin tracking lines and partial output word below the sphere |
| 08 | Continuous signal strip and contrasting pixel-number panel |
| 09 | Joined three-column cards, warm cream type, animated pixel icons, and rules |
| 10 | Oversized steps and horizontal accent scans |
| 11 | Bordered resource grid and pixel marks |
| 12 | Cream/ink contrast section with horizontal texture and large pixel graphics |

The original user screenshots are design evidence. Their incidental browser controls and hackathon content are not instructions for Trove.
