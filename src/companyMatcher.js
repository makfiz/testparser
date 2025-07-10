const COMPANY_ABBR_DICTIONARY = {
  mbc: 'middle east broadcasting',
  bbc: 'british broadcasting',
  cnn: 'cable news network',
  cbh: 'Cherry Bekaert Advisory',
  bcbs: 'Blue Cross and Blue Shield of Nebraska',
};
const IGNORE_TERMS = [
  'llc',
  'inc',
  'incorporated',
  'corp',
  'limited',
  'ltd',
  'gmbh',
  'co',
  'company',
  'foundation',
  'plc',
  'pty',
  'sa',
  'sl',
  'sau',
  'sarl',
  'ag',
  'kg',
  'ab',
  'oy',
  'kft',
  'nv',
  'bv',
  'llp',
  'lp',
  'spol',
  'as',
  'asa',
  'ooo',
  'zao',
  'ao',
  'tld',
  'pte',
  'bhd',
  'sdn bhd',
  'kk',
  'pao',
];

// --- Normalize (remove accents, etc.) ---
function normalizeText(text) {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// --- Clean company name into array of words ---
function cleanCompanyName(companyName) {
  const normalizedName = normalizeText(companyName);
  let cleanedName = normalizedName.replace(/-/g, ' ');
  console.log('cleanedName', cleanedName);
  cleanedName = normalizedName.replace(/[^a-zA-Z\s&]/g, '').trim();

  const ignorePattern = new RegExp(
    `\\b(?:${IGNORE_TERMS.map((term) =>
      term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    ).join('|')})\\b`,
    'gi'
  );
  cleanedName = cleanedName.replace(ignorePattern, '').trim();

  const words = cleanedName.split(/\s+/);
  return words.filter(Boolean);
}

// --- Alternative cleaner to produce lower-case words ---
function cleanCompanyNameForWords(companyName) {
  const normalizedName = normalizeText(companyName);

  // заменяем дефисы на пробелы
  let cleanedName = normalizedName.replace(/-/g, ' ');

  // убираем всё, кроме букв, цифр, пробелов и апострофа
  cleanedName = cleanedName.replace(/[^\w\s']/g, '').trim();

  // убираем слова из IGNORE_TERMS
  const ignorePattern = new RegExp(
    `\\b(?:${IGNORE_TERMS.map((term) =>
      term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    ).join('|')})\\b`,
    'gi'
  );
  cleanedName = cleanedName.replace(ignorePattern, '').trim();

  // приводим к одному пробелу подряд
  cleanedName = cleanedName.replace(/\s+/g, ' ');

  const words = cleanedName.toLowerCase().split(' ');
  return words.filter(Boolean);
}

// --- Build abbreviation from cleaned words ---
function getAbbreviation(words) {
  let abbreviation = '';

  for (const word of words) {
    if (word === word.toUpperCase()) {
      if (word.length > 4) {
        abbreviation += word[0].toLowerCase();
      } else {
        abbreviation += word.toLowerCase();
      }
    } else {
      const uppercaseLetters = [...word].filter((c) => c >= 'A' && c <= 'Z');
      if (uppercaseLetters.length > 1) {
        abbreviation += uppercaseLetters.join('').toLowerCase();
      } else if (uppercaseLetters.length === 1) {
        abbreviation += uppercaseLetters[0].toLowerCase();
      } else {
        abbreviation += word[0].toLowerCase();
      }
    }
  }

  return abbreviation;
}

// --- Calculate abbreviation match ratio ---
function abbreviationMatchRatio(companyWords, experienceWords) {
  const companyAbbr = getAbbreviation(companyWords);
  const experienceAbbr = getAbbreviation(experienceWords);

  console.log('  ▶ Abbreviation check:');
  console.log(`    - Table company abbreviation: ${companyAbbr}`);
  console.log(`    - Experience company abbreviation: ${experienceAbbr}`);

  if (!companyAbbr || !experienceAbbr) return 0.0;

  const commonLetters = new Set(
    [...companyAbbr].filter((char) => experienceAbbr.includes(char))
  );

  const matches = commonLetters.size;
  const maxLen = Math.max(companyAbbr.length, experienceAbbr.length);

  const similarity =
    companyAbbr.length > 2 || experienceAbbr.length > 2
      ? matches / maxLen
      : 0.0;

  return similarity;
}

// --- Calculate word-level match ratio ---
function wordMatchRatio(words1, words2) {
  const set1 = new Set(words1);
  const set2 = new Set(words2);
  const commonWords = [...set1].filter((w) => set2.has(w));
  const ratio = commonWords.length / Math.max(set1.size, set2.size);

  return ratio;
}

// --- Check subset match ---
function checkSubsetMatch(companyWords, experienceWords) {
  const companyWordsLower = companyWords
    .filter((w) => w.length >= 2)
    .map((w) => w.toLowerCase());
  const experienceWordsLower = experienceWords
    .filter((w) => w.length >= 2)
    .map((w) => w.toLowerCase());

  if (companyWordsLower.length === 0 || experienceWordsLower.length === 0) {
    return [null, null];
  }

  const companyInExperience = companyWordsLower.every((cw) =>
    experienceWordsLower.some((ew) => ew === cw || ew.includes(cw))
  );

  if (companyInExperience) {
    return ['table_in_experience', companyWords];
  }

  const experienceInCompany = experienceWordsLower.every((ew) =>
    companyWordsLower.some((cw) => cw === ew || cw.includes(ew))
  );

  if (experienceInCompany) {
    return ['experience_in_table', experienceWords];
  }

  return [null, null];
}

// --- Main matcher ---
export default function findMatchingCompany(
  companyName,
  experiences,
  emailDomain,
  threshold = 0.3,
  abbrThreshold = 0.7
) {
  const companyCleaned = cleanCompanyName(companyName);

  // --- Subset matching ---
  for (let i = 0; i < experiences.length; i++) {
    const experience = experiences[i];
    const expCompanyName = experience.company;
    const expCleaned = cleanCompanyName(expCompanyName);

    console.log(`▶ Company from table: ${companyName} (${companyCleaned})`);
    console.log(`  Experience company: ${expCompanyName} (${expCleaned})`);

    const [matchType, matchedWords] = checkSubsetMatch(
      companyCleaned,
      expCleaned
    );
    if (matchType) {
      console.log(`  ✔ Subset match (${matchType}): ${matchedWords}`);
      return [experience, matchType, i];
    }

    console.log('No subset match');
  }

  // --- Word match ratio ---
  const companyWords = cleanCompanyNameForWords(companyName);

  for (let i = 0; i < experiences.length; i++) {
    const experience = experiences[i];
    const expWords = cleanCompanyNameForWords(experience.company);

    console.log(`▶ Company from table: ${companyName} (${companyWords})`);

    const similarity = wordMatchRatio(companyWords, expWords);
    if (similarity >= threshold) {
      console.log(`  Experience company: ${experience.company} (${expWords})`);
      console.log(
        `  Company match found! Similarity: ${similarity.toFixed(2)}`
      );
      console.log(
        `  Common words: ${companyWords.filter((w) => expWords.includes(w))}`
      );

      return [experience, 'name_match', i];
    }
  }

  // --- Abbreviation match ---
  let allAbbrSimilarity = [];

  for (let i = 0; i < experiences.length; i++) {
    const experience = experiences[i];
    const expCleaned = cleanCompanyName(experience.company);
    const companyCleaned = cleanCompanyName(companyName);

    console.log(`▶ Company from table: ${companyName} (${companyCleaned})`);
    console.log(`  Experience company: ${experience.company} (${expCleaned})`);

    const abbrSimilarity = abbreviationMatchRatio(companyCleaned, expCleaned);

    console.log(`  Abbreviation similarity: ${abbrSimilarity.toFixed(2)}`);
    console.log(
      `  Common words: ${companyCleaned.filter((w) => expCleaned.includes(w))}`
    );

    allAbbrSimilarity.push([experience, abbrSimilarity, i]);
  }

  if (allAbbrSimilarity.length > 0) {
    const [bestExperience, maxSimilarity, bestIdx] = allAbbrSimilarity.reduce(
      (a, b) => {
        return a[1] > b[1] ? a : b;
      }
    );

    if (maxSimilarity >= abbrThreshold) {
      console.log(
        `  ✔ Matched company (abbreviation-based): ${bestExperience.company}`
      );
      return [bestExperience, 'abbr_match', bestIdx];
    }
  }
  // --- Abbreviation dictionary matching ---
  for (const [abbr, fullName] of Object.entries(COMPANY_ABBR_DICTIONARY)) {
    const companyAbbr = getAbbreviation(companyCleaned);

    if (abbr.toLowerCase() === companyAbbr.toLowerCase()) {
      console.log(
        `  ▶ Found abbreviation "${abbr}" in dictionary. Full name: "${fullName}"`
      );

      // Clean the full name from dictionary
      const dictCleanedWords = cleanCompanyNameForWords(fullName);

      for (let i = 0; i < experiences.length; i++) {
        const experience = experiences[i];
        const expWords = cleanCompanyNameForWords(experience.company);

        // Try subset match first
        const [matchType, matchedWords] = checkSubsetMatch(
          dictCleanedWords,
          expWords
        );
        if (matchType) {
          console.log(
            `  ✔ Dictionary subset match (${matchType}): ${matchedWords}`
          );
          return [experience, 'abbr_dict_match', i];
        }

        // Fallback to word ratio
        const similarity = wordMatchRatio(dictCleanedWords, expWords);
        if (similarity >= threshold) {
          console.log(
            `  ✔ Dictionary word match! Similarity: ${similarity.toFixed(2)}`
          );
          console.log(`    Dictionary words: ${dictCleanedWords}`);
          console.log(`    Experience words: ${expWords}`);
          return [experience, 'abbr_dict_match', i];
        }
      }
    }
  }
  // --- Domain matching ---
  if (emailDomain && emailDomain !== 'no info') {
    console.log(`  ▶ Checking domain match for domain: ${emailDomain}`);
    const domainBase = extractBaseDomain(emailDomain);
    const domainParts = domainBase.split('.').filter(Boolean);

    for (let i = 0; i < experiences.length; i++) {
      const experience = experiences[i];
      const companyWords = cleanCompanyNameForWords(experience.company);

      console.log(`  Company words: ${companyWords}`);
      console.log(`  Domain parts: ${domainParts}`);

      for (const word of companyWords) {
        if (
          domainParts.some((part) => part.toLowerCase() === word.toLowerCase())
        ) {
          console.log(
            `  ✔ Domain match found for word "${word}" in domain "${emailDomain}"`
          );
          console.log(`  Matched company: ${experience.company}`);
          return [experience, 'domain_match', i];
        }
      }
    }
    console.log(`  ✘ No domain match found!`);
  }

  console.log(`  ✘ No match found!`);
  return ['no match', 'no match', -1];
}

function extractBaseDomain(email) {
  if (!email || !email.includes('@')) return null;

  const domain = email.split('@')[1];
  const parts = domain.split('.');

  if (parts.length >= 2) {
    return parts[parts.length - 2];
  } else {
    return domain;
  }
}
