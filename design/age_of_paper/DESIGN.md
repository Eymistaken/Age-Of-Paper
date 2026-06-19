---
name: Age of Paper
colors:
  surface: '#15130f'
  surface-dim: '#15130f'
  surface-bright: '#3c3934'
  surface-container-lowest: '#100e0a'
  surface-container-low: '#1d1b17'
  surface-container: '#221f1b'
  surface-container-high: '#2c2a25'
  surface-container-highest: '#373430'
  on-surface: '#e8e1da'
  on-surface-variant: '#d2c5b1'
  inverse-surface: '#e8e1da'
  inverse-on-surface: '#33302b'
  outline: '#9b8f7d'
  outline-variant: '#4e4637'
  surface-tint: '#f0bf5c'
  primary: '#f0bf5c'
  on-primary: '#412d00'
  primary-container: '#c89b3c'
  on-primary-container: '#4b3500'
  inverse-primary: '#7b5900'
  secondary: '#eac087'
  on-secondary: '#442b01'
  secondary-container: '#5e4114'
  on-secondary-container: '#d7ae77'
  tertiary: '#d8c593'
  on-tertiary: '#3a2f0b'
  tertiary-container: '#b2a172'
  on-tertiary-container: '#433812'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffdea4'
  primary-fixed-dim: '#f0bf5c'
  on-primary-fixed: '#261900'
  on-primary-fixed-variant: '#5d4200'
  secondary-fixed: '#ffddb3'
  secondary-fixed-dim: '#eac087'
  on-secondary-fixed: '#291800'
  on-secondary-fixed-variant: '#5e4114'
  tertiary-fixed: '#f5e1ad'
  tertiary-fixed-dim: '#d8c593'
  on-tertiary-fixed: '#231b00'
  on-tertiary-fixed-variant: '#52461f'
  background: '#15130f'
  on-background: '#e8e1da'
  surface-variant: '#373430'
typography:
  display-lg:
    fontFamily: Libre Caslon Text
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Libre Caslon Text
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
  headline-lg-mobile:
    fontFamily: Libre Caslon Text
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  headline-md:
    fontFamily: Libre Caslon Text
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Work Sans
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Work Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-caps:
    fontFamily: Source Serif 4
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.1em
  stats-num:
    fontFamily: Work Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 24px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 8px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 40px
  panel-padding: 24px
---

## Brand & Style

The design system is rooted in the "Commander’s Desk" aesthetic—a somber, tactical atmosphere where every UI element feels like a physical artifact from a 19th-century war room. The visual language balances the grit of a field campaign with the elegance of high-stakes diplomacy. 

The style is **Tactile and Skeuomorphic**, emphasizing physical materials: heavy parchment, cold-pressed paper, stained ink, and weathered bronze. It avoids all modern artifice (no glows, no blurs, no transparency) in favor of opacity and structural weight. The emotional response should be one of gravity and intellectual focus, evoking the quiet tension before a decisive battle.

## Colors

The palette is anchored by a deep, "Void-Black" charcoal representing the mahogany desk surface, contrasted against the warm, organic tones of aged parchment. 

- **Primary & Secondary:** Gold and Bronze are used for structural framing, metal clasps, and high-importance interactive elements.
- **Surface Strategy:** Use `#242016` for UI panels and containers to create a subtle lift from the background. 
- **Functional Accents:** Status colors are desaturated and matte, resembling dried ink or pigments rather than digital lights. 
- **Player Colors:** These should be applied with an "ink-bleed" texture or matte finish, never vibrant or luminous.

## Typography

The typography system relies on a sharp contrast between **Libre Caslon Text** for narrative and structural hierarchy—reminiscent of imperial decrees and map legends—and **Work Sans** for tactical data.

- **Headings:** Should always be rendered in a slightly higher contrast than body text to mimic fresh ink.
- **Body & Numbers:** Legibility is paramount for strategy. Numbers (resources, troop counts) use a clean sans-serif to ensure no ambiguity during rapid calculation.
- **Labels:** Small caps with tracking (letter-spacing) are used for "metadata" or map annotations, providing a scholarly, organized feel.

## Layout & Spacing

The layout philosophy follows a **Fixed Grid** model, simulating the physical constraints of a map or a tabletop. 

- **Desktop:** A structured 12-column grid with wide margins. Information is grouped into "folios" or "ledger" panels.
- **Padding:** Generous internal padding (24px+) within panels ensures the decorative bronze borders do not crowd the content.
- **Mobile:** Elements stack vertically, but maintain the "panel" aesthetic. The viewport is treated as a "zoomed-in" view of a larger tactical map.

## Elevation & Depth

In this design system, depth is achieved through **Material Stacking** and **Tonal Layers** rather than light-source shadows.

- **Level 0:** The mahogany desk (`#15130F`).
- **Level 1:** Secondary UI panels (`#242016`) with a 1px bronze border.
- **Level 2:** Paper/Parchment elements (`#CDBB8A`) laid "on top" of the panels.
- **Borders:** Instead of soft shadows, use 1px or 2px solid strokes (`#7A5A2B`) to define edges. To simulate depth, use "inner-bevel" lines for recessed areas (like input fields) and "outer-border" lines for raised elements (like tokens).

## Shapes

The shape language is primarily **Rectilinear with Minor Softening**. 

- **Panels & Cards:** Use 4px corner radii (Soft) to mimic hand-cut paper or wood-framed boards.
- **Tokens & Seals:** Interactive "action" buttons take a circular or wax-seal shape.
- **Borders:** Use double-line borders for primary containers to evoke 19th-century drafting styles.

## Components

- **Buttons (Action):** Designed to look like Wax Seals. Circular, deep red (`#9E2F2F`) or gold (`#C89B3C`), with a subtle debossed icon in the center.
- **Buttons (Menu):** Rectangular tokens with a 2px bronze border and a parchment-colored background. On hover, the background darkens slightly like wet paper.
- **Cards:** Heavy parchment background (`#CDBB8A`) with an inner 1px border. Use "torn edge" masks or textures for stylistic flair where possible.
- **Input Fields:** Recessed rectangles using the darker `#242016` background with a bottom-only border in bronze.
- **Lists:** Items separated by thin, faded ink lines (`#9C9275`) with a serif bullet point or a tactical icon (e.g., a small dagger or flag).
- **Tooltips:** Look like handwritten sticky notes or small scraps of paper pinned to the UI.
- **Progress Bars:** Represented as "filling ink bottles" or a horizontal bronze bar that fills with solid matte color.