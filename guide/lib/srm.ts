/**
 * Approximate a beer's color from its style name, on the SRM scale.
 * Only used for the pour bar, so "close enough" is the goal.
 */

// SRM → hex (standard reference chart, abbreviated).
const SRM_HEX: Record<number, string> = {
  2: '#F8E39B', 3: '#F3CF5D', 4: '#ECBC42', 5: '#E2A93A', 6: '#D9982E', 8: '#C77A22',
  10: '#B8651B', 13: '#A44C14', 17: '#8C3610', 20: '#7A2A0E', 24: '#5D1D0B', 29: '#461507',
  35: '#300D04', 40: '#1E0802',
};

const RULES: [RegExp, number][] = [
  [/white stout|blonde stout|golden stout/i, 5],
  [/imperial stout|russian imperial|pastry stout|trifle stout/i, 40],
  [/stout|black ipa|black ale|black rye|schwarz|cascadian|dark lager/i, 35],
  [/porter/i, 29],
  [/brown|dunkel(?!weiz)|bock(?!.*helles)|doppelbock|mild/i, 20],
  [/dunkelweiz/i, 17],
  [/irish red|red ale|amber|märzen|marzen|oktoberfest|festbier(?=.*dark)|vienna|esb|extra special|bitter|altbier|scotch|wee heavy/i, 13],
  [/barleywine|quad|dubbel|belgian dark/i, 24],
  [/double ipa|dipa|imperial ipa|triple ipa|west coast|wcipa|\bipa\b|pale ale|apa\b|ddh/i, 6],
  [/hazy|neipa|new england|milkshake|hpa/i, 5],
  [/hefe|weizen|wheat|witbier|wit\b|saison|farmhouse|tripel|golden strong/i, 4],
  [/kölsch|kolsch|helles|pilsner|pils|lager|cream ale|blonde|golden|light|common/i, 3],
  [/berliner|gose|sour|wild|lambic|kettle/i, 3],
];

/** Fruited sours and ciders get a nod to their actual color. */
const FRUIT: [RegExp, string][] = [
  [/raspberr|cherr|strawberr|blackberr|berry|rose|ube|razz|hibiscus|pomegranate|zinfandel|grape(?!fruit)/i, '#B5374C'],
  [/blueberr/i, '#5B3A6E'],
  [/mango|peach|passion|guava|papaya|orange|tangerine|apricot/i, '#E8962E'],
  [/lime|key lime|ginger|lemon/i, '#E9DC7A'],
];

export function srmToHex(srm: number): string {
  const keys = Object.keys(SRM_HEX).map(Number);
  const nearest = keys.reduce((a, b) => (Math.abs(b - srm) < Math.abs(a - srm) ? b : a));
  return SRM_HEX[nearest];
}

const NOT_BEER = /\b(wine|pinot|cabernet|chardonnay|sauvignon|ros[eé]|merlot|riesling|cider|mead|seltzer|kombucha|soda|root beer|sarsaparilla|ginger ale|cream soda|non-alcoholic)\b/i;
const NOT_BEER_NAME = /\b(root beer|ginger ale|kombucha|seltzer|soda|cider|mead|wine|chardonnay|cabernet|pinot|ros[eé])\b/i;

/** Wine, cider, soda and friends are listed separately from the beer. */
export function isNotBeer(style = '', name = ''): boolean {
  return style ? NOT_BEER.test(style) : NOT_BEER_NAME.test(name);
}

const NA_TEXT = /non[- ]?alcoholic|\bNA\b|alkoholfrei|alcohol[- ]free|kombucha|\bsodas?\b|root beer|ginger ale|sarsaparilla|cream soda|lemonade|\btea\b|cold brew/i;

/**
 * Non-alcoholic = 0.5% ABV or less (the US legal line for "non-alcoholic").
 * With no ABV listed, fall back to the words in the name, style or menu section,
 * so in-house kombucha and sodas still count, but anything labeled "hard" doesn't.
 */
export function isNonAlcoholic(b: { abv?: number; style?: string; name?: string; category?: string }): boolean {
  if (typeof b.abv === 'number' && !Number.isNaN(b.abv)) return b.abv <= 0.5;
  const text = `${b.style ?? ''} ${b.name ?? ''} ${b.category ?? ''}`;
  return !/\bhard\b|\bspiked\b/i.test(text) && NA_TEXT.test(text);
}

export function colorFor(style = '', name = '', description = ''): string {
  const text = `${style} ${name}`;
  if (/wine|pinot noir|cabernet|merlot/i.test(text)) return '#6B1D2A';
  if (/\bros[eé]\b/i.test(text)) return '#E7A0A6';
  if (/chardonnay|pinot grigio|sauvignon blanc|riesling|white wine/i.test(text)) return '#EFE3A8';
  if (/root beer|sarsaparilla|\bcola\b/i.test(text)) return '#3A1408';
  if (/sour|berliner|gose|cider|mead|seltzer|wheat ale|fruit/i.test(text)) {
    for (const [re, hex] of FRUIT) if (re.test(`${text} ${description}`)) return hex;
  }
  for (const [re, srm] of RULES) if (re.test(style || name)) return srmToHex(srm);
  for (const [re, srm] of RULES) if (re.test(`${name} ${description}`)) return srmToHex(srm);
  return srmToHex(6);
}
