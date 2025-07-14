import readline from 'readline';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';

import findMatchingIndustry from './dictionaries/industries.js';
import findMatchingCompany from './companyMatcher.js';
import {
  fetchGoogleFullProfiles,
  fetchCompanyDataByDomain,
} from './rapidApi.js';
import { checkNameVariantsInText } from './nameMatcher.js';
import {
  getSheetsClient,
  getSheetTitleById,
  updateCell,
  normalizeSheetStructure,
  processSheetData,
  getRow,
} from './sheetsService.js';

// import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function extractSpreadsheetId(url) {
  const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

// Функция извлечения listId (gid) из ссылки
function extractSheetId(url) {
  // Ищем gid в параметрах ?gid= или #gid=
  const match = url.match(/[?&]gid=(\d+)/) || url.match(/#gid=(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

// Функция для запроса ввода с консоли
function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans);
    })
  );
}

// Основная логика
async function main() {
  const url = await askQuestion('Введи ссылку на Google Sheets: ');

  const spreadsheetId = extractSpreadsheetId(url);
  const sheetId = extractSheetId(url);

  // const spreadsheetId = '1d44yez4vxbQlKhCzjf3QRnY6X5RlFHT2qUkG8UdrAFE';
  // const sheetId = 384167586;

  if (!spreadsheetId) {
    console.error('Не удалось извлечь Spreadsheet ID из ссылки.');
    process.exit(1);
  }

  if (!sheetId) {
    console.error('Не удалось извлечь sheetId (gid) из ссылки.');
    process.exit(1);
  }

  console.log('spreadsheetId:', spreadsheetId);
  console.log('sheetId (gid):', sheetId);

  const sheets = getSheetsClient();
  let sheetTitle;

  try {
    sheetTitle = await getSheetTitleById(sheets, spreadsheetId, sheetId);
    console.log('Название листа:', sheetTitle);
    let rowIndex = 2;

    await normalizeSheetStructure(sheets, spreadsheetId, sheetId, sheetTitle);
    const { lastColLetter, headerMap } = await processSheetData(
      sheets,
      spreadsheetId,
      sheetTitle
    );

    let emptyRowCount = 0;
    while (true) {
      const rowObject = await getRow({
        sheets,
        spreadsheetId,
        sheetTitle,
        rowIndex,
        lastColLetter,
        headerMap,
      });

      console.log('rowObject', rowObject);

      if (emptyRowCount >= 1) {
        break;
      }

      if (!rowObject.first_name || !rowObject.last_name) {
        emptyRowCount++;
        rowIndex++;
        continue;
      }

      if (
        !rowObject.prooflink ||
        !rowObject.prooflink.includes('linkedin.com/in')
      ) {
        emptyRowCount = 0;
        console.log(' prooflink пустой');

        await processRapidLogic({
          sheets,
          spreadsheetId,
          sheetTitle,
          rowObject,
          rowIndex,
          headerMap,
          lastColLetter,
        });

        rowIndex++;
      } else {
        rowIndex++;
        await new Promise((r) => setTimeout(r, 250));
      }
    }
  } catch (e) {
    console.error('Ошибка:', e.message);
  }
}

main();

async function processRows({
  sheets,
  spreadsheetId,
  sheetTitle,
  rowIndex,
  rowObject,
  bestMatch,
}) {
  const { company, email } = rowObject;
  const { experiences } = bestMatch;

  const companyArr = [];
  for (const exp of experiences) {
    if (exp.company) {
      companyArr.push(exp.company);
    }
  }

  const [matchedExperience, matchType, index] = findMatchingCompany(
    company,
    experiences,
    email
  );

  console.log('Result:', matchedExperience, matchType, index);

  if (matchedExperience && matchedExperience !== 'no match') {
    if (!rowObject.phone) {
      await updateCell(sheets, spreadsheetId, `${sheetTitle}!J${rowIndex}`, [
        bestMatch.phone,
      ]);
    }

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: 'RAW',
        data: [
          {
            range: `${sheetTitle}!E${rowIndex}:F${rowIndex}`,
            values: [[bestMatch.linkedin_url, bestMatch.location]],
          },
          {
            range: `${sheetTitle}!Q${rowIndex}`,
            values: [[companyArr.join(', ')]],
          },
          {
            range: `${sheetTitle}!R${rowIndex}`,
            values: [[bestMatch._match_score]],
          },
        ],
      },
    });
    if (matchedExperience.is_current) {
      await updateCell(sheets, spreadsheetId, `${sheetTitle}!D${rowIndex}`, [
        matchedExperience.title,
      ]);

      const [matched, matchType2] = findMatchingCompany(
        bestMatch.company,
        [matchedExperience],
        email
      );

      console.log(
        'matched Result header comp. and experience comp.:',
        matched,
        matchType2
      );

      if (
        matched &&
        matched !== 'no match' &&
        bestMatch.company_employee_count &&
        bestMatch.company_linkedin_url &&
        bestMatch.company_industry
      ) {
        const ind = findMatchingIndustry(bestMatch.company_industry);
        await updateCell(
          sheets,
          spreadsheetId,
          `${sheetTitle}!K${rowIndex}:N${rowIndex}`,
          [
            bestMatch.company_employee_range,
            `${bestMatch.company_linkedin_url}/about`,
            bestMatch.company_industry,
            ind,
          ]
        );
      } else {
        const employees = await findEmployeeByEmail(rowObject.email);
        if (employees) {
          console.log(employees);
          await updateCell(
            sheets,
            spreadsheetId,
            `${sheetTitle}!K${rowIndex}:N${rowIndex}`,
            [employees.K, employees.L, employees.M, employees.N]
          );
        } else {
          const compData = await fetchCompanyDataByDomain(rowObject.email);
          if (compData) {
            const { company_name, employee_range, linkedin_url, industries } =
              compData;

            const [matchedComp] = findMatchingCompany(
              company,
              [{ company: company_name }],
              email
            );

            if (matchedComp && matchedComp !== 'no match') {
              const ind = findMatchingIndustry(industries[0]);
              await updateCell(
                sheets,
                spreadsheetId,
                `${sheetTitle}!K${rowIndex}:N${rowIndex}`,
                [employee_range, `${linkedin_url}/about`, industries[0], ind]
              );
            }
          }
        }
      }
    } else if (
      matchedExperience.is_current === false &&
      !matchedExperience.end_year &&
      (!matchedExperience.date_range ||
        (typeof matchedExperience.date_range === 'string' &&
          matchedExperience.date_range.includes('-')))
    ) {
      console.log('ветхий');
      await updateCell(sheets, spreadsheetId, `${sheetTitle}!G${rowIndex}`, [
        '!',
      ]);
      await updateCell(sheets, spreadsheetId, `${sheetTitle}!D${rowIndex}`, [
        matchedExperience.title,
      ]);
    } else if (
      matchedExperience.is_current === false &&
      matchedExperience.end_year
    ) {
      console.log('retired');
      await updateCell(sheets, spreadsheetId, `${sheetTitle}!G${rowIndex}`, [
        'a',
      ]);
      await updateCell(sheets, spreadsheetId, `${sheetTitle}!D${rowIndex}`, [
        matchedExperience.title,
      ]);
    }
  } else {
    console.log('Совпадений в experiences не найдено.');
    await updateCell(sheets, spreadsheetId, `${sheetTitle}!G${rowIndex}`, [
      'no company match in experiences',
      // 'no info',
    ]);
  }
}

async function processRapidLogic({
  sheets,
  spreadsheetId,
  sheetTitle,
  rowObject,
  rowIndex,
  headerMap,
  lastColLetter,
}) {
  try {
    let apiData = await fetchGoogleFullProfiles(rowObject);
    console.log('apiData', apiData);

    if (apiData.length > 0) {
      const filteredData = apiData.filter(
        (item) => (item._match_score || 0) >= 1
      );

      if (filteredData.length > 0) {
        const bestMatch = filteredData.reduce((max, curr) => {
          return curr._match_score > (max._match_score || 0) ? curr : max;
        }, {});
        console.log('bestMatch', bestMatch);

        const firstName = rowObject.first_name.trim().toLowerCase();
        const lastName = rowObject.last_name.trim().toLowerCase();
        const hasNameVariants = checkNameVariantsInText(
          bestMatch.full_name.toLowerCase(),
          firstName,
          lastName
        );

        if (hasNameVariants.status) {
          await processRows({
            sheets,
            spreadsheetId,
            sheetTitle,
            rowIndex,
            rowObject,
            bestMatch,
          });
        } else {
          await updateCell(
            sheets,
            spreadsheetId,
            `${sheetTitle}!G${rowIndex}`[
              [`not name match Rapid name:${bestMatch.full_name} `]
              // `no info `
            ]
          );
        }
      } else {
        await updateCell(sheets, spreadsheetId, `${sheetTitle}!G${rowIndex}`, [
          `no info `,
        ]);
      }
    } else {
      await updateCell(sheets, spreadsheetId, `${sheetTitle}!G${rowIndex}`, [
        `no info `,
      ]);
    }
  } catch (error) {
    console.error('Ошибка при запросе Rapid:', error.message);
  }
}

function findEmployeeByEmail(email) {
  return new Promise((resolve) => {
    if (!email) {
      console.log('Email отсутствует');
      return resolve(null);
    }

    const match = email.toLowerCase().match(/@(.+)$/);
    if (!match) {
      console.log('Не удалось извлечь домен из email:', email);
      return resolve(null);
    }

    const domain = match[1];
    console.log('Искомый домен:', domain);
    const filePath = path.join(__dirname, 'temp', 'employees.json');
    fs.readFile(filePath, 'utf-8', (err, data) => {
      if (err) {
        console.error('Ошибка чтения employees.json:', err);
        return resolve(null);
      }

      let employeesData;
      try {
        employeesData = JSON.parse(data);
      } catch (parseErr) {
        console.error('Ошибка разбора JSON:', parseErr);
        return resolve(null);
      }

      const employeeInfo = employeesData[domain];
      if (!employeeInfo) {
        console.log('Данные для домена не найдены:', domain);
        return resolve(null);
      }

      // console.log('Найдены данные:', employeeInfo);
      return resolve(employeeInfo);
    });
  });
}
