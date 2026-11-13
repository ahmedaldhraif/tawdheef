// Offline names use the runtime's built-in Intl data. Every code has a bundled SVG.
export const COUNTRY_CODES = Object.freeze(
  "AC AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET EU FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU IC ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TA TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW".split(
    " ",
  ),
);
const countrySet = new Set(COUNTRY_CODES);
export const DIRECTORY_ICON_GROUPS = Object.freeze([
  {
    id: "folders",
    label: "Folders",
    arabicLabel: "المجلدات",
    icons: [
      { id: "folder", label: "Folder", arabicLabel: "مجلد" },
      { id: "folder-open", label: "Open folder", arabicLabel: "مجلد مفتوح" },
      { id: "archive", label: "Archive", arabicLabel: "أرشيف" },
      { id: "bookmark", label: "Bookmark", arabicLabel: "علامة مرجعية" },
    ],
  },
  {
    id: "work",
    label: "Work",
    arabicLabel: "العمل",
    icons: [
      { id: "briefcase", label: "Briefcase", arabicLabel: "حقيبة عمل" },
      { id: "building", label: "Company", arabicLabel: "شركة" },
      { id: "users", label: "People", arabicLabel: "أشخاص" },
      { id: "laptop", label: "Technology", arabicLabel: "التقنية" },
      { id: "globe", label: "International", arabicLabel: "دولي" },
      { id: "target", label: "Target", arabicLabel: "هدف" },
    ],
  },
  {
    id: "education",
    label: "Education",
    arabicLabel: "التعليم",
    icons: [
      { id: "education", label: "Graduation", arabicLabel: "تخرج" },
      { id: "book", label: "Book", arabicLabel: "كتاب" },
      { id: "school", label: "School", arabicLabel: "مدرسة" },
      { id: "science", label: "Science", arabicLabel: "علوم" },
    ],
  },
  {
    id: "interests",
    label: "Interests",
    arabicLabel: "الاهتمامات",
    icons: [
      { id: "star", label: "Star", arabicLabel: "نجمة" },
      { id: "heart", label: "Heart", arabicLabel: "قلب" },
      { id: "leaf", label: "Environment", arabicLabel: "البيئة" },
      { id: "coffee", label: "Coffee", arabicLabel: "قهوة" },
      { id: "travel", label: "Travel", arabicLabel: "السفر" },
      { id: "health", label: "Healthcare", arabicLabel: "الرعاية الصحية" },
    ],
  },
]);
export const DIRECTORY_ICONS = Object.freeze(
  DIRECTORY_ICON_GROUPS.flatMap((group) =>
    group.icons.map((icon) => ({
      ...icon,
      type: "icon",
      category: group.id,
      value: `icon:${icon.id}`,
    })),
  ),
);
const iconByValue = new Map(DIRECTORY_ICONS.map((icon) => [icon.value, icon]));
const aliases = {
  AE: "UAE Emirates",
  GB: "UK Britain",
  US: "USA America",
  SA: "KSA Saudi",
  CZ: "Czech Republic",
  CI: "Ivory Coast",
  CD: "DRC Congo",
};
const cached = new Map();
const normalize = (value) =>
  String(value || "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase();
export function countryCodeFromValue(value) {
  const text = typeof value === "string" ? value.trim() : "";
  const points = Array.from(text);
  if (
    points.length === 2 &&
    points.every(
      (char) =>
        char.codePointAt(0) >= 0x1f1e6 && char.codePointAt(0) <= 0x1f1ff,
    )
  )
    return points
      .map((char) => String.fromCharCode(char.codePointAt(0) - 0x1f1e6 + 65))
      .join("");
  return /^[a-z]{2}$/i.test(text) ? text.toUpperCase() : null;
}
export function getDirectorySymbols(locale = "en") {
  const language = String(locale).startsWith("ar") ? "ar" : "en";
  if (cached.has(language)) return cached.get(language);
  const display = new Intl.DisplayNames([language], { type: "region" }),
    english = new Intl.DisplayNames(["en"], { type: "region" }),
    arabic = new Intl.DisplayNames(["ar"], { type: "region" });
  const countries = COUNTRY_CODES.map((code) => ({
    value: code,
    code,
    type: "country",
    category: "countries",
    label: display.of(code) || code,
    englishLabel: english.of(code) || code,
    arabicLabel: arabic.of(code) || code,
    asset: `/flags/${code}.svg`,
    aliases: aliases[code] || "",
  })).sort((a, b) => a.label.localeCompare(b.label, language));
  const iconGroups = DIRECTORY_ICON_GROUPS.map((group) => ({
    ...group,
    label: language === "ar" ? group.arabicLabel : group.label,
    icons: DIRECTORY_ICONS.filter((icon) => icon.category === group.id).map(
      (icon) => ({
        ...icon,
        englishLabel: icon.label,
        label: language === "ar" ? icon.arabicLabel : icon.label,
      }),
    ),
  }));
  const result = { countries, iconGroups };
  cached.set(language, result);
  return result;
}
export function getDirectorySymbol(value, locale = "en") {
  const code = countryCodeFromValue(value);
  if (countrySet.has(code))
    return getDirectorySymbols(locale).countries.find(
      (item) => item.code === code,
    );
  const legacyFolder = !value || value === "📁" || value === "📂";
  const icon = iconByValue.get(
    legacyFolder
      ? value === "📂"
        ? "icon:folder-open"
        : "icon:folder"
      : value,
  );
  if (icon)
    return {
      ...icon,
      label: String(locale).startsWith("ar") ? icon.arabicLabel : icon.label,
    };
  return {
    value: value || "icon:folder",
    type: "custom",
    label: String(locale).startsWith("ar") ? "رمز مخصص" : "Custom icon",
  };
}
export function listDirectorySymbols({
  search = "",
  category = "all",
  locale = "en",
  limit = 50,
  offset = 0,
} = {}) {
  const { countries, iconGroups } = getDirectorySymbols(locale);
  const all = [...countries, ...iconGroups.flatMap((group) => group.icons)];
  const query = normalize(search);
  const items = all.filter(
    (item) =>
      (category === "all" || item.category === category) &&
      (!query ||
        normalize(
          [
            item.value,
            item.label,
            item.englishLabel,
            item.arabicLabel,
            item.aliases,
          ]
            .filter(Boolean)
            .join(" "),
        ).includes(query)),
  );
  const start = Math.max(0, Number(offset) || 0),
    count = Math.min(300, Math.max(1, Number(limit) || 50));
  return {
    items: items.slice(start, start + count),
    total: items.length,
    categories: [
      "all",
      "countries",
      ...DIRECTORY_ICON_GROUPS.map((group) => group.id),
    ],
  };
}
