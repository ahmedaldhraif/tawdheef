// Facets are derived from the selected directory's recorded locations, never a global city list.
const clean = value => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
const key = value => clean(value).normalize('NFKC').toLowerCase();
const unknown = /^(?:unknown|not (?:specified|established|provided)|unspecified|n\/a|none|-|—)$/i;
const qualified = /not inferred|not checked|listing|listed|headquarters|operations|scope|unconfirmed/i;
const address = /\d|\b(?:road|street|st\.?|building|floor|block|office|p\.?\s*o\.?\s*box|near|next to)\b/i;

function countryNames(directory) {
  const values = [directory?.country];
  if (/^[a-z]{2}$/i.test(directory?.country || '')) {
    try { values.push(new Intl.DisplayNames(['en'], { type: 'region' }).of(directory.country.toUpperCase())); } catch { /* Preserve the recorded text if no region label is available. */ }
  }
  return new Set(values.filter(Boolean).map(key));
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
