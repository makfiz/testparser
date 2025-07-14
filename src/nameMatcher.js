export function checkNameVariantsInText(text, firstName, lastName) {
  const blockText = normalizeString(text);

  const firstNameParts = normalizeString(firstName.trim())
    .split(/\s+/)
    .filter(Boolean);
  const lastNameParts = normalizeString(lastName.trim())
    .split(/\s+/)
    .filter(Boolean);

  // Для имени - с усечением
  const firstNameVariants = generateAllCombinations(firstNameParts, true);
  // Для фамилии - без усечения
  const lastNameVariants = generateAllCombinations(lastNameParts, false);

  const fNameFound = firstNameVariants.some((variant) =>
    blockText.includes(variant)
  );
  const lNameFound = lastNameVariants.some((variant) =>
    blockText.includes(variant)
  );

  return { status: fNameFound && lNameFound };
}

// Добавляем параметр cutWords, чтобы управлять обрезкой
function generateAllCombinations(parts, cutWords) {
  if (parts.length === 0) return [];

  const allVariants = parts.map((part) => generateWordVariants(part, cutWords));
  const combos = cartesianProduct(allVariants).map((words) => words.join(' '));

  return Array.from(new Set([...combos, ...allVariants.flat()]));
}

// Добавляем параметр cutWord, если false - не обрезаем
function generateWordVariants(word, cutWord) {
  const variants = new Set();
  if (!word) return [];

  variants.add(word);
  variants.add(word.charAt(0) + '.');

  if (cutWord && word.length > 3) {
    variants.add(word.slice(0, 2));
  }

  return Array.from(variants);
}

function cartesianProduct(arrays) {
  return arrays.reduce(
    (acc, curr) => acc.flatMap((a) => curr.map((c) => a.concat([c]))),
    [[]]
  );
}

function normalizeString(str) {
  return str
    .toLowerCase()
    .normalize('NFD') // разложение символов с диакритиками на базовый + диакритик
    .replace(/[\u0300-\u036f]/g, ''); // удаление диакритиков
}
