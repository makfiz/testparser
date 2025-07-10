import readline from 'readline';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';
// import puppeteer from 'puppeteer-extra';
import findMatchingIndustry from './dictionaries/industries.js';
import findMatchingCompany from './companyMatcher.js';

// import { connect } from 'puppeteer-real-browser';
// import RecaptchaPlugin from 'puppeteer-extra-plugin-recaptcha';
// import ClickAndWaitPlugin from 'puppeteer-extra-plugin-click-and-wait';

import axios from 'axios';

// puppeteer.use(
//   RecaptchaPlugin({
//     provider: {
//       id: '2captcha', // Или 'anticaptcha' и т.п.
//       token: '08f4c8dfb330b4936d7dcdb25b35ecb6',
//     },
//     visualFeedback: true, // Подсветка капчи во время решения (опционально)
//   })
// );
// puppeteer.use(ClickAndWaitPlugin());
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const KEYFILE = path.join(__dirname, './my-nodejs-sheets-c019fa61949c.json');

const requiredColumns = [
  'first_name',
  'last_name',
  'company',
  'title',
  'prooflink',
  'location',
  'status',
  'ov_date',
  'email',
  'phone',
  'employees',
  'employees_prooflink',
  'subindustry',
  'industry',
  'asset',
  'date_engaged',
];

// const stealth = StealthPlugin();
// puppeteer.use(stealth);

function extractSpreadsheetId(url) {
  const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

// Функция извлечения listId (gid) из ссылки
function extractListId(url) {
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

  // const spreadsheetId = extractSpreadsheetId(url);
  // const listId = extractListId(url);

  const spreadsheetId = '1d44yez4vxbQlKhCzjf3QRnY6X5RlFHT2qUkG8UdrAFE';
  const listId = 384167586;

  if (!spreadsheetId) {
    console.error('Не удалось извлечь Spreadsheet ID из ссылки.');
    process.exit(1);
  }

  if (!listId) {
    console.error('Не удалось извлечь listId (gid) из ссылки.');
    process.exit(1);
  }

  console.log('spreadsheetId:', spreadsheetId);
  console.log('listId (gid):', listId);

  const auth = new google.auth.GoogleAuth({
    keyFile: KEYFILE,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheets = google.sheets({ version: 'v4', auth });
  let sheetTitle;

  // Получаем название листа по listId
  async function getSheetTitleById(sheetId) {
    const res = await sheets.spreadsheets.get({ spreadsheetId });
    const sheet = res.data.sheets.find((s) => s.properties.sheetId === sheetId);
    if (!sheet) throw new Error(`Лист с sheetId ${sheetId} не найден`);
    return sheet.properties.title;
  }

  try {
    sheetTitle = await getSheetTitleById(listId);
    console.log('Название листа:', sheetTitle);
    let rowIndex = 2;
    ////////////////////////////////////////////////////puppetr start
    // const { browser } = await connect({
    //   args: [],
    //   turnstile: true,
    //   headless: true,
    //   fingerprint: true,
    //   // disableXvfb: true,
    //   customConfig: {},
    //   connectOption: {
    //     defaultViewport: null,
    //   },
    // });
    // const connectedBrowser = await puppeteer.connect({
    //   browserWSEndpoint: browser.wsEndpoint(),
    // });
    // const page = await connectedBrowser.newPage();
    // await page.setUserAgent(
    //   'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36'
    // );
    // await page.setExtraHTTPHeaders({
    //   'Accept-Language': 'en-US,en;q=0.9',
    // });
    // await page.emulateTimezone('America/New_York');
    // await sheets.spreadsheets.values.update({
    //   spreadsheetId,
    //   range: `${sheetTitle}!P1:Q1`,
    //   valueInputOption: 'RAW',
    //   requestBody: {
    //     values: [['Status', 'Rapid_prooflink']],
    //   },
    // });

    ////////////////////////////////////////////////////puppetr end

    await normalizeSheetStructure(
      sheets,
      spreadsheetId,
      sheetTitle,
      requiredColumns
    );

    async function normalizeSheetStructure(
      sheets,
      spreadsheetId,
      sheetTitle,
      requiredColumns
    ) {
      // Получаем sheetId
      const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
      const sheet = spreadsheet.data.sheets.find(
        (s) => s.properties.title === sheetTitle
      );
      if (!sheet) throw new Error(`Лист "${sheetTitle}" не найден`);
      const sheetId = sheet.properties.sheetId;

      // Получаем текущие данные
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetTitle}`,
      });
      const rows = res.data.values || [];
      const headerRow = rows[0] || [];

      // Приводим заголовки к нижнему регистру для поиска
      let currentHeaders = headerRow.map((h) => h.toLowerCase());

      // Идём по requiredColumns и добавляем отсутствующие колонки на нужные места
      for (let i = 0; i < requiredColumns.length; i++) {
        const colName = requiredColumns[i].toLowerCase();

        if (!currentHeaders.includes(colName)) {
          // Вставляем колонку в позицию i с помощью insertDimension
          await sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            requestBody: {
              requests: [
                {
                  insertDimension: {
                    range: {
                      sheetId,
                      dimension: 'COLUMNS',
                      startIndex: i,
                      endIndex: i + 1,
                    },
                    inheritFromBefore: false,
                  },
                },
              ],
            },
          });

          // Обновляем заголовок новой колонки
          await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `${sheetTitle}!${columnIndexToLetter(i)}1`,
            valueInputOption: 'RAW',
            requestBody: {
              values: [[requiredColumns[i]]],
            },
          });

          // Обновляем текущий список заголовков, вставляя в i позицию
          currentHeaders.splice(i, 0, colName);

          // Также нужно расширить все строки, чтобы в них была новая пустая ячейка
          // Если таблица большая, это можно пропустить, т.к. insertDimension создаёт пустую колонку визуально
          // Но для консистентности данных лучше обновить строки
          for (let r = 1; r < rows.length; r++) {
            if (!rows[r]) rows[r] = [];
            rows[r].splice(i, 0, '');
          }
        }
      }

      // Обновляем весь диапазон, чтобы добавить пустые ячейки в новые колонки у строк
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetTitle}!A1`,
        valueInputOption: 'RAW',
        requestBody: {
          values:
            rows.length > 0
              ? [currentHeaders, ...rows.slice(1)]
              : [currentHeaders],
        },
      });

      // Теперь переставляем колонки, если нужно (обычно они уже на местах, но перестановка не повредит)
      // Для перестановки используем логику из предыдущего ответа:

      // Текущий порядок колонок
      let currentOrder = currentHeaders.slice();

      const requests = [];

      for (
        let targetIndex = 0;
        targetIndex < requiredColumns.length;
        targetIndex++
      ) {
        const colName = requiredColumns[targetIndex].toLowerCase();

        const currentPos = currentOrder.indexOf(colName);
        if (currentPos === -1 || currentPos === targetIndex) {
          continue;
        }

        requests.push({
          moveDimension: {
            source: {
              sheetId,
              dimension: 'COLUMNS',
              startIndex: currentPos,
              endIndex: currentPos + 1,
            },
            destinationIndex: targetIndex,
          },
        });

        // Обновляем порядок в массиве
        const [col] = currentOrder.splice(currentPos, 1);
        currentOrder.splice(targetIndex, 0, col);
      }

      if (requests.length > 0) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: { requests },
        });
      }

      console.log(
        'Отсутствующие колонки созданы на нужных позициях, и порядок колонок установлен'
      );
    }

    // Вспомогательная функция для преобразования индекса колонки в букву (A, B, C...)
    function columnIndexToLetter(index) {
      let letter = '';
      let temp = index + 1;

      while (temp > 0) {
        let rem = (temp - 1) % 26;
        letter = String.fromCharCode(65 + rem) + letter;
        temp = Math.floor((temp - 1) / 26);
      }

      return letter;
    }
    const headerRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetTitle}!1:1`,
    });
    const headers = headerRes.data.values?.[0] || [];

    // 2. Создать мапу заголовков к индексам
    const headerMap = {};
    headers.forEach((h, i) => {
      headerMap[h.toLowerCase()] = i;
    });

    // 3. Получить последний столбец по индексу заголовков
    const lastColLetter = columnIndexToLetter(headers.length - 1);

    // Получаем все данные с нужных колонок начиная со второй строки (данные, без заголовков)
    const dataRange = `${sheetTitle}!I2:N`;
    const dataRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: dataRange,
    });
    const rows = dataRes.data.values || [];

    // Формируем JSON
    const result = {};

    const subindustryIndex = 5; // например, подставь реальный индекс

    const filteredRows = rows.filter((row) => {
      const subVal = row[subindustryIndex];
      const mVal = row[4]; // колонка M внутри I-N диапазона

      return (
        subVal !== undefined &&
        subVal !== null &&
        subVal.toString().trim() !== '' &&
        mVal !== undefined &&
        mVal !== null &&
        mVal.toString().trim() !== ''
      );
    });

    filteredRows.forEach((row) => {
      const rawKey = row[0]; // колонка I
      if (!rawKey) return;

      const match = rawKey.toLowerCase().match(/@(.+)$/);
      if (!match) return;

      const key = match[1];

      result[key] = {
        K: row[2] || '',
        L: row[3] || '',
        M: row[4],
        N: row[5] || '',
      };
    });

    // Записываем в файл result.json в текущей папке
    const employeesPath = path.join(__dirname, './temp/employees.json');

    fs.writeFileSync(employeesPath, JSON.stringify(result, null, 2), 'utf-8');

    let emptyRowCount = 0;
    while (true) {
      // Читаем данные с листа

      // 4. Считать строку целиком по диапазону
      const data = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetTitle}!A${rowIndex}:${lastColLetter}${rowIndex}`,
      });
      const row = data.data.values?.[0] || [];

      // 5. Формируем объект, используя мапу
      const rowObject = {};
      for (const colName of requiredColumns) {
        const idx = headerMap[colName.toLowerCase()];
        rowObject[colName] = idx !== undefined ? row[idx] || '' : '';
      }

      // console.log(rowObject);
      console.log('rowObject', rowObject);
      if (emptyRowCount >= 1) {
        break; // Выход из цикла после 2 подряд пустых строк
      }
      if (!rowObject.first_name || !rowObject.last_name) {
        emptyRowCount++;
        rowIndex++;
        continue;
        // await browser.close();
      }

      if (
        !rowObject.prooflink ||
        !rowObject.prooflink.includes('linkedin.com/in')
      ) {
        emptyRowCount = 0;
        console.log(' prooflink пустой');
        ////////////////////////////////////////////////////puppetr start
        // const searchQuery = `site:linkedin.com/in ${rowObject.first_name} ${rowObject.last_name} ${rowObject.company}`;
        // const encodedQuery = encodeURIComponent(searchQuery);
        // const url = `https://www.google.com/search?q=${encodedQuery}`;

        try {
          // await page.goto(url, {
          //   waitUntil: 'networkidle2',
          // });
          ////////////////////////////////////////////////////puppetr end
          // === ЛОГИКА РАБОТЫ С API ДАННЫМИ ===

          let apiData = await fetchGoogleFullProfiles(rowObject);
          console.log('apiData', apiData);
          let experiences;

          // console.log('apiData', apiData);

          if (apiData.length > 0) {
            const filteredData = apiData.filter(
              (item) => (item._match_score || 0) >= 50
            );
            if (filteredData.length > 0) {
              const bestMatch = filteredData.reduce((max, curr) => {
                return curr._match_score > (max._match_score || 0) ? curr : max;
              }, {});
              experiences = bestMatch.experiences;
              console.log('bestMatch', bestMatch);
              console.log(' start Repid chek comp');
              ////////////////////////////////////// тест
              // const companyVariants = getCompanyVariants(
              //   rowObject.company,
              //   rowObject.email.trim()
              // );

              // // приводим все варианты к нижнему регистр
              // const companyArr = [];
              // // ищем все совпадения
              // const matchedExperience = experiences.find((exp) => {
              //   if (!exp.company) return false;
              //   companyArr.push(exp.company);
              //   const expCompanyLower = normalizeString(
              //     exp.company.toLowerCase()
              //   );
              //   return companyVariants.some((variant) =>
              //     expCompanyLower.includes(variant)
              //   );
              // });
              ////////////////////// тест
              ////////////////////// old company math logic /////////////////////
              // const companyVariants = getCompanyVariants(
              //   rowObject.company,
              //   rowObject.email.trim()
              // ).map((v) => normalizeString(v)); // нормализуем сразу все варианты

              // const companyArr = [];

              // const matchedExperience = experiences.find((exp) => {
              //   if (!exp.company) return false;

              //   companyArr.push(exp.company);
              // });

              //   const expCompanyLower = normalizeString(
              //     exp.company.toLowerCase()
              //   );

              //   // Проверяем совпадения по границам слова
              //   return companyVariants.some((variant) => {
              //     if (variant.length < 3) return false; // игнорируем слишком короткие варианты

              //     // Экранируем спецсимволы для RegExp
              //     const escapedVariant = variant.replace(
              //       /[.*+?^${}()|[\]\\]/g,
              //       '\\$&'
              //     );

              //     const regex = new RegExp(`\\b${escapedVariant}\\b`, 'i');

              //     return regex.test(expCompanyLower);
              //   });
              // });
              ////////////////////////////////////// old company math logic

              const firstName = rowObject.first_name.trim().toLowerCase();
              const lastName = rowObject.last_name.trim().toLowerCase();
              console.log('repid name', bestMatch.full_name.toLowerCase());
              const hasNameVariants = checkNameVariantsInText(
                bestMatch.full_name.toLowerCase(),
                firstName,
                lastName
              );

              // console.log()
              const companyArr = [];

              experiences.forEach((exp) => {
                if (exp.company) {
                  companyArr.push(exp.company);
                }
              });
              if (hasNameVariants.status) {
                if (rowObject.phone) {
                  await sheets.spreadsheets.values.update({
                    spreadsheetId,
                    range: `${sheetTitle}!J${rowIndex}`,
                    valueInputOption: 'RAW',
                    requestBody: {
                      values: [[bestMatch.phone]],
                    },
                  });
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
                    ],
                  },
                });

                const { company, email } = rowObject;
                const [matchedExperience, matchType, index] =
                  findMatchingCompany(company, experiences, email);
                console.log('Result:', matchedExperience, matchType, index);

                if (matchedExperience && matchedExperience != 'no match') {
                  // const firstMatch = matchedExperiences[0];
                  console.log('matchedExperience', matchedExperience);
                  if (matchedExperience.is_current) {
                    // console.log('Найдено совпадение, позиция текущая:', firstMatch);
                    await sheets.spreadsheets.values.update({
                      spreadsheetId,
                      range: `${sheetTitle}!D${rowIndex}`,
                      valueInputOption: 'RAW',
                      requestBody: {
                        values: [[matchedExperience.title]],
                      },
                    });
                    const [matched, matchType, index] = findMatchingCompany(
                      bestMatch.company,
                      [matchedExperience],
                      email
                    );
                    console.log(
                      'matched Result header comp. and expirence comp. :',
                      matched,
                      matchType,
                      index
                    );

                    if (
                      matched &&
                      matched != 'no match' &&
                      bestMatch.company_employee_count &&
                      bestMatch.company_linkedin_url &&
                      bestMatch.company_industry
                    ) {
                      const ind = findMatchingIndustry(
                        bestMatch.company_industry
                      );
                      console.log(
                        'Компания в Rapid совпадает с companyVariants и company info присутсвует'
                      );
                      await sheets.spreadsheets.values.update({
                        spreadsheetId,
                        range: `${sheetTitle}!K${rowIndex}:N${rowIndex}`,
                        valueInputOption: 'RAW',
                        requestBody: {
                          values: [
                            [
                              bestMatch.company_employee_range,
                              `${bestMatch.company_linkedin_url}/about`,
                              bestMatch.company_industry,
                              ind,
                            ],
                          ],
                        },
                      });
                    } else if (matched == 'no match') {
                      console.log(
                        'Компания в Rapid совпадает с companyVariants и company info отутсвует'
                      );

                      const employees = await findEmployeeByEmail(
                        rowObject.email
                      );
                      if (employees) {
                        console.log(employees);
                        await sheets.spreadsheets.values.update({
                          spreadsheetId,
                          range: `${sheetTitle}!K${rowIndex}:N${rowIndex}`,
                          valueInputOption: 'RAW',
                          requestBody: {
                            values: [
                              [
                                employees.K,
                                employees.L,
                                employees.M,
                                employees.N,
                              ],
                            ],
                          },
                        });
                      } else {
                        const compData = await fetchCompanyDataByDomain(
                          rowObject.email
                        );
                        if (compData) {
                          const {
                            company_name,
                            employee_range,
                            linkedin_url,
                            industries,
                          } = compData;
                          const [matched, matchType, index] =
                            findMatchingCompany(
                              company,
                              [{ company: company_name }],
                              email
                            );
                          console.log(
                            'matched Result header comp. and expirence comp. :',
                            matched,
                            matchType,
                            index
                          );
                          if (matched && matched != 'no match') {
                            const ind = findMatchingIndustry(industries[0]);
                            await sheets.spreadsheets.values.update({
                              spreadsheetId,
                              range: `${sheetTitle}!K${rowIndex}:N${rowIndex}`,
                              valueInputOption: 'RAW',
                              requestBody: {
                                values: [
                                  [
                                    employee_range,
                                    `${linkedin_url}/about`,
                                    industries[0],
                                    ind,
                                  ],
                                ],
                              },
                            });
                          }
                        }
                      }
                    }
                  } else if (
                    matchedExperience.is_current === false &&
                    !matchedExperience.end_year &&
                    (!matchedExperience.date_range || // null, undefined, пустое
                      (typeof matchedExperience.date_range === 'string' &&
                        matchedExperience.date_range.includes('-')))
                  ) {
                    console.log('ветхмй');

                    await sheets.spreadsheets.values.batchUpdate({
                      spreadsheetId,
                      requestBody: {
                        valueInputOption: 'RAW',
                        data: [
                          {
                            range: `${sheetTitle}!G${rowIndex}`,
                            values: [['!']],
                          },
                          {
                            range: `${sheetTitle}!D${rowIndex}`,
                            values: [[matchedExperience.title]],
                          },
                        ],
                      },
                    });
                  } else if (
                    matchedExperience.is_current === false &&
                    matchedExperience.end_year
                  ) {
                    console.log('retired');

                    await sheets.spreadsheets.values.batchUpdate({
                      spreadsheetId,
                      requestBody: {
                        valueInputOption: 'RAW',
                        data: [
                          {
                            range: `${sheetTitle}!G${rowIndex}`,
                            values: [['a']],
                          },
                          {
                            range: `${sheetTitle}!D${rowIndex}`,
                            values: [[matchedExperience.title]],
                          },
                        ],
                      },
                    });
                  } else {
                    console.log(
                      'Найдено совпадение, но позиция НЕ текущая:',
                      matchedExperience
                    );
                    await sheets.spreadsheets.values.update({
                      spreadsheetId,
                      range: `${sheetTitle}!G${rowIndex}`,
                      valueInputOption: 'RAW',
                      requestBody: {
                        values: [['not the actual company']],
                      },
                    });
                  }
                } else {
                  console.log('Совпадений в experiences не найдено.');
                  await sheets.spreadsheets.values.update({
                    spreadsheetId,
                    range: `${sheetTitle}!G${rowIndex}`,
                    valueInputOption: 'RAW',
                    requestBody: {
                      values: [['no company match in experiences']],
                    },
                  });
                }
              } else {
                await sheets.spreadsheets.values.update({
                  spreadsheetId,
                  range: `${sheetTitle}!G${rowIndex}`,
                  valueInputOption: 'RAW',
                  requestBody: {
                    values: [
                      [`not name match Rapid name:${bestMatch.full_name} `],
                    ],
                  },
                });
              }
            } else {
              await sheets.spreadsheets.values.update({
                spreadsheetId,
                range: `${sheetTitle}!G${rowIndex}`,
                valueInputOption: 'RAW',
                requestBody: {
                  values: [['not found or match_score < 70']],
                },
              });
            }
          } else {
            await sheets.spreadsheets.values.update({
              spreadsheetId,
              range: `${sheetTitle}!G${rowIndex}`,
              valueInputOption: 'RAW',
              requestBody: {
                values: [['not found or match_score < 70']],
              },
            });
          }

          ////////////////////////////////////////////////////puppetr start
          // const hasRecaptcha = await page.evaluate(() => {
          //   return (
          //     !!document.querySelector('.g-recaptcha') ||
          //     !!document.querySelector('iframe[src*="recaptcha"]')
          //   );
          // });

          // let solved = [];

          // if (hasRecaptcha) {
          //   console.log('hasRecaptcha', hasRecaptcha);
          //   const {
          //     captchas = [],
          //     solved: solvedCaptchas = [],
          //     error = null,
          //   } = await page.solveRecaptchas();
          //   solved = solvedCaptchas;
          //   if (solved.length) {
          //     console.log('Капча пройдена');
          //   }

          //   if (error) {
          //     console.error('Ошибка при решении капчи:', error);
          //   }
          // } else {
          //   console.log('Капча на странице не найдена');
          //   solved = [true]; // Просто чтобы пройти проверку ниже
          // }
          // if (solved.length) {
          //   await new Promise((r) => setTimeout(r, 1000));
          //   await page.screenshot({
          //     path: 'google_search.png',
          //     fullPage: true,
          //   });
          //   await page.waitForSelector('div[data-rpos="0"]', {
          //     timeout: 10000,
          //   });

          //   const blockText = await parser(page, 'div[data-rpos="0"]');

          //   // Вызов проверки
          //   const isMatch = checkBlockForPerson(blockText, rowObject);

          //   if (isMatch) {
          //     const url = await getLinkFromBlock(page, 'div[data-rpos="0"]');

          //     await sheets.spreadsheets.values.update({
          //       spreadsheetId,
          //       range: `${sheetTitle}!E${rowIndex}`,
          //       valueInputOption: 'RAW',
          //       requestBody: {
          //         values: [[url]],
          //       },
          //     });

          //     console.log('Ячейка E обновлена значением ссылки');
          //   } else {
          //     await sheets.spreadsheets.values.update({
          //       spreadsheetId,
          //       range: `${sheetTitle}!E${rowIndex}`,
          //       valueInputOption: 'RAW',
          //       requestBody: {
          //         values: [['No Info']],
          //       },
          //     });

          //     console.log('Ячейка E обновлена значением No Info');
          //   }

          //   rowIndex++;
          // } else {
          //   console.error('Ошибка при решении капчи:', error);
          // }
          ////////////////////////////////////////////////////puppetr end
          rowIndex++;
        } catch (error) {
          console.error('Ошибка при запросе  Rapid:', error.message);
          ////////////////////////////////////////////////////puppetr start
          // console.error('Ошибка при поиске в Google:', error.message);
          // if (
          //   error.message.includes(
          //     'Waiting for selector `div[data-rpos="0"]` failed: Waiting failed'
          //   )
          // ) {
          //   await sheets.spreadsheets.values.update({
          //     spreadsheetId,
          //     range: `${sheetTitle}!E${rowIndex}`, // Диапазон ячейки E2 на нужном листе
          //     valueInputOption: 'RAW',
          //     requestBody: {
          //       values: [['No Info']],
          //     },
          //   });
          //   rowIndex++;
          // }
          ////////////////////////////////////////////////////puppetr end
        }
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

// async function parser(page, selector) {
//   try {
//     await page.waitForSelector(selector);
//     const text = await page.$eval(selector, (el) => el.innerText.toLowerCase());
//     return text;
//   } catch (e) {
//     console.error(`❌ Ошибка при парсинге блока: ${e.message}`);
//     return '';
//   }
// }

// function checkBlockForPerson(text, person) {
//   const blockText = text.toLowerCase();

//   const firstName = person.first_name.trim().toLowerCase();
//   const lastName = person.last_name.trim().toLowerCase();
//   const company = person.company.trim().toLowerCase();
//   const title = person.title.trim().toLowerCase();

//   const hasNameVariants = checkNameVariantsInText(
//     blockText,
//     firstName,
//     lastName
//   );

//   // const hasFirstName = blockText.includes(firstName);
//   // const hasLastName = blockText.includes(lastName);
//   const companyVariants = getCompanyVariants(company, person.email.trim());
//   const hasCompany = companyVariants.some((variant) =>
//     blockText.includes(variant)
//   );
//   const hasTitle = blockText.includes(title);

//   const allFound = hasNameVariants.status && hasCompany;

//   console.log('\nРезультаты проверки блока текста:');
//   console.log('hasNameVariants:', hasNameVariants);
//   // console.log('hasFirstName:', hasFirstName);
//   // console.log('hasLastName:', hasLastName);
//   console.log('hasCompany:', hasCompany);
//   console.log('Тайтл найден:', hasTitle);

//   if (allFound) {
//     console.log('\n✅ Найдено совпадение!');
//     return true;
//   } else {
//     console.log('\n❌ Совпадение не найдено.');
//     return false;
//   }
// }

// async function getLinkFromBlock(page, selector) {
//   try {
//     const link = await page.$eval(selector, (el) => {
//       const a = el.querySelector('a');
//       return a ? a.href : null;
//     });

//     if (link && link.includes('linkedin')) {
//       return link;
//     } else {
//       return null;
//     }
//   } catch (e) {
//     console.error(`❌ Ошибка при получении ссылки: ${e.message}`);
//     return null;
//   }
// }

function checkNameVariantsInText(text, firstName, lastName) {
  const blockText = normalizeString(text);

  // Разбиваем имя и фамилию на слова
  const firstNameParts = normalizeString(firstName.trim())
    .split(/\s+/)
    .filter(Boolean);
  const lastNameParts = normalizeString(lastName.trim())
    .split(/\s+/)
    .filter(Boolean);

  // Функция генерации вариантов для одного слова
  function generateWordVariants(word) {
    const variants = new Set();
    if (!word) return [];

    variants.add(word);

    if (word.length > 0) {
      variants.add(word.charAt(0) + '.');
    }

    if (word.length > 3) {
      variants.add(word.slice(0, 2));
    }

    return Array.from(variants);
  }

  // Функция генерации всех возможных комбинаций из вариантов слов
  function generateAllCombinations(parts) {
    if (parts.length === 0) return [];

    const allVariants = parts.map(generateWordVariants);

    const combos = cartesianProduct(allVariants).map((words) =>
      words.join(' ')
    );

    // Добавим также варианты каждого слова по отдельности в общий список
    const flat = allVariants.flat();
    return Array.from(new Set([...combos, ...flat]));
  }

  // Генерируем массивы вариантов
  const firstNameVariants = generateAllCombinations(firstNameParts);
  const lastNameVariants = generateAllCombinations(lastNameParts);
  console.log('firstNameVariants', firstNameVariants);
  console.log('lastNameVariants', lastNameVariants);
  // Проверка: встречается ли в тексте хотя бы один вариант имени
  const fNameFound = firstNameVariants.some((variant) =>
    blockText.includes(variant)
  );

  // Проверка: встречается ли в тексте хотя бы один вариант фамилии
  const lNameFound = lastNameVariants.some((variant) =>
    blockText.includes(variant)
  );

  if (fNameFound && lNameFound) {
    console.log('Найдено совпадение по отдельным словам имени и фамилии');
    return {
      status: true,
    };
  }

  console.log('Совпадений имени не найдено.');
  return {
    status: false,
  };
}

// Вспомогательная функция для вычисления декартова произведения
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

// const COMPANY_EXCLUDE_WORDS = new Set([
//   'group',
//   'ltd',
//   'limited',
//   'corporation',
//   'corp',
//   'inc',
//   'co',
//   'company',
//   'plc',
//   'llc',
//   'sa',
//   'gmbh',
//   'ag',
//   'pte',
//   'pte.',
//   'pty',
//   'holdings',
// ]);

// const COMPANY_ABBR_DICTIONARY = {
//   mbc: 'middle east broadcasting',
//   bbc: 'british broadcasting',
//   cnn: 'cable news network',
//   cbh: 'Cherry Bekaert Advisory',
//   bcbs: 'Blue Cross and Blue Shield of Nebraska',
// };

// function getCompanyVariants(companyName, email = '') {
//   if (!companyName) return [];
//   console.log('\nПроверка вариантов company-name:');
//   const words = (companyName || '')
//     .split(/\s+/)
//     .map((w) => w.toLowerCase())
//     .filter((w) => w && !COMPANY_EXCLUDE_WORDS.has(w)); // служебные слова исключаем

//   const variants = new Set();
//   console.log('words', words);
//   if (words.length) {
//     variants.add(companyName.toLowerCase());
//     variants.add(normalizeString(companyName.toLowerCase()));

//     variants.add(words.join(' '));

//     // Аббревиатура
//     if (words.length > 1) {
//       // console.log('abr staertr');
//       const abbreviation = words.map((w) => w[0]).join('');
//       variants.add(abbreviation);
//       // console.log('abbreviation', abbreviation);

//       const expansion = COMPANY_ABBR_DICTIONARY[abbreviation];
//       // console.log('expansion', expansion);
//       if (expansion) {
//         variants.add(expansion);
//       }
//     } else {
//       const expansion = COMPANY_ABBR_DICTIONARY[words[0]];
//       // console.log('expansion', expansion);
//       if (expansion) {
//         variants.add(expansion);
//       }
//     }
//   }
//   // Комбинации из 2 и 3 слов
//   for (let i = 0; i < words.length; i++) {
//     for (let j = i + 1; j < Math.min(words.length, i + 3); j++) {
//       const combo = words.slice(i, j + 1).join(' ');
//       variants.add(combo);
//     }
//   }

//   // Извлечение домена из email (например, company из user@company.com)
//   const match = email.toLowerCase().match(/@([^.]+)\./);
//   if (match && match[1]) {
//     const domain = match[1];
//     if (COMPANY_ABBR_DICTIONARY[domain]) {
//       variants.add(COMPANY_ABBR_DICTIONARY[domain]);
//     }
//     if (domain.length < 3) {
//       variants.add(`at ${domain}`);
//     } else {
//       variants.add(domain);
//     }
//   }
//   const arr = Array.from(variants);
//   console.log('Паттерны:', arr);
//   return arr;
// }

async function fetchGoogleFullProfiles(person) {
  const options = {
    method: 'POST',
    url: 'https://web-scraping-api2.p.rapidapi.com/google-full-profiles',
    headers: {
      'x-rapidapi-key': '83f97c6dfemsh32a00fce7d3d88fp1b8a2bjsn25a4831ccc07',
      'x-rapidapi-host': 'web-scraping-api2.p.rapidapi.com',
      'Content-Type': 'application/json',
    },
    data: {
      name: `${person.first_name} ${person.last_name}`,
      company_name: `${person.company}`,
      job_title: '',
      location: '',
      keywords: '',
      limit: 1,
    },
  };
  // const options = {
  //   method: 'POST',
  //   url: 'https://fresh-linkedin-profile-data.p.rapidapi.com/google-full-profiles',
  //   headers: {
  //     'x-rapidapi-key': '83f97c6dfemsh32a00fce7d3d88fp1b8a2bjsn25a4831ccc07',
  //     'x-rapidapi-host': 'fresh-linkedin-profile-data.p.rapidapi.com',
  //     'Content-Type': 'application/json',
  //   },
  //   data: {
  //     name: `${person.first_name} ${person.last_name}`,
  //     company_name: `${person.company}`,
  //     job_title: '',
  //     location: '',
  //     keywords: '',
  //     limit: 1,
  //   },
  // };
  // console.log(options);
  try {
    const response = await axios.request(options);
    if (response.status === 200) {
      return response?.data?.data ?? [];
    } else {
      console.error(`Request failed with status ${response.status}`);
      return [];
    }
  } catch (error) {
    console.error(error);
    return [];
  }
}

async function fetchCompanyDataByDomain(email) {
  const domain = (/@(.+)$/.exec(email.toLowerCase()) || [])[1];
  const options = {
    method: 'GET',
    url: 'https://web-scraping-api2.p.rapidapi.com/get-company-by-domain',
    params: {
      domain: domain,
    },
    headers: {
      'x-rapidapi-key': '83f97c6dfemsh32a00fce7d3d88fp1b8a2bjsn25a4831ccc07',
      'x-rapidapi-host': 'web-scraping-api2.p.rapidapi.com',
    },
  };
  // const options = {
  //   method: 'GET',
  //   url: 'https://fresh-linkedin-profile-data.p.rapidapi.com/get-company-by-domain',
  //   params: {
  //     domain: domain,
  //   },
  //   headers: {
  //     'x-rapidapi-key': '83f97c6dfemsh32a00fce7d3d88fp1b8a2bjsn25a4831ccc07',
  //     'x-rapidapi-host': 'fresh-linkedin-profile-data.p.rapidapi.com',
  //   },
  // };
  // console.log(options);
  try {
    const response = await axios.request(options);
    if (response.status === 200) {
      console.log(response.data);
      return response.data.data;
    } else {
      console.error(`Request failed with status ${response.status}`);
      return null;
    }
  } catch (error) {
    console.error(error);
    return null;
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

    fs.readFile('./temp/employees.json', 'utf-8', (err, data) => {
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
