import type { Bench } from '@/types';
import { DEFAULT_TIMEZONE } from '@/utils/sunlight';

const STORAGE_KEY = 'bench-archive-data';

/** 兼容旧档案：补齐日照推演相关字段 */
function normalizeBench(raw: Partial<Bench> & Record<string, unknown>): Bench {
  return {
    ...raw,
    timezone: typeof raw.timezone === 'string' && raw.timezone ? raw.timezone : DEFAULT_TIMEZONE,
    obstructions: Array.isArray(raw.obstructions) ? raw.obstructions : [],
    sunlightSimulations: Array.isArray(raw.sunlightSimulations) ? raw.sunlightSimulations : [],
  } as Bench;
}

export function loadBenches(): Bench[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) {
        return parsed.map(normalizeBench);
      }
    }
  } catch (error) {
    console.error('Failed to load benches from localStorage:', error);
  }
  return [];
}

export function saveBenches(benches: Bench[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(benches));
  } catch (error) {
    console.error('Failed to save benches to localStorage:', error);
  }
}

export function clearBenches(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear benches from localStorage:', error);
  }
}
