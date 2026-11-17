/**
 * Broad style families for the "Style" filter. Breweries write styles every which way
 * ("IPA - Hazy", "NEIPA", "Hazy IPA"), so each drink is sorted into one family here.
 * Rules run in order and the first match wins; the drink's style is checked first, then its name.
 */
export interface Family {
  id: string;
  /** Shown in the dropdown. */
  label: string;
  /** Used in sentences: "1 IPA", "3 IPAs", "No IPAs on tap." */
  one: string;
  many: string;
}

export const FAMILIES: Family[] = [
  { id: 'ipa', label: 'IPA', one: 'IPA', many: 'IPAs' },
  { id: 'pale', label: 'Pale & blonde', one: 'pale or blonde ale', many: 'pale and blonde ales' },
  { id: 'lager', label: 'Lager & pilsner', one: 'lager or pilsner', many: 'lagers and pilsners' },
  { id: 'wheat', label: 'Wheat', one: 'wheat beer', many: 'wheat beers' },
  { id: 'belgian', label: 'Belgian & farmhouse', one: 'Belgian or farmhouse ale', many: 'Belgian and farmhouse ales' },
  { id: 'sour', label: 'Sour & fruit', one: 'sour or fruit beer', many: 'sours and fruit beers' },
  { id: 'dark', label: 'Stout & porter', one: 'stout or porter', many: 'stouts and porters' },
  { id: 'malty', label: 'Amber, red & brown', one: 'amber, red or brown ale', many: 'amber, red and brown ales' },
  { id: 'specialty', label: 'Spiced & specialty', one: 'specialty beer', many: 'specialty beers' },
  { id: 'other', label: 'Cider, wine & more', one: 'cider, wine or other drink', many: 'ciders, wines and other drinks' },
];

const RULES: [string, RegExp][] = [
  ['other', /cider|\bmead\b|wine|prosecco|tempranillo|pinot|chardonnay|cabernet|sauvignon|\bros[eé]\b|merlot|seltzer|kombucha|\bsodas?\b|root beer|ginger ale|sarsaparilla|margarita|cocktail|lemonade/i],
  ['sour', /sour|gose|berliner|lambic|\bwild\b|kettle|fruit beer|radler|shandy|catharina|flanders/i],
  ['ipa', /\bipa\b|neipa|wcipa|dipa|india pale|\bhazy\b|\bddh\b/i],
  ['dark', /stout|porter|schwarz|black|dunkel(?!weiz)|baltic/i],
  ['belgian', /belgian|tripel|dubbel|quad|saison|farmhouse|abbey|bi[eè]re de garde/i],
  ['wheat', /wheat|weiz|hefe|\bwit\b|witbier/i],
  ['lager', /lager|pils|helles|m[äa]rzen|oktoberfest|festbier|\bbock|vienna|\bcommon\b|mexican/i],
  ['pale', /pale ale|\bapa\b|blonde|golden ale|k[öo]lsch|cream ale|\besb\b|extra special|bitter|\bpale\b/i],
  ['malty', /amber|\bred\b|brown|scotch|wee heavy|barleywine|\bmild\b|altbier|irish/i],
];

export function styleFamily(b: { style?: string; name?: string; notBeer?: boolean }): string {
  for (const text of [b.style, b.name]) {
    if (!text) continue;
    for (const [id, re] of RULES) if (re.test(text)) return id;
  }
  return b.notBeer ? 'other' : 'specialty';
}

export function familyById(id: string): Family | undefined {
  return FAMILIES.find((f) => f.id === id);
}
