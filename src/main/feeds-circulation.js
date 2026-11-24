'use strict';

// BIS Red Book series A.BDCA.<jurisdiction>.01, banknotes and coins in circulation.
const BIS_CASH = 'https://stats.bis.org/api/v1/data/BIS,WS_CPMI_MACRO,1.0/A.BDCA..01/all?lastNObservations=1&format=csv';

function fields(line) {
  return line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((value) => value.replace(/^"|"$/g, '').trim());
}

async function readCurrencyCirculation(fetchImpl) {
  const response = await fetchImpl(BIS_CASH, { signal: AbortSignal.timeout(5_000) });
  if (!response.ok) throw new Error('BIS currency circulation is unavailable.');
  const [header, ...rows] = (await response.text()).trim().split(/\r?\n/);
  const columns = fields(header);
  const required = ['REP_CTY', 'BIS_UNIT', 'UNIT_MULT', 'TIME_PERIOD', 'OBS_VALUE'];
  const indices = required.map((name) => columns.indexOf(name));
  if (indices.includes(-1)) throw new Error('BIS currency circulation format changed.');
  const observations = new Map();
  for (const row of rows) {
    const values = fields(row);
    const [jurisdiction, code, multiplier, year, value] = indices.map((index) => values[index]);
    if (!/^[A-Z]{3}$/.test(code) || jurisdiction !== (code === 'EUR' ? 'XM' : code.slice(0, 2))
      || !/^\d{4}$/.test(year) || !/^\d{1,2}$/.test(multiplier) || !value) continue;
    const amount = Number(value) * 10 ** Number(multiplier);
    if (Number.isFinite(amount) && amount > 0 && (observations.get(code)?.year ?? '') < year) {
      observations.set(code, { amount, year });
    }
  }
  if (!observations.size) throw new Error('BIS currency circulation has no observations.');
  return observations;
}

module.exports = { readCurrencyCirculation };
