// Facets are derived from the selected directory's recorded locations, never a global city list.
import { COUNTRY_CODES } from './directory-symbols.js';

const clean = value => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
const key = value => clean(value).normalize('NFKC').toLowerCase();
const unknown = /^(?:unknown|not (?:specified|established|provided)|unspecified|n\/a|none|-|—)$/i;
const qualified = /not inferred|not checked|listing|listed|headquarters|operations|scope|unconfirmed/i;
const address = /\d|\b(?:road|street|st\.?|building|floor|block|office|p\.?\s*o\.?\s*box|near|next to)\b/i;
const countryCodes = new Set(COUNTRY_CODES);
const cachedCountryNames = new Map();
let regionNames;

function countryNames(directory) {
  const country = directory?.country;
  const code = /^[a-z]{2}$/i.test(country || '') ? country.toUpperCase() : null;
  if (code && cachedCountryNames.has(code)) return cachedCountryNames.get(code);
  const values = [country];
  if (code) {
    try { regionNames ||= new Intl.DisplayNames(['en'], { type: 'region' }); values.push(regionNames.of(code)); } catch { /* Preserve the recorded text if no region label is available. */ }
  }
  const names = new Set(values.filter(Boolean).map(key));
  // Only the finite offline country catalog is cached. Arbitrary imported
  // country text cannot grow process memory; the private sets never escape.
  if (countryCodes.has(code)) cachedCountryNames.set(code, names);
  return names;
}

export function companyLocations(company = {}, directory = {}) {
  const source = clean(company.location || company.sourceFields?.['City'] || company.sourceFields?.['Emirate / location']);
  if (!source || unknown.test(source)) return [{ id: 'unknown', label: 'Unknown location' }];
  const countries = countryNames(directory);
  // A listing location, headquarters caveat or address must retain its qualification.
  if (qualified.test(source)) return [{ id: `location:${key(source)}`, label: source }];
  const separated = source.split(/\s+[|/]\s+|;\s*/);
  const multi = separated.length > 1 && separated.every(part => clean(part) && !address.test(part));
  const places = (multi ? separated : [source]).map(value => {
    let label = clean(value);
    // These source headings explicitly name a city/region, followed by a smaller area.
    // Do not turn an address such as "Road 10 - ..." into a purported city.
    const hierarchy = label.split(/\s+[—–-]\s+/).map(clean);
    if (hierarchy.length > 1 && !address.test(hierarchy[0])) {
      label = countries.has(key(hierarchy[0])) ? hierarchy[1] : hierarchy[0];
    }
    return unknown.test(label) ? { id: 'unknown', label: 'Unknown location' } : { id: `location:${key(label)}`, label };
  });
  return [...new Map(places.map(place => [place.id, place])).values()];
}

export function companyMatchesLocations(company, locations = [], directory = {}) {
  return locations.length === 0 || companyLocations(company, directory).some(location => locations.includes(location.id));
}
