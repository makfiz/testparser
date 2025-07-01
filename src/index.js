const readline = require('readline');
const { google } = require('googleapis');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const RecaptchaPlugin = require('puppeteer-extra-plugin-recaptcha');

puppeteer.use(
  RecaptchaPlugin({
    provider: {
      id: '2captcha', // Или 'anticaptcha' и т.п.
      token: '08f4c8dfb330b4936d7dcdb25b35ecb6',
    },
    visualFeedback: true, // Подсветка капчи во время решения (опционально)
  })
);

const KEYFILE = './my-nodejs-sheets-7b4c590c9ba6.json';

const headers = [
  'first_name',
  'last_name',
  'company',
  'title',
  'prooflink',
  'ov_date',
  'email',
  'phone',
  'employees',
  'employees_prooflink',
  'industry',
  'asset',
  'date_engaged',
];

const stealth = StealthPlugin();
puppeteer.use(stealth);

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

  const spreadsheetId = '1RE5U_gUq-gatGubvdhJvw-CHd2vkbszEBuHv6MSSr0k';
  const listId = 1669197484;

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
    const browser = await puppeteer.launch({
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36'
    );
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
    });
    await page.emulateTimezone('Europe/Kiev');
    await page.setViewport({ width: 1366, height: 768 });
    while (true) {
      // Читаем данные с листа
      const data = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetTitle}!A${rowIndex}:M${rowIndex}`,
      });

      const row = (data.data.values && data.data.values[0]) || [];

      // Формируем объект
      const rowObject = {};
      headers.forEach((header, idx) => {
        rowObject[header] = row[idx] || ''; // если нет значения, ставим пустую строку
      });

      console.log(rowObject);
      if (!rowObject.first_name || !rowObject.last_name) {
        await browser.close();
        break;
      }
      if (!rowObject.prooflink && rowObject.prooflink.trim() == '') {
        console.log(' prooflink пустой');
        const searchQuery = `site:linkedin.com/in ${rowObject.first_name} ${rowObject.last_name} ${rowObject.company}`;
        const encodedQuery = encodeURIComponent(searchQuery);
        const url = `https://www.google.com/search?q=${encodedQuery}`;

        try {
          await page.goto(url, {
            waitUntil: 'networkidle2',
          });
          await solveAllRecaptchas(page);
          // const { solved, error } = await page.solveRecaptchas();

          if (solved.length) {
            console.log('Капчи успешно решены');
            await new Promise((r) => setTimeout(r, 1000));
            await page.screenshot({
              path: 'google_search.png',
              fullPage: true,
            });
            await page.waitForSelector('div[data-rpos="0"]');

            const blockText = await parser(page, 'div[data-rpos="0"]');

            // Вызов проверки
            const isMatch = checkBlockForPerson(blockText, rowObject);
            if (isMatch) {
              const url = await getLinkFromBlock(page, 'div[data-rpos="0"]');
              await sheets.spreadsheets.values.update({
                spreadsheetId,
                range: `${sheetTitle}!E${rowIndex}`, // Диапазон ячейки E2 на нужном листе
                valueInputOption: 'RAW', // Значение вставляем как есть
                requestBody: {
                  values: [[url]], // Двумерный массив значений (строка, колонка)
                },
              });
              rowIndex++;
              console.log('Ячейка E2 обновлена значением ссылки');
            } else {
              await sheets.spreadsheets.values.update({
                spreadsheetId,
                range: `${sheetTitle}!E${rowIndex}`, // Диапазон ячейки E2 на нужном листе
                valueInputOption: 'RAW', // Значение вставляем как есть
                requestBody: {
                  values: [['No Info']], // Двумерный массив значений (строка, колонка)
                },
              });
              rowIndex++;
            }
          }

          if (error) {
            console.error('Ошибка при решении капчи:', error);
          }
          // Вводим поисковый запрос

          // Получаем ссылки из результатов поиска
          // const results = await page.$$eval(
          //   'div[data-rpos="0"]',
          //   (nodes, firstName, lastName) => {
          //     return nodes
          //       .map((node) => {
          //         const linkEl = node.querySelector('a');
          //         const titleEl = node.querySelector('h3');

          //         if (linkEl && titleEl) {
          //           const titleText = titleEl.innerText.trim().toLowerCase();
          //           // Проверяем, есть ли имя и фамилия в заголовке (регистр не важен)
          //           if (
          //             titleText.includes(firstName.toLowerCase()) &&
          //             titleText.includes(lastName.toLowerCase())
          //           ) {
          //             return {
          //               title: titleEl.innerText.trim(),
          //               url: linkEl.href,
          //             };
          //           }
          //         }
          //         return null;
          //       })
          //       .filter((item) => item !== null);
          //   },
          //   rowObject.first_name,
          //   rowObject.last_name
          // );

          // console.log('Результаты, содержащие имя и фамилию:');
          // console.log(results);
        } catch (error) {
          console.error('Ошибка при поиске в Google:', error.message);
          if (
            error.message.includes(
              'Waiting for selector `div[data-rpos="0"]` failed: Waiting failed'
            )
          ) {
            await sheets.spreadsheets.values.update({
              spreadsheetId,
              range: `${sheetTitle}!E${rowIndex}`, // Диапазон ячейки E2 на нужном листе
              valueInputOption: 'RAW', // Значение вставляем как есть
              requestBody: {
                values: [['No Info']], // Двумерный массив значений (строка, колонка)
              },
            });
          }
        } finally {
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

async function parser(page, selector) {
  try {
    await page.waitForSelector(selector);
    const text = await page.$eval(selector, (el) => el.innerText.toLowerCase());
    return text;
  } catch (e) {
    console.error(`❌ Ошибка при парсинге блока: ${e.message}`);
    return '';
  }
}

function checkBlockForPerson(text, person) {
  const blockText = text.toLowerCase();

  const firstName = person.first_name.trim().toLowerCase();
  const lastName = person.last_name.trim().toLowerCase();
  const company = person.company.trim().toLowerCase();
  const title = person.title.trim().toLowerCase();

  const hasNameVariants = checkNameVariantsInText(
    blockText,
    firstName,
    lastName
  );

  // const hasFirstName = blockText.includes(firstName);
  // const hasLastName = blockText.includes(lastName);
  const hasCompany = blockText.includes(company);
  const hasTitle = blockText.includes(title);

  const allFound = hasNameVariants && hasCompany;

  console.log('\nРезультаты проверки блока текста:');
  console.log('hasNameVariants:', hasNameVariants);
  // console.log('hasFirstName:', hasFirstName);
  // console.log('hasLastName:', hasLastName);
  console.log('hasCompany:', hasCompany);
  console.log('Тайтл найден:', hasTitle);

  if (allFound) {
    console.log('\n✅ Найдено совпадение!');
    return true;
  } else {
    console.log('\n❌ Совпадение не найдено.');
    return false;
  }
}

async function getLinkFromBlock(page, selector) {
  try {
    const link = await page.$eval(selector, (el) => {
      const a = el.querySelector('a');
      return a ? a.href : null;
    });

    if (link && link.includes('linkedin')) {
      return link;
    } else {
      return null;
    }
  } catch (e) {
    console.error(`❌ Ошибка при получении ссылки: ${e.message}`);
    return null;
  }
}

function checkNameVariantsInText(text, firstName, lastName) {
  const blockText = normalizeString(text.toLowerCase());
  const fName = firstName.trim().toLowerCase();
  const lName = lastName.trim().toLowerCase();

  const firstInitial = fName.charAt(0);
  const lastInitial = lName.charAt(0);

  const nameVariants = [
    `${fName} ${lName}`, // Laurent Prebende
    `${fName} ${lastInitial}.`, // Laurent P.
    `${firstInitial}. ${lName}`, // L. Prebende
    `${firstInitial}. ${lastInitial}.`, // L. P.
  ];

  const found = nameVariants.some((variant) => blockText.includes(variant));

  console.log('\n Проверка вариантов имени:');
  console.log('Паттерны:', nameVariants);
  console.log('Найдено:', found);

  return found;
}

function normalizeString(str) {
  return str
    .toLowerCase()
    .normalize('NFD') // разложение символов с диакритиками на базовый + диакритик
    .replace(/[\u0300-\u036f]/g, ''); // удаление диакритиков
}

async function solveAllRecaptchas(page, maxAttempts = 3) {
  for (let i = 0; i < maxAttempts; i++) {
    const { captchas, solved, error } = await page.solveRecaptchas();
    console.log(
      `Попытка ${i + 1}: капч найдено ${captchas.length}, решено ${
        solved.length
      }`
    );
    if (captchas.length === 0) {
      // Капч больше нет — выходим
      return true;
    }
    if (error) {
      console.warn('Ошибка при решении капчи:', error);
      break; // или попробуй ещё раз
    }
    // Подожди немного, чтобы страница успела обновиться после решения
    await new Promise((r) => setTimeout(r, 3000));
  }
  return false; // капчи так и остались
}
