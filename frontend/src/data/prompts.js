/**
 * Prompt bank — curated, evocative prompts + genre presets.
 *
 * `SUGGESTIONS` powers the clickable chips on the Create page; `RANDOM` is the
 * pool for the "Surprends-moi" button. `GENRES` are quick style presets for
 * the composer. All text is in English (the model is trained on English).
 */

export const SUGGESTIONS = [
  'Lo-fi piano with soft rain for studying',
  'Epic cinematic orchestral with choir',
  'Warm synthwave for a late night drive',
  'Acoustic guitar, campfire, nostalgic',
  'Deep ambient drone, meditation',
  'Upbeat indie pop, summer road trip',
  'Dark trap beat, heavy 808s',
  'Nostalgic piano, melancholic, slow',
  'Jazzy bossa nova, cafe morning',
  'Energetic drum and bass, futuristic',
];

export const RANDOM = [
  'Dreamy shoegaze wall of guitars, ethereal vocals',
  'Minimalist piano over a field recording of a forest',
  'Heroic orchestral trailer, taiko drums and brass',
  'Vintage 80s pop, analog synths, gated reverb',
  'Chillhop with vinyl crackle, mellow Rhodes piano',
  'Spacious ambient pads, distant strings, slow swell',
  'Funky disco bassline with brass stabs',
  'Haunting cello and piano duet, minor key',
  'Glitchy IDM beats with granular textures',
  'Sunny acoustic folk, fingerpicked guitar, whistling',
  'Heavy industrial metal, distorted, relentless',
  'Romantic neoclassical, solo violin and piano',
  'Bouncy afrobeat groove with layered percussion',
  'Hypnotic techno, 130 bpm, rolling bass',
  'Lullaby music box, gentle, twinkling',
  'Tense cinematic strings building to a climax',
  'Lo-fi jazz quartet, brushed drums, upright bass',
  'Euphoric trance, supersaw lead, uplifting',
  'Rainy city night, smooth saxophone, R&B',
  'Post-rock crescendo, shimmering guitars',
];

export const GENRES = [
  'lo-fi',
  'ambient',
  'cinematic',
  'electronic',
  'piano',
  'jazz',
  'orchestral',
  'synthwave',
  'trap',
  'acoustic',
];

/** Pick a random suggestion string (avoids repeating the last one). */
export function randomPrompt(last = '') {
  let pick = last;
  let guard = 0;
  while (pick === last && guard++ < 10) {
    pick = RANDOM[Math.floor(Math.random() * RANDOM.length)];
  }
  return pick;
}
