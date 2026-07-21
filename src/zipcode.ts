import { readFileSync } from 'fs';
import { join } from 'path';

interface ZipInfo {
  lat: number;
  lng: number;
  city: string;
  state: string;
}

const zipMap = new Map<string, ZipInfo>();

function loadZipCodes(): void {
  const csv = readFileSync(join(import.meta.dirname, 'data', 'zipcodes.csv'), 'utf-8');
  for (const line of csv.trim().split('\n')) {
    const [zip, lat, lng, city, state] = line.split(',');
    zipMap.set(zip.trim(), {
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      city: city.trim(),
      state: state.trim(),
    });
  }
}

export function lookupZip(zip: string): ZipInfo | null {
  if (zipMap.size === 0) loadZipCodes();
  return zipMap.get(zip.replace(/[^0-9]/g, '')) || null;
}
