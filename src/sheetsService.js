import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import { fileURLToPath } from 'url';

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

export async function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: KEYFILE,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return google.sheets({ version: 'v4', auth });
}

export async function getSheetTitleById(sheets, sheetId) {
  const res = await sheets.spreadsheets.get({ spreadsheetId });
  const sheet = res.data.sheets.find((s) => s.properties.sheetId === sheetId);
  if (!sheet) throw new Error(`Sheet with ID ${sheetId} not found`);
  return sheet.properties.title;
}

export async function updateCell(sheets, sheetId, range, value) {
  await sheets.spreadsheets.values.update({
    sheetId,
    range,
    valueInputOption: 'RAW',
    requestBody: {
      values: [[value]],
    },
  });
}

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

export async function normalizeSheetStructure(sheets, sheetId, sheetTitle) {
  // Получаем sheetId
  //   const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
  //   const sheet = spreadsheet.data.sheets.find(
  //     (s) => s.properties.title === sheetTitle
  //   );
  //   if (!sheet) throw new Error(`Лист "${sheetTitle}" не найден`);
  //   const sheetId = sheet.properties.sheetId;

  // Получаем текущие данные
  const res = await sheets.spreadsheets.values.get({
    sheetId,
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
        sheetId,
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
        sheetId,
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
    sheetId,
    range: `${sheetTitle}!A1`,
    valueInputOption: 'RAW',
    requestBody: {
      values:
        rows.length > 0 ? [currentHeaders, ...rows.slice(1)] : [currentHeaders],
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
      sheetId,
      requestBody: { requests },
    });
  }

  console.log(
    'Отсутствующие колонки созданы на нужных позициях, и порядок колонок установлен'
  );
}

export async function processSheetData(sheets, sheetId, sheetTitle) {
  // Получаем заголовки первой строки
  const headerRes = await sheets.spreadsheets.values.get({
    sheetId,
    range: `${sheetTitle}!1:1`,
  });
  const headers = headerRes.data.values?.[0] || [];

  // Формируем мапу заголовков к индексам
  const headerMap = {};
  headers.forEach((h, i) => {
    headerMap[h.toLowerCase()] = i;
  });

  // Получаем последний столбец по индексу заголовков
  const lastColLetter = columnIndexToLetter(headers.length - 1);

  // Получаем данные с диапазона I2:N (без заголовков)
  const dataRange = `${sheetTitle}!I2:N`;
  const dataRes = await sheets.spreadsheets.values.get({
    sheetId,
    range: dataRange,
  });
  const rows = dataRes.data.values || [];

  const subindustryIndex = 5; // индекс подотрасли (в диапазоне I-N)

  // Фильтруем строки, у которых есть значения в подотрасли и в колонке M (индекс 4 в диапазоне I-N)
  const filteredRows = rows.filter((row) => {
    const subVal = row[subindustryIndex];
    const mVal = row[4];

    return (
      subVal !== undefined &&
      subVal !== null &&
      subVal.toString().trim() !== '' &&
      mVal !== undefined &&
      mVal !== null &&
      mVal.toString().trim() !== ''
    );
  });

  // Формируем объект result с ключами по доменам из колонки I
  const result = {};
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

  // Записываем в JSON файл
  const employeesPath = path.join(__dirname, './temp/employees.json');
  fs.writeFileSync(employeesPath, JSON.stringify(result, null, 2), 'utf-8');

  return lastColLetter;
}
