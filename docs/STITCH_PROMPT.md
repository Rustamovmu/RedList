# Google Stitch prompt pack: Wildward "Signal" redesign (all screens)

## How to use (read this first, so Stitch does not fail)

1. **New Web project.** If an earlier project kept failing, start a fresh one; failures can stick to one project.
2. **One block = one generation = one screen.** Paste a block, wait until it finishes, then paste the next. Never paste two blocks at once.
3. **Start without the image.** Paste Prompt 0 as text only. If it works and you want closer styling, ask a follow-up with the screenshot attached: *"Match the palette, type and layout feel of this image. Do not copy its pictures, logo or words."*
4. **Follow-ups** (the short prompts under each screen) are edits or variants of the screen you just made. Send them one at a time.
5. **If you see "Something unexpected happened":** wait a minute and retry once; then try the same prompt in a new project; then check whether you have used up your monthly generations (Experimental mode has a lower limit than Standard).
6. Every block starts with a **STYLE** line. Keep it; Stitch drifts over many screens.

Each block is kept short on purpose (most under 2,000 characters). Every screen and state exists in the real app (`../RedList-frontend`). Numbers marked `[sample]` are placeholders, never facts.

---

## Prompt 0: Design system (style guide screen)

```
Create a style guide screen for "Wildward", a free educational website about threatened wildlife for students. Every fact is cited. No visitor accounts, no donations, no payments.

Look: black canvas, acid-lime giant condensed uppercase headlines, small monospace uppercase UI text, full-bleed dark wildlife photography, 1px lime rules, square corners. Bold type, calm facts. No shadows, no gradients, no glow, no rounded cards, no purple.

Colours:
- Black #000000 page background
- Navy #0E1E32 panels and cards (raised: #15283F)
- Acid lime #D9FE8F headlines, links, primary buttons, focus rings
- Light grey #DCDCDC body text, white #FFFFFF emphasis
- Muted #9AA4B2 secondary text and field borders
- Red-pink #FF8A80 errors
Text on lime is always black. Never put lime text on white.

Type:
- Anton, uppercase, for headlines (H1 64 to 112px, H2 40 to 60px) and big numbers
- Space Mono for nav, labels, buttons, chips, captions (12 to 14px, uppercase labels)
- Inter 17px for paragraphs
- Scientific names in italics

Show on the screen: the colour swatches with hex values; the type scale; buttons (primary = lime fill with black text, secondary = lime outline, quiet = grey outline, each with focus state = 3px lime ring); a text field and a search field with a 2px lime bottom border; chips like "MAMMAL (12)"; the nine conservation status badges, each with code + full label + year as text, white text on: EX Extinct #000000 (grey outline), EW #3D1A46, CR Critically Endangered #B3261E, EN Endangered #C2410C, VU Vulnerable #8A6D00, NT Near Threatened #4D7C0F, LC Least Concern #2F6B4F, DD Data Deficient #5B6470, NE Not Evaluated (white badge, black text); and a section header made of a 1px rule, a small lime "01" and an Anton H2.
```

---

## Prompt 1: Header, announcement bar and footer

```
STYLE: Wildward "Signal": black #000000, navy #0E1E32, acid lime #D9FE8F, grey #DCDCDC text, muted #9AA4B2; Anton uppercase headlines, Space Mono UI, Inter paragraphs; square corners; no shadows.

Design the site shell on a simple page.

1. Announcement bar: full width, 44px, lime background, centred black Space Mono uppercase 13px: "EVERY FACT ON WILDWARD IS CITED — SEE HOW WE KNOW →". No close button.
2. Header on black, 72px, three zones. Left: an original line-art mark (a lime circle with one curved leaf vein through it) + "WILDWARD" in Space Mono bold uppercase lime. Centre: exactly four nav links, EXPLORE · MAP · COMPARE · ABOUT, Space Mono uppercase lime; the current page is underlined. Right: a small lime-outlined counter "COMPARING [2/3]". No hamburger menu and no search field in the header.
3. Footer on black, 1px lime rule on top, three columns. "ABOUT THIS SITE": "Wildward is an independent educational catalogue. It is not affiliated with the IUCN or any organization listed on it. Catalogue figures describe this site's coverage, not global biodiversity totals." "READ": Methodology, Sources, Support directory. "LEGAL": Privacy, Terms. Below: a giant lime Anton "WILDWARD" wordmark spanning the full width, slightly cropped at the bottom edge. Corner captions in Space Mono 12px muted: "built as an independent portfolio project" (left) and "boundaries: Natural Earth · photos: credited per image" (right).
```
Follow-ups:
```
Show the mobile version (360px): the logo on row 1, the four nav links centred and wrapping on row 2 (still no hamburger), the footer columns stacked.
```

---

## Prompt 2: Components: species card and chips

```
STYLE: Wildward "Signal": black #000000, navy #0E1E32, acid lime #D9FE8F, grey #DCDCDC text, muted #9AA4B2; Anton uppercase headlines, Space Mono UI, Inter paragraphs; square corners; no shadows.

Create a component sheet with these components:

1. Species card: navy, square corners, 1px #2A3B52 border, 4:3 photo on top (placeholder: a snow leopard). Body:
   - kicker "MAMMAL" in lime Space Mono 12px
   - common name "Snow leopard" in Space Mono bold 18px
   - "Panthera uncia" in muted italics
   - a small status badge "VU Vulnerable · 2017"
   - the context line "Land · 12 countries and seas" in muted Space Mono 12px
   - the photo credit "Photo: [creator], CC BY-SA 4.0" in 12px muted
   Show four variants: normal; no photo (navy box with "NO PHOTO YET"); hover (1px lime outline); keyboard focus (3px lime ring).
2. Feature card: the same card at double width and height, with the name in Anton 48px.
3. Chips: animal groups with counts ("MAMMAL (12)", "BIRD (8)", "FISH (6)"); environments ("LAND", "FRESHWATER", "MARINE", "BRACKISH WATER", "UNDERGROUND", "AIR"); removable lime-outlined filter chips ("ENVIRONMENT: LAND ×", "“SNOW” ×") and a "Reset all" link.
4. Pagination: "← PREVIOUS   PAGE 2 OF 8   NEXT →".
5. Notices: error (navy panel with red-pink #FF8A80 border and text), info (navy panel with a 2px lime left rule), and the calm missing-data text "Not yet documented." in muted italics.
```

---

## Prompt 3: Components: facts and data

```
STYLE: Wildward "Signal": black #000000, navy #0E1E32, acid lime #D9FE8F, grey #DCDCDC text, muted #9AA4B2; Anton uppercase headlines, Space Mono UI, Inter paragraphs; square corners; no shadows.

Create a second component sheet:

1. Population estimate card (navy): "[sample] 20,000–49,999" in lime Anton 64px, "mature individuals" in Space Mono next to it, and a small lime citation "[2]". A chip row: "WILD · GLOBAL · 2018–2020". A line "Uncertainty: [sample note]" in Inter.
   Variants:
   - "at least [sample] 350 breeding pairs"
   - a text-only estimate, "Locally common on outer reefs"
   - UNKNOWN: "UNKNOWN" in GREY Anton (not lime) + "Our sources give no reliable population estimate for this species. Unknown does not mean zero."
   Never show charts, totals or progress bars.
2. Assessment row: a navy panel with a 4px left edge in the status colour, the badge "EN Endangered · 2021 · regional" and a muted line "Regional assessment: [Region] · Decreasing · assessed 12 March 2021".
3. Support link card: kicker "VOLUNTEER", the link "Volunteer: [Example Conservation Trust] ↗", "(goes to example.org)" in muted text, and one line of description.
4. Expandable bar: a full-width navy bar "CLASSIFICATION AND BIOLOGY +", shown open.
5. Map legend: a lime square "Country-level presence: the whole country or sea is shaded; the species is not everywhere in it." and a white diagonal-hatch square "Published range map: an area from a cited source."
6. Buttons "ADD TO COMPARE" (secondary) and "REMOVE FROM COMPARE" (primary), with the link "Compare (1 of 3)" next to them.
```

---

## Prompt 4: Home (desktop)

```
STYLE: Wildward "Signal": black #000000, navy #0E1E32, acid lime #D9FE8F, grey #DCDCDC text, muted #9AA4B2; Anton uppercase headlines, Space Mono UI, Inter paragraphs; square corners; no shadows.

Design the HOME page, desktop 1440px, using the shell from Prompt 1 (the header floats over the hero).

1. Hero, full screen: a dark cinematic photo of a snow leopard. Giant lime Anton "WILD" at the top and "WARD" at the bottom, with the animal between them; this is the H1. In the bottom corners, lime Space Mono 13px: "photo: [creator], CC BY-SA 4.0" (left) and "Snow leopard →" (right). A 1px lime line at the bottom.
2. Black band: on the left, "Understand a species, discover where it lives, and find a credible way to help." in white Inter 36px. On the right, a big search field ("Search by common or scientific name") and a lime "SEARCH" button. Under them, "[sample] 40 SPECIES IN THIS CATALOGUE" and "[sample] 18 THREATENED (CR, EN OR VU)", with the numbers in lime Anton.
3. "01 BROWSE BY ANIMAL GROUP": a grid of square navy tiles, 6 per row. Each has the name ("MAMMAL") at the top left and a lime count at the bottom left.
4. "02 BROWSE BY ENVIRONMENT": the note "Group and environment are separate: a whale is a mammal and marine." Then a full-width list of rows separated by 1px lines: big grey Anton names (LAND, FRESHWATER, MARINE…), with "(9) →" on the right.
5. "03 THREATENED SPECIES IN THIS CATALOGUE", with "SEE ALL THREATENED →" on the right: 4 species cards, the first one large (2×2).
6. "04 EXPLORE BY COUNTRY, SEA OR OCEAN" on a navy band: large outlined chips ("KENYA (5)", "PACIFIC OCEAN (4)") and "OPEN THE MAP →".
7. A full-width LIME band with BLACK text, "HOW WE SOURCE FACTS", with three numbered columns:
   - 01 "Every number and status links to the source it came from, with the source's own date."
   - 02 "Population estimates keep their units, places and years, and unknown is never shown as zero."
   - 03 "Each profile is reviewed by our editors before it is published, and the review date is shown."
8. Footer.
```
Follow-ups (one at a time):
```
Show this home page at 360px mobile width. The giant WILD / WARD must shrink to fit, never overflow; all sections stack in one column; the group tiles are 2 per row.
```
```
Show a variant of the hero with no photo: black with a faint navy grid, giant lime WILD / WARD, and a centred Space Mono line "a free field guide to threatened wildlife — every fact cited".
```

---

## Prompt 5: Explore (desktop)

```
STYLE: Wildward "Signal": black #000000, navy #0E1E32, acid lime #D9FE8F, grey #DCDCDC text, muted #9AA4B2; Anton uppercase headlines, Space Mono UI, Inter paragraphs; square corners; no shadows.

Design the EXPLORE SPECIES page, desktop 1440px, with the shell from Prompt 1.

At the top:
- kicker "CATALOGUE", H1 "EXPLORE SPECIES" in huge lime Anton
- one row with a big search field labelled "SEARCH NAMES", a "SORT BY" select (Name / Most threatened first / Recently reviewed; no population sort) and a lime "SEARCH" button

Left sidebar (272px), filter groups separated by 1px lines, each with a lime Space Mono legend and checkboxes with muted counts:
- ANIMAL GROUP
- ENVIRONMENT
- STATUS (e.g. "Endangered (EN)" with a tiny colour square)
- COUNTRY OR SEA (scrolls inside its own box)
- HABITAT
- TREND (Decreasing, Stable, Increasing, Trend unknown)
A full-width lime "APPLY FILTERS" button at the bottom.

Right side:
- the chips "ANIMAL GROUP: MAMMAL ×" and "ENVIRONMENT: LAND ×" with "Reset all"
- the line "[sample] 42 species in this catalogue match" in muted Space Mono
- a 3-column grid of species cards (as in Prompt 2)
- pagination "← PREVIOUS   PAGE 2 OF 8   NEXT →"
```
Follow-ups (one at a time):
```
Show the 360px mobile version: no sidebar; under the search row a full-width outlined button "FILTERS (2 APPLIED)"; cards in one column.
```
```
Show the mobile filter drawer open: a full-screen black panel with the heading "FILTERS" and a "CLOSE" button at the top, the same filter groups, and a sticky lime "APPLY FILTERS" button at the bottom.
```
```
Show the empty state in the results area: a navy panel saying "No species match these filters." and "Try removing a filter, or reset all filters." (lime link).
```
```
Show the error state in the results area: a red-pink notice "Species could not be loaded. This is a problem on our side. Try again."
```

---

## Prompt 6: Species profile, top and sections 01 and 02

```
STYLE: Wildward "Signal": black #000000, navy #0E1E32, acid lime #D9FE8F, grey #DCDCDC text, muted #9AA4B2; Anton uppercase headlines, Space Mono UI, Inter paragraphs; square corners; no shadows.

Design the top of a SPECIES PROFILE page, desktop 1440px. Sample: Snow leopard, Panthera uncia. Numbers are [sample].

Title block:
- kicker "MAMMAL / LAND"
- H1 "SNOW LEOPARD" in huge lime Anton, with "Panthera uncia" in Space Mono italics under it
- a lime-outlined "ADD TO COMPARE" button on the right
Photo: full width, 21:9, square corners, with the caption "photo: [creator], CC BY-SA 4.0 · Source" in muted Space Mono 12px.
Key facts: a navy strip with 3 cells: STATUS "VU Vulnerable · 2017", POPULATION "2 dated estimates", ENVIRONMENT "Land".

Below, two columns:
- On the left, a sticky list of the 8 sections, each with a lime number: 01 What is it? / 02 How threatened is it? / 03 How many remain? / 04 Where does it live? / 05 What does it eat? / 06 Why is it threatened? / 07 How can I help? / 08 How do we know?
- On the right, the content.

Section 01 "WHAT IS IT?":
- an Inter paragraph with small lime citations [1] [2]
- "Also called ounce (en)." in muted text
- an expandable bar "CLASSIFICATION AND BIOLOGY", shown open with the rows Kingdom Animalia, Phylum Chordata, Class Mammalia, Order Carnivora, Family Felidae, Genus Panthera

Section 02 "HOW THREATENED IS IT?": two separate navy panels with a coloured left edge:
- "VU Vulnerable · 2017": "Global assessment · Decreasing · assessed 6 July 2017"
- "EN Endangered · 2021 · regional": "Regional assessment: [Region] · Trend unknown"
```
Follow-ups (one at a time):
```
Show this profile top at 360px: the section list becomes a sticky horizontal scrolling bar under the header ("01 WHAT IS IT?", "02 HOW THREATENED IS IT?"...), the key facts stack.
```
```
Show the photo area with no photo: a navy box with a faint grid and "NO LICENSED PHOTOGRAPH YET".
```

---

## Prompt 7: Species profile, sections 03 and 04

```
STYLE: Wildward "Signal": black #000000, navy #0E1E32, acid lime #D9FE8F, grey #DCDCDC text, muted #9AA4B2; Anton uppercase headlines, Space Mono UI, Inter paragraphs; square corners; no shadows.

Continue the Snow leopard profile, desktop, using the same layout (section list on the left, content on the right).

Section 03 "HOW MANY REMAIN?": two navy estimate cards side by side.
- Card 1: "[sample] 2,710–3,386" in lime Anton, "mature individuals", [1]; chips "WILD · GLOBAL · 2016"; "Uncertainty: based on expert estimates."
- Card 2: "[sample] 450", "individuals (all ages)"; chips "CAPTIVE · GLOBAL · 2022".
Note under the cards, with a lime left line: "Estimates with different units, places or dates are listed separately. They are never added together." No chart, no total.

Section 04 "WHERE DOES IT LIVE?":
- A dark map, about 380px tall: navy sea, dark land, thin borders, no labels. The countries where the species lives are filled lime at 55%. Small black zoom buttons. "Boundaries: Natural Earth (public domain)".
- The legend: "Country-level presence" (lime) and "Published range map" (white hatch).
- "RANGE MAPS": the italic text "No published range map. Only country-level presence is shown; we never draw a range a source has not published."
- "COUNTRIES, SEAS AND OCEANS": the note "the species is recorded somewhere in each place, not everywhere in it", then a 3-column grid of navy cells. Each cell has a lime link ("Nepal") and the line "Present · Native · Year-round" in muted text.
- "HABITATS": chips. "CLIMATE": a short Inter paragraph.
```
Follow-ups (one at a time):
```
Show section 03 with no estimate: "UNKNOWN" in big grey Anton (not lime) and "Our sources give no reliable population estimate for this species. Unknown does not mean zero."
```
```
Show section 04 for a protected species: no map, only a notice with a lime left line "Locations are withheld to protect this species from collection or disturbance."
```
```
Show the map frame after a failure: inside it "The map could not be loaded. The list of countries and seas below has the same information." The list stays visible.
```

---

## Prompt 8: Species profile, sections 05 to 08 and related species

```
STYLE: Wildward "Signal": black #000000, navy #0E1E32, acid lime #D9FE8F, grey #DCDCDC text, muted #9AA4B2; Anton uppercase headlines, Space Mono UI, Inter paragraphs; square corners; no shadows.

Finish the Snow leopard profile, desktop, using the same layout.

05 "WHAT DOES IT EAT?": an Inter paragraph with [2] and diet chips ("CARNIVORE", "WILD SHEEP AND GOATS").

06 "WHY IS IT THREATENED?": rows separated by 1px lines, with the threat in Inter on the left and "(major, ongoing)" in muted Space Mono on the right: "Hunting and trapping", "Livestock farming", "Climate change". Then "CONSERVATION ACTIONS" and a short paragraph.

07 "HOW CAN I HELP?": two navy cards, each with a lime kicker (VOLUNTEER / LEARN), a link "Volunteer: [Example Conservation Trust] ↗", "(goes to example.org)" in muted text, and a description. Below them, in muted text: "Links go to independent organizations. Our review does not certify how effective an organization is, and a click is not a donation." Then the link "See the support directory and how we review links".

08 "HOW DO WE KNOW?":
- a numbered source list with lime [1] [2] [3]: author, the title as a lime link, publisher, year, "Accessed 3 March 2026."
- "PHOTOGRAPHS": "photo: [creator], CC BY-SA 4.0 (source)"
- a navy strip: "Version 3, reviewed 21 November 2026 by an editor."

"RELATED SPECIES" (no number): the note "Chosen because they share an animal group, threats or places." and 4 species cards. Then the footer.
```

---

## Prompt 9: Compare (desktop)

```
STYLE: Wildward "Signal": black #000000, navy #0E1E32, acid lime #D9FE8F, grey #DCDCDC text, muted #9AA4B2; Anton uppercase headlines, Space Mono UI, Inter paragraphs; square corners; no shadows.

Design the COMPARE SPECIES page with 3 species side by side, desktop 1440px. Show no score, no winner, no ranking and no bar chart.

Top: kicker "SIDE BY SIDE", H1 "COMPARE SPECIES" in lime Anton, and "Side by side, with no overall score. Figures with different units, places or dates are never combined." in muted text.

A table with square corners:
- The header row has one navy column per species: the name as a lime link, the scientific name in italics, and a small "REMOVE" button.
- Row labels on the left in muted Space Mono uppercase, in this order:
  - STATUS: badge + "Global · Decreasing"
  - POPULATION: e.g. "[sample] 2,710–3,386 mature individuals" with "Wild · Global · 2016" under it, or "Unknown" in muted italics
  - ANIMAL GROUP
  - HABITATS
  - DIET
  - WHERE IT LIVES
  - THREATS
- Directly under the population row, a full-width LIME band with BLACK text: "POPULATION: Not directly comparable: the estimates use different units."
```
Follow-ups (one at a time):
```
Show the 360px mobile version: no table; one navy card per species, stacked, with label/value pairs and a "REMOVE FROM COMPARISON" button; the population notice above the cards.
```
```
Show the empty state: a giant grey "0/3", the text "Pick up to 3 species to see them side by side. Use “Add to compare” on any species page." and a lime "EXPLORE SPECIES" button.
```

---

## Prompt 10: Map (desktop)

```
STYLE: Wildward "Signal": black #000000, navy #0E1E32, acid lime #D9FE8F, grey #DCDCDC text, muted #9AA4B2; Anton uppercase headlines, Space Mono UI, Inter paragraphs; square corners; no shadows.

Design the MAP page, desktop 1440px.

Top: kicker "CATALOGUE / MAP", H1 "MAP" in huge lime Anton, and an Inter paragraph: "Where the species in this catalogue live. When only the countries or seas are known, whole areas are shaded and labelled Country-level presence. A range is drawn only where a cited source publishes one."

A collapsible navy bar "FILTERS +".

Two columns:
- Left: a large dark map, 70% of the screen height. Navy sea, dark land, thin borders, no labels, no satellite view. Countries with species are filled lime at 55%; one area has a white diagonal hatch with a dashed white outline. Square black zoom buttons. "Boundaries: Natural Earth (public domain)".
  Under the map: the legend (lime = "Country-level presence", hatch = "Published range map"), and on the right an outlined "NEAR ME" button with the note "Finds your country in this browser only. Your position is never sent to us."
- Right (384px): "SPECIES IN THIS VIEW" in Anton, "[sample] 12 species in this catalogue match this view", then species cards in one column. Each card has "Shown on the map as: Country-level presence" under it.
```
Follow-ups (one at a time):
```
Open the FILTERS bar: two checkbox groups side by side, ANIMAL GROUP and STATUS (no counts), a lime "APPLY FILTERS" button and a "Reset all" link.
```
```
Show the map failure state: inside the map frame "The map could not be loaded. The list still works: it shows every species for the area and filters you chose." The species list stays fully visible.
```
```
Show the 360px mobile version: the map first (55% height), then the legend and NEAR ME, then the list.
```

---

## Prompt 11: Region page (desktop)

```
STYLE: Wildward "Signal": black #000000, navy #0E1E32, acid lime #D9FE8F, grey #DCDCDC text, muted #9AA4B2; Anton uppercase headlines, Space Mono UI, Inter paragraphs; square corners; no shadows.

Design a REGION page for a country, desktop 1440px.

Header band (full-width navy with a faint grid):
- kicker "COUNTRY", H1 "KENYA" in huge lime Anton
- Inter text: "Species in this catalogue recorded in Kenya, with how they occur here as their sources record it. This is not a complete list of the wildlife of Kenya."
- an outlined "VIEW ON THE MAP →" button and "Boundary: Natural Earth (public domain)" in muted text

A collapsible navy bar "FILTERS +".

Then:
- "[sample] 5 species in this catalogue recorded here" in muted text
- a 3-column grid of species cards; under each card, a muted line with a lime ▸: "▸ Present · Native · Year-round"
- pagination
```
Follow-ups (one at a time):
```
Open the FILTERS bar: four checkbox groups in a row with counts: ANIMAL GROUP, STATUS, ORIGIN HERE (Native, Introduced, Vagrant...), SEASON HERE (Year-round, Breeding season...), plus "APPLY FILTERS" and "Reset all".
```
```
Make the ocean variant: kicker "OCEAN", H1 "PACIFIC OCEAN", and the empty state "No species in this catalogue are recorded in Pacific Ocean yet." in a navy panel.
```

---

## Prompt 12: Support directory

```
STYLE: Wildward "Signal": black #000000, navy #0E1E32, acid lime #D9FE8F, grey #DCDCDC text, muted #9AA4B2; Anton uppercase headlines, Space Mono UI, Inter paragraphs; square corners; no shadows.

Design the SUPPORT DIRECTORY page, desktop 1440px. There are no donations, amounts, totals, rankings or logos.

Top: kicker "HELP", H1 "SUPPORT DIRECTORY", and Inter text: "Links to independent organizations, reviewed by our editors. A click takes you to the organization's own site. It is a referral, not a donation, and we do not handle money."

"HOW WE REVIEW A LINK": a navy panel with a lime top line and four numbered criteria in a 2×2 grid:
- 01 "The link goes over https to the organization's own website, and we show you that destination before you click."
- 02 "The page asks for the action we describe, and our description matches it."
- 03 "An editor reviewed the organization and the link. Any edit sends it back for review."
- 04 "When a link stops working or no longer fits, we take it down."
In muted text below: "Our review checks the link, not the organization's results. It is not a certification."

"ORGANIZATIONS": two navy panels. Each has:
- the name in Anton ("[EXAMPLE CONSERVATION TRUST]")
- "Website: example.org · Reviewed 12 October 2026" in muted text
- a description
- link rows: "Volunteer: [Example Conservation Trust] ↗", "(goes to example.org)", a one-line description, and "Shown on: Snow leopard"
```

---

## Prompt 13: Sources

```
STYLE: Wildward "Signal": black #000000, navy #0E1E32, acid lime #D9FE8F, grey #DCDCDC text, muted #9AA4B2; Anton uppercase headlines, Space Mono UI, Inter paragraphs; square corners; no shadows.

Design the SOURCES page, desktop 1440px.

Top: kicker "EVIDENCE", H1 "SOURCES" in huge lime Anton, and Inter text: "Every source cited by a published profile, with the date we read it. See how we source facts." (the last words are a lime link).

A numbered ledger of 6 items separated by 1px lines. Each item has:
- a big lime Space Mono number ("001") on the left
- the title as a white Inter link
- a muted Space Mono line: "[Authors] · [Publisher] · published 1 March 2024 · read 3 March 2026 · DOI 10.xxxx · Licence: CC BY 4.0"
- an optional note ("Second-hand: IUCN category as recorded on Wikidata.")
- "Cited by: Snow leopard, Axolotl" with lime links
One item says "Used for country, sea and ocean boundaries on maps and region pages."
```

---

## Prompt 14: About

```
STYLE: Wildward "Signal": black #000000, navy #0E1E32, acid lime #D9FE8F, grey #DCDCDC text, muted #9AA4B2; Anton uppercase headlines, Space Mono UI, Inter paragraphs; square corners; no shadows.

Design the ABOUT page as a long-reading layout, desktop 1440px.

Top: kicker "ABOUT", H1 "ABOUT WILDWARD" in huge lime Anton, and a white Inter lead: "Wildward helps curious people understand a species, see where it lives, and find a credible way to help. Every fact on it links to the source it came from."

On the left, a sticky "ON THIS PAGE" list with lime numbers. On the right, sections, each with a 1px line, a lime number and an Anton H2, and Inter 17px text in a column about 68 characters wide:
- 01 WHAT THIS IS: an independent educational catalogue run as a personal portfolio project, not affiliated with the IUCN, GBIF or any listed organization. Each profile answers eight questions in the same order.
- 02 WHO IT IS FOR: students and curious learners first. It is not a research-grade database.
- 03 WHAT IT DOES NOT CLAIM: four bullets with small lime square bullets (partial coverage; some facts are second-hand; Unknown never means zero; support links are reviewed, not certified).
- 04 MORE: links to Methodology, Sources, Privacy and Terms.

At the bottom: "Last updated 21 November 2026." in muted Space Mono.
```

---

## Prompt 15: Methodology

```
STYLE: Wildward "Signal": black #000000, navy #0E1E32, acid lime #D9FE8F, grey #DCDCDC text, muted #9AA4B2; Anton uppercase headlines, Space Mono UI, Inter paragraphs; square corners; no shadows.

Using the same long-reading layout as the About page, design the METHODOLOGY page, desktop 1440px.

Top: kicker "METHODOLOGY", H1 "HOW WE SOURCE FACTS", and the lead: "Every status, number and photograph on Wildward is tied to a source you can check. These are the rules we follow."

Sections, each with 3 to 4 Inter bullets:
- 01 SOURCES AND CITATIONS
- 02 CONSERVATION STATUS: include a small table of the nine status badges with their full names, and an emphasised line "Data Deficient and Not Evaluated are not low risk."
- 03 POPULATION FIGURES: units are kept, figures are never added up, Unknown is not zero
- 04 WHERE SPECIES LIVE: country shading vs published range maps
- 05 PHOTOGRAPHS: only CC0, Public Domain Mark, CC BY and CC BY-SA
- 06 REVIEW AND CORRECTIONS
```

---

## Prompt 16: Privacy

```
STYLE: Wildward "Signal": black #000000, navy #0E1E32, acid lime #D9FE8F, grey #DCDCDC text, muted #9AA4B2; Anton uppercase headlines, Space Mono UI, Inter paragraphs; square corners; no shadows.

Using the same long-reading layout as the About page, design the PRIVACY page, desktop 1440px.

Top: kicker "LEGAL", H1 "PRIVACY", and the lead: "You can use all of Wildward without an account, and we do not track you."
Below the lead, a navy box with a lime left line: "IN SHORT: no accounts · no tracking cookies · no analytics · your location never leaves your browser".

Sections, with short Inter bullets:
- 01 IF YOU ARE A VISITOR
- 02 WHAT STAYS IN YOUR BROWSER: the species picked to compare are kept in local storage; "Near me" is matched to a country inside the browser
- 03 LINKS TO OTHER SITES
- 04 IF YOU ARE AN EDITOR: session cookies, hashed passwords, audit log
- 05 CONTACT: a placeholder link

At the bottom: "Last updated 21 November 2026."
```

---

## Prompt 17: Terms

```
STYLE: Wildward "Signal": black #000000, navy #0E1E32, acid lime #D9FE8F, grey #DCDCDC text, muted #9AA4B2; Anton uppercase headlines, Space Mono UI, Inter paragraphs; square corners; no shadows.

Using the same long-reading layout as the About page, design the TERMS OF USE page, desktop 1440px.

Top: kicker "LEGAL", H1 "TERMS OF USE", and the lead: "Wildward is an educational portfolio project, offered as is."

Sections, with short Inter bullets:
- 01 USING THE SITE: for learning, not scientific, legal or professional advice; no warranty
- 02 PHOTOGRAPHS: each is used under the licence shown under it
- 03 DATA FROM OTHER SOURCES: GBIF Backbone Taxonomy CC BY 4.0; Wikidata CC0; Wikipedia CC BY-SA; Natural Earth public domain
- 04 LINKS TO OTHER SITES

At the bottom: "Last updated 21 November 2026." Use placeholders for operator details.
```

---

## Prompt 18: Page not found

```
STYLE: Wildward "Signal": black #000000, navy #0E1E32, acid lime #D9FE8F, grey #DCDCDC text, muted #9AA4B2; Anton uppercase headlines, Space Mono UI, Inter paragraphs; square corners; no shadows.

Design the PAGE NOT FOUND screen, desktop 1440px, with the header and footer.

In the centre:
- a giant decorative lime "404" in Anton
- the H1 "PAGE NOT FOUND" in grey Anton
- "This page doesn't exist, or it hasn't been built yet." in muted Inter
- a lime "BACK TO HOME" button and two outlined buttons, "EXPLORE SPECIES" and "MAP"
```
Follow-ups:
```
Make the error variant: giant lime "ERR", H1 "SOMETHING WENT WRONG", text "The page could not be loaded. You can try again." and a lime "TRY AGAIN" button.
```

---

## Prompt 19: Staff sign-in

```
STYLE: Wildward "Signal": black #000000, navy #0E1E32, acid lime #D9FE8F, grey #DCDCDC text, muted #9AA4B2; Anton uppercase headlines, Space Mono UI, Inter paragraphs; square corners; no shadows.

Design the STAFF SIGN-IN page for editors, desktop 1440px. This is a working tool: compact, with no giant type and no photos.

The public header stays. Under it, a thin navy strip "STAFF AREA" in lime Space Mono 11px.

In the centre, a navy panel (380px wide):
- H1 "STAFF SIGN-IN" (about 32px)
- labelled fields "EMAIL" and "PASSWORD"
- a full-width lime "SIGN IN" button
- a red-pink error line "Email or password is not correct."
There is no sign-up, no social login and no "forgot password".
```

---

## Prompt 20: Staff species list

```
STYLE: Wildward "Signal": black #000000, navy #0E1E32, acid lime #D9FE8F, grey #DCDCDC text, muted #9AA4B2; Anton uppercase headlines, Space Mono UI, Inter paragraphs; square corners; no shadows.

Design the staff SPECIES list, desktop 1440px. This is a compact working tool, with text mostly in Space Mono 13 to 14px.

Staff nav bar:
- tabs "SPECIES" (active, lime underline), "MEDIA", "SUPPORT DIRECTORY"
- on the right, "[Editor name] (admin)" and a small "SIGN OUT" button

H1 "SPECIES" (about 32px). A list with 1px lines between rows. Each row has a scientific name as an italic lime link ("Panthera uncia") and, on the right, a chip "PUBLISHED" (lime outline) or "NOT PUBLISHED" (grey outline) plus "latest v3 draft" in muted text.

Below the list, a navy form "NEW SPECIES" in two columns:
- "Accepted scientific name"
- "URL slug" (placeholder "genus-species")
- "Animal group" (select)
- "Location sensitivity" (select: None / Generalize to country / Hide all regions)
- a lime "CREATE SPECIES AND DRAFT" button
```

---

## Prompt 21: Staff species detail

```
STYLE: Wildward "Signal": black #000000, navy #0E1E32, acid lime #D9FE8F, grey #DCDCDC text, muted #9AA4B2; Anton uppercase headlines, Space Mono UI, Inter paragraphs; square corners; no shadows.

Design the staff SPECIES DETAIL screen, desktop 1440px, as a compact tool, with the staff nav bar from the species list.

At the top:
- an "All species" link
- H1 "Panthera uncia" in Space Mono bold italic
- the muted line "/panthera-uncia · location sensitivity: none · public page"

A success notice with a lime left line: "Version 2 is live again. Start a new draft."

"REVISIONS": a list of rows, each with:
- "Version 3", "Version 2", "Version 1"
- a state chip: DRAFT (grey outline), SUBMITTED (lime outline) or PUBLISHED (lime fill, black text)
- "· live" on the live version
- "updated 21/11/2026, 14:02"
One older published row has a small outlined button "MAKE THIS VERSION LIVE AGAIN".
Then a lime "NEW DRAFT FROM THE PUBLISHED VERSION" button.

"PROVIDER IDENTIFIERS":
- lines "gbif: 5219436 (link)" and "iucn: 22732 (link)"
- an inline form with "Provider", "ID" and "Source URL (https, optional)" fields
- an outlined "ADD IDENTIFIER" button
```

---

## Prompt 22: Staff revision editor

```
STYLE: Wildward "Signal": black #000000, navy #0E1E32, acid lime #D9FE8F, grey #DCDCDC text, muted #9AA4B2; Anton uppercase headlines, Space Mono UI, Inter paragraphs; square corners; no shadows.

Design the staff REVISION EDITOR, desktop 1440px, as a compact tool, with the staff nav bar.

At the top:
- a "Back to species" link
- H1 "panthera-uncia · version 3" in Space Mono bold 22px
- "State: DRAFT" with a chip
A notice with a lime left line: "Review notes: Please cite the 2017 assessment for the population figure."

"PUBLICATION CHECKLIST" (navy panel), each row starting with a lime ✓ or a red-pink ✗:
- "✓ At least one provider identifier"
- "✓ Every estimate has a source"
- "✗ The primary photo is approved"
Then a lime "SUBMIT FOR REVIEW" button, shown disabled.

"CONTENT":
- a large code area (black, grey Space Mono 12px, about 25 lines of indented JSON with lime keys)
- a lime "SAVE DRAFT" button

Two navy panels side by side at the bottom:
- "SOURCES": a search field, a list of "[id] title" rows, and a small form (Title, URL, Publisher, Published, Accessed) with "ADD SOURCE"
- "REFERENCE IDS": a search field and a list of rows such as "[id] region (country) Kenya"
```
Follow-ups:
```
Show the admin view of a submitted revision: a lime "PUBLISH" button, a field "Notes for the editor" and an outlined "REQUEST CHANGES" button instead of "SUBMIT FOR REVIEW".
```

---

## Prompt 23: Staff media review

```
STYLE: Wildward "Signal": black #000000, navy #0E1E32, acid lime #D9FE8F, grey #DCDCDC text, muted #9AA4B2; Anton uppercase headlines, Space Mono UI, Inter paragraphs; square corners; no shadows.

Design the staff MEDIA screen, desktop 1440px, as a compact tool, with the staff nav bar (MEDIA active).

At the top:
- H1 "MEDIA"
- a muted note: "Only allow-listed licences are accepted: CC0, Public Domain Mark, CC BY and CC BY-SA. Images are re-encoded, which removes camera details and GPS position."

"UPLOAD AN IMAGE" (navy form, two columns):
- a file picker
- Creator
- Licence (select)
- "Credit line shown under the image"
- "Source page (https)"
- "Licence deed URL (optional)"
- a lime "UPLOAD" button

"IMAGES", with a filter select (Pending review / Approved / Rejected / All).

Three image rows, each a navy panel with a square thumbnail on the left and, on the right:
- a state chip: PENDING REVIEW (lime outline), APPROVED (lime fill) or REJECTED (red-pink outline)
- "1600×1067px · used by 2 revisions" in muted text
- "Credit: ..."
- a small muted id
- the buttons "APPROVE" (lime), "REJECT" (red-pink outline) and "EDIT" (grey outline)
```

---

## Prompt 24: Staff support directory admin

```
STYLE: Wildward "Signal": black #000000, navy #0E1E32, acid lime #D9FE8F, grey #DCDCDC text, muted #9AA4B2; Anton uppercase headlines, Space Mono UI, Inter paragraphs; square corners; no shadows.

Design the staff SUPPORT DIRECTORY screen, desktop 1440px, as a compact tool, with the staff nav bar (SUPPORT DIRECTORY active).

H1 "SUPPORT DIRECTORY". Two organization panels (navy). Each has:
- the name in Space Mono bold 18px
- a status chip (PENDING REVIEW / APPROVED / DISABLED)
- the buttons "APPROVE" (lime) and "DISABLE" (red-pink outline)
- the website, a description and a small "Edit" link
- "LINKS": rows with the URL, an action chip (VOLUNTEER / LEARN / DONATE / ADOPT / ADVOCATE), a description, the same status chip and buttons
- an "Add a link" text button

At the bottom, a navy form "NEW ORGANIZATION":
- Name
- URL slug
- Website (https)
- Description
- a lime "CREATE ORGANIZATION" button
```

---

## Prompt 25: Consistency check (last)

```
Check every Wildward screen in this project and fix what breaks these rules:
- colours only black, navy, acid lime #D9FE8F, grey, white, muted grey, red-pink for errors and the nine status badge colours; text on lime is black
- Anton uppercase headlines, Space Mono UI, Inter paragraphs; square corners; no shadows; no gradients except dark photo scrims
- the header always shows EXPLORE · MAP · COMPARE · ABOUT, with no hamburger and no header search
- every status badge shows its code and label as text
- no population totals, charts, scores or rankings; no donation forms
- every photo shows a credit
- nothing overflows at 360px
List what you changed.
```

---

## Notes for the owner

- **Copyright.** The palette and font pairing come from the screenshot; its pictures, logo and text must not be copied. If Stitch copies them after you attach the screenshot, regenerate without the image.
- **Fonts.** Anton, Space Mono and Inter are SIL Open Font License (free). When building the design, self-host them (npm `@fontsource`), because the site's CSP blocks Google Fonts.
- **When this is built into code:**
  - The Playwright keyboard test reads `innerText`, which picks up CSS uppercase, so its `tabTo()` helper must switch to `textContent`.
  - The nav must stay visible at 360px, and the header must have no search field. Both are needed for the keyboard test.
  - Error text on black must be `#FF8A80`.
  - The style replaces PLAN §4's "calm nature-editorial" sentence. Record that as a decision (D-034).
- A copy of the previous nature-editorial version was saved outside the repo on 2026-11-22.
