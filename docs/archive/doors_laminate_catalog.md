# Specification & Master Prompt: Interactive "Doors & Laminate" Web Catalog & Visualizer (Porta & Dysheme)

> **Context for Codex:** You are starting in an **empty workspace**. This document is your complete blueprint.  
> **Working Mode:** Enter **PLAN MODE** first. Do NOT start coding until you have presented a detailed architecture and phased plan based on this specification.  
> **Guiding Principle:** *"These are my thoughts and vision. You can deviate slightly from the implementation details if you have a cleaner, more robust technical route, provided you never drift away from the core goal: a high-density, mobile-first lookbook catalog with an interactive visualizer."*

---

## 1. What We Are Building & Why

### The Local Problem in Kosovo:
Companies in Kosovo that import and sell **interior doors (*dyer të brendshme*)** and **laminate/parquet (*laminat & parket*)** (showrooms in Prishtinë, Fushë Kosovë, Ferizaj, Prizren, Pejë) rely on heavy PDFs, cluttered Facebook/Instagram albums, or physical sample boards in their showroom.

When homeowners or diaspora clients (from Switzerland/Germany) visit or message on WhatsApp/Viber, the universal question they ask is:
> **"A shkon kjo derë me këtë laminat? A mos po bëhet korridori ose dhoma shumë e errët?"**

A simple product catalog alone is not enough to close deals quickly. But combining a **fast, high-density Lookbook catalog** with an interactive **"Studio e Kombinimit" (Door + Floor Matching Visualizer)** turns this into a high-converting sales tool for showroom owners.

### Who Uses It:
1. **The Showroom Owner / Sales Rep**: Walks a client through the catalog on an iPad or phone, switches to the interactive room, tests combinations live, and sends the quote to WhatsApp.
2. **The End Client / Diaspora Customer**: Opens a link on a 4G phone via WhatsApp/Viber, quickly scans through door styles and laminate collections, tests colors, and asks for a quote.
3. **The Developer (You)**: Can rebrand the entire site (logo, brand colors, contact details, product lines) for a new supplier in **15–20 minutes** before a pitch meeting.

---

## 2. Market Realities & Product Specs in Kosovo

Codex must configure realistic demo data reflecting the Kosovo construction and interior market:

### Interior Doors (*Dyer të Brendshme*):
* **Important:** These are interior room doors, **NOT exterior/front security doors**.
* **Standard Dimensions in Kosovo:**
  * **Living Room (*Dhoma e ditës*):** Standard **90 cm width × 200 cm height**.
  * **Bedrooms / Smaller Rooms (*Dhoma gjumi*):** Standard **80 cm width × 200 cm height**.
  * **Bathrooms / WC (*Banjo / WC*):** Standard **70 cm width × 200 cm height**.
  * Height is almost universally **200 cm** (with standard 205 cm rough opening).
* **Door Types & Features:**
  * **Standard frame doors (*Dyer me pervaza standard*):** MDF or solid wood core with melamine or CPL finish.
  * **Hidden-frame doors (*Dyer të fshehura / Filomuro*):** Flush-to-wall aluminum frame with invisible magnetic hinges (a massive architectural trend in Kosovo).
  * **Glass-accent doors (*Dyer me xham / profil alumini*):** Smoke glass with slim black aluminum framing.
* **Origins of Import:** Germany, Slovenia, Turkey, and China.

### Laminate & Parquet (*Laminat & Parket*):
* **Thickness (*Trashësia*):** 8 mm, 10 mm, 12 mm.
* **Abrasion / Usage Class (*Klasa e përdorimit*):** AC4 (Class 32 - residential/light commercial), AC5 (Class 33 - heavy commercial).
* **Bevel / Groove (*Fuga*):** 4V Groove (V-fugë) vs. Seamless flat.
* **Patterns:** Wide plank (*dërrasë e gjerë*), Natural wood grain, and **Chevron / Herringbone (*Ribë peshku*)**.
* **Origins of Import:** Germany (e.g., Egger, Kronotex, Classen), Austria, Turkey.

---

## 3. Product Vision: Lookbook, NOT a Corporate Website!

> [!WARNING]
> **Avoid "Corporate Agency Website Drift"!**
> Do NOT build a marketing agency website with massive 700px hero banners, 100px fonts, generic "Our Mission / Our Story" paragraphs, or multi-step gateways.
> 
> When a client opens this on their phone, **they are already in the catalog**. Furniture, doors, and flooring must be visible above the fold on the first screen.

### Layout Principles:
1. **Compact 56px Sticky Header:** Brand logo, title, quick link to "Studio e Kombinimit", language switcher (SQ/EN/DE), and saved favorites count.
2. **Category Filter Pills (Horizontal Thumb Scroll):**
   `[ Të gjitha ] [ Dyer të brendshme ] [ Dyer të fshehura ] [ Laminat ] [ Parket ] [ Pervaza / Lajsne ]`
3. **High-Density Mobile 2-Column Grid:**
   * 2 columns on mobile (approx. 4:3 aspect ratio), 3 columns on tablet, 4 columns on desktop.
   * Tight, legible typography (16–18px titles), compact room/category badge, subtle city/origin metadata, and heart icon for favorites.
   * At 390px viewport width, at least 4 to 6 products must be visible within the initial view without excessive scrolling.
4. **Persistent Sticky Bottom Bar (Mobile):**
   * `[ 📞 Thirr ]`
   * `[ 💬 Kërko ofertë · WhatsApp ]` (prominent primary button)
   * `[ 🟣 Viber ]`
   * Automatically prefills the message with the active product or visualizer combination and link.

---

## 4. The Core Feature: "STUDIO E KOMBINIMIT" (Door + Floor Visualizer)

### Benchmark Research:
Codex must study industry-leading visualizers, starting with the **Egger Floor Visualizer** (`https://myfloor.egger.com/`), **Roomvo**, and **Quick-Step Floor Explorer**. Notice how they:
* Keep room loading instant (no heavy 3D loading screens).
* Use real photographic room scenes with natural lighting, window reflections, and realistic shadows.
* Make surface switching instantaneous and thumb-friendly.
* Avoid WebGL / Three.js uncanny-valley rendering.

### Rendering Architecture (Canvas 2D / 2.5D Masked Luminance Compositing):
* **Do NOT use Three.js / WebGL.** Real-time 3D models on mobile look like video games and drain battery.
* **Use 2.5D Luminance-preserving Canvas Compositing:**
  * Start with a photorealistic, beautifully lit interior photo (or photorealistic ArchViz render). High quality images can be sourced or generated; licensing restrictions do not apply for this demo.
  * Define precise SVG/PNG masks for the switchable surfaces:
    1. **Door Leaf (*Fleta e derës*)**
    2. **Door Frame / Trim (*Shtoku dhe pervazat*)**
    3. **Floor (*Dyshemeja / Laminati*)**
  * Use the luminance math:
    $$\text{shade} = \text{clamp}\left(\frac{\text{lum}}{\text{baseline}}, 0.18, 1.65\right)$$
    $$\text{output} = (\text{texture} \lor \text{color}) \times \text{shade}$$
  * This preserves the original room's window light falloff, ambient occlusion, and floor reflections under the door frame.
  * **Floor Perspective:** For the laminate/parquet floor, ensure the floor texture accounts for perspective (planks recede into the distance) or use a neutral light-oak base floor where plank seams and natural angle perspective are preserved under the color/texture multiplication.

### The 2 Room Scenes:
1. **Scene 1: Dhoma e Ditës / Korridori (Living Room & Hallway)**
   * A modern, well-lit living area featuring a standard **90×200 cm interior door** and wide-plank laminate flooring with baseboard/skirting.
2. **Scene 2: Korridori / Dhoma e Gjumit (Modern Bedroom & Corridor)**
   * A sleek contemporary corridor featuring a **Hidden-Frame / Filomuro door** flush with the wall, paired with a Chevron/Herringbone parquet/laminate floor.

### Switchable Palettes in Visualizer:
* **Door Finishes (*Finiturat e Derës*):**
  * E bardhë mat (Matte white)
  * Kashmir (Warm beige/cashmere)
  * Lis natyral (Natural warm oak)
  * Arrë e errët (Dark walnut)
  * Dushk i hirtë (Modern grey oak)
  * Antracit (Anthracite / graphite)
  * Xham i errët me profil të zi (Smoke glass with black frame)
* **Floor Finishes (*Laminat & Parket*):**
  * Lis natyral 10mm (Natural Swiss oak)
  * Dushk fshatar me V-fugë (Rustic oak with 4V groove)
  * Arrë klasike 12mm (Classic dark walnut)
  * Hirtë skandinave (Scandinavian light grey)
  * Chevron / Peshk natyral (Natural herringbone parquet)
* **Door Frame & Skirting (*Pervazi dhe Lajsna*):**
  * Me ngjyrë të derës (Matches door)
  * Me ngjyrë të dyshemesë (Matches floor)
  * E zezë kontraste (Black accent)

### Visualizer Call-to-Action:
Displays the real-time combination name:
> **Kombinimi: Derë e Bardhë Mat + Laminat Lis Natyral 10mm AC5**
With a single tap on `[ 💬 Dërgo këtë kombinim në WhatsApp ]`, it opens WhatsApp with a prefilled message containing the exact finishes and shareable URL.

---

## 5. Technical Stack & Architecture

Borrow the proven, lightweight architecture from the Lookbook catalog:
* **Framework:** Next.js (App Router) + TypeScript, configured for pure **Static Export** (`output: 'export'` in `next.config.ts`).
* **Styling:** Tailwind CSS with minimal, responsive CSS variables.
* **Performance:** Blazing fast 4G loading, WebP/AVIF optimized images, zero client-side database, zero external runtime dependencies.
* **Internationalization:** Multi-locale routing for `/sq`, `/en`, `/de` with automatic translation fallback to Albanian (`sq`).
* **Rebranding Engine:** A single central `brand/brand.json` configuration file:
  ```json
  {
    "companyName": "Porta & Dysheme",
    "tagline": {
      "sq": "Dyer të brendshme dhe dysheme cilësore në Kosovë",
      "en": "Quality interior doors and flooring in Kosovo",
      "de": "Qualitätstüren und Böden im Kosovo"
    },
    "colors": { "primary": "#202421", "accent": "#A37D52", "background": "#F7F5F0" },
    "contact": { "phone": "+383 44 000 000", "whatsapp": "+38344000000", "viber": "+38344000000" },
    "demoMode": true
  }
  ```
* **Offline & Demo Safeguards:** When `demoMode: true`, all pages include `noindex, nofollow`, no real messages are broadcast, and sample data is clearly attributed.

---

## 6. Phased Execution Rules for Codex

Codex must proceed in **discrete, verifiable phases**. After completing each phase, Codex must stop and produce a brief status report containing:
1. **What was implemented** in that phase.
2. **How to run the project** (exact commands).
3. **What and how to test** (automated tests and browser checks).
4. **What the next phase is.**

### Phase Breakdown:

* **Phase 1: Project Skeleton & Foundation**
  * Next.js App Router setup with static export, TypeScript, Tailwind CSS, Fontsource fonts.
  * Central `brand/brand.json` schema and locale routing (`/sq`, `/en`, `/de`).
  * Layout, compact header, sticky bottom mobile bar, and theme variables.

* **Phase 2: Lookbook Feed & Catalog Grid**
  * Category filter pills (`Të gjitha`, `Dyer`, `Laminat`, `Parket`, etc.).
  * High-density 2-column mobile grid, 3/4 columns on desktop.
  * Product cards with room/category badges, dimension tags (e.g. 90×200cm, 10mm AC5), favorites heart, and zero-reload URL filter state.

* **Phase 3: Product Detail Pages**
  * Clean vertical photo stack with PhotoSwipe fullscreen zoom.
  * Technical specifications table tailored to doors and floors (Dimensions, Origin Germany/Turkey, Thickness, AC Rating, Frame type).
  * Inquiry button sending prefilled WhatsApp/Viber messages.
  * Related products section.

* **Phase 4: Studio e Kombinimit (Interactive Visualizer)**
  * Lightweight 2D canvas compositor supporting 2 scenes (Scene 1: Standard door + laminate; Scene 2: Filomuro hidden door + chevron floor).
  * Layer masks for door, frame, and flooring.
  * Realistic lighting/shadow preservation and perspective handling.
  * Live combination title + direct WhatsApp lead generation.

* **Phase 5: Content, Polish & Verification**
  * Populate realistic demo catalog with 10–14 real interior door and laminate/parquet collections.
  * Verify 100% static export, responsive sizing (320px, 390px, 768px, 1280px), automated test suite, and generate verification report.
