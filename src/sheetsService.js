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

export function getSheetsClient() {
  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: KEYFILE,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    return google.sheets({ version: 'v4', auth });
  } catch (error) {
    console.error('[getSheetsClient] Ошибка:', error.message);
    throw error;
  }
}

export async function getSheetTitleById(sheets, sheetId) {
  try {
    const res = await sheets.spreadsheets.get({ spreadsheetId });
    const sheet = res.data.sheets.find((s) => s.properties.sheetId === sheetId);
    if (!sheet) {
      throw new Error(`Sheet with ID ${sheetId} not found`);
    }
    return sheet.properties.title;
  } catch (error) {
    console.error('[getSheetTitleById] Ошибка:', error.message);
    throw error;
  }
}

export async function updateCell(sheets, sheetId, range, value) {
  try {
    await sheets.spreadsheets.values.update({
      sheetId,
      range,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[value]],
      },
    });
  } catch (error) {
    console.error('[updateCell] Ошибка:', error.message);
    throw error;
  }
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
  try {
    const res = await sheets.spreadsheets.values.get({
      sheetId,
      range: `${sheetTitle}`,
    });
    const rows = res.data.values || [];
    const headerRow = rows[0] || [];

    let currentHeaders = headerRow.map((h) => h.toLowerCase());

    for (let i = 0; i < requiredColumns.length; i++) {
      const colName = requiredColumns[i].toLowerCase();

      if (!currentHeaders.includes(colName)) {
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

        await sheets.spreadsheets.values.update({
          sheetId,
          range: `${sheetTitle}!${columnIndexToLetter(i)}1`,
          valueInputOption: 'RAW',
          requestBody: {
            values: [[requiredColumns[i]]],
          },
        });

        currentHeaders.splice(i, 0, colName);

        for (let r = 1; r < rows.length; r++) {
          if (!rows[r]) rows[r] = [];
          rows[r].splice(i, 0, '');
        }
      }
    }

    await sheets.spreadsheets.values.update({
      sheetId,
      range: `${sheetTitle}!A1`,
      valueInputOption: 'RAW',
      requestBody: {
        values:
          rows.length > 0
            ? [currentHeaders, ...rows.slice(1)]
            : [currentHeaders],
      },
    });

    let currentOrder = currentHeaders.slice();
    const requests = [];

    for (
      let targetIndex = 0;
      targetIndex < requiredColumns.length;
      targetIndex++
    ) {
      const colName = requiredColumns[targetIndex].toLowerCase();
      const currentPos = currentOrder.indexOf(colName);
      if (currentPos === -1 || currentPos === targetIndex) continue;

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
      '[normalizeSheetStructure] Отсутствующие колонки созданы и порядок установлен'
    );
  } catch (error) {
    console.error('[normalizeSheetStructure] Ошибка:', error.message);
    throw error;
  }
}

export async function processSheetData(sheets, sheetId, sheetTitle) {
  try {
    const headerRes = await sheets.spreadsheets.values.get({
      sheetId,
      range: `${sheetTitle}!1:1`,
    });
    const headers = headerRes.data.values?.[0] || [];

    const headerMap = {};
    headers.forEach((h, i) => {
      headerMap[h.toLowerCase()] = i;
    });

    const lastColLetter = columnIndexToLetter(headers.length - 1);

    const dataRange = `${sheetTitle}!I2:N`;
    const dataRes = await sheets.spreadsheets.values.get({
      sheetId,
      range: dataRange,
    });
    const rows = dataRes.data.values || [];

    const subindustryIndex = 5;

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

    const result = {};
    filteredRows.forEach((row) => {
      const rawKey = row[0];
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

    const employeesPath = path.join(__dirname, './temp/employees.json');
    fs.writeFileSync(employeesPath, JSON.stringify(result, null, 2), 'utf-8');

    console.log('[processSheetData] JSON сохранён:', employeesPath);

    return lastColLetter;
  } catch (error) {
    console.error('[processSheetData] Ошибка:', error.message);
    throw error;
  }
}
