import type {
  Bench,
  Obstruction,
  SunlightPeriodKey,
  SunlightSimulation,
  SunlightStatus,
} from '@/types';

/**
 * 日照推演引擎
 *
 * 太阳位置采用 NOAA 通用太阳位置算法（精度约 0.01°，对本场景足够）。
 * 全部计算为纯函数：同一（经纬度、时区、遮挡表、日期、步长）输入必得同一结果。
 */

export const DEFAULT_TIMEZONE = 'Asia/Shanghai';
/** 固定采样步长（分钟） */
export const SIMULATION_STEP_MINUTES = 10;
/** 每张长椅最多保留的历史推演条数 */
export const MAX_STORED_SIMULATIONS = 10;

const RAD = Math.PI / 180;
const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;

/** 早 / 中 / 晚时段划分（当地时间，左闭右开） */
export const SUNLIGHT_PERIODS: {
  key: SunlightPeriodKey;
  startHour: number;
  endHour: number;
}[] = [
  { key: 'morning', startHour: 6, endHour: 11 },
  { key: 'noon', startHour: 11, endHour: 15 },
  { key: 'evening', startHour: 15, endHour: 20 },
];

// ---------------------------------------------------------------------------
// 校验
// ---------------------------------------------------------------------------

export function isValidLatLng(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || tz.trim() === '') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function isValidDateString(date: unknown): date is string {
  if (typeof date !== 'string') return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return (
    dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d
  );
}

// ---------------------------------------------------------------------------
// 太阳位置（NOAA）
// ---------------------------------------------------------------------------

export interface SunPosition {
  /** 太阳高度角（度），>0 表示在地平线以上 */
  elevation: number;
  /** 太阳方位角（度），0=北，90=东，180=南，270=西，顺时针 */
  azimuth: number;
}

/**
 * 计算某一 UTC 时刻、某一地点的太阳高度角与方位角。
 * @param ms UTC 时间戳（毫秒）
 */
export function sunPosition(ms: number, lat: number, lng: number): SunPosition {
  const julianDay = ms / 86_400_000 + 2_440_587.5;
  const T = (julianDay - 2_451_545.0) / 36_525; // 儒略世纪

  // 太阳几何平黄经、平近点角、地球轨道偏心率
  const L0 = (280.46646 + T * (36_000.76983 + 0.0003032 * T)) % 360;
  const M = 357.52911 + T * (35_999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);

  // 中心差 → 真黄经 → 视黄经
  const mRad = M * RAD;
  const C =
    Math.sin(mRad) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
    Math.sin(2 * mRad) * (0.019993 - 0.000101 * T) +
    Math.sin(3 * mRad) * 0.000289;
  const omega = 125.04 - 1934.136 * T;
  const lambda = L0 + C - 0.00569 - 0.00478 * Math.sin(omega * RAD);

  // 黄赤交角 → 赤纬
  const epsilon0 =
    23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const epsilon = epsilon0 + 0.00256 * Math.cos(omega * RAD);
  const decl =
    Math.asin(
      Math.max(-1, Math.min(1, Math.sin(epsilon * RAD) * Math.sin(lambda * RAD)))
    ) / RAD;

  // 均时差（分钟）
  const y = Math.tan((epsilon * RAD) / 2) ** 2;
  const l0Rad = L0 * RAD;
  const eqTime =
    (4 *
      (y * Math.sin(2 * l0Rad) -
        2 * e * Math.sin(mRad) +
        4 * e * y * Math.sin(mRad) * Math.cos(2 * l0Rad) -
        0.5 * y * y * Math.sin(4 * l0Rad) -
        1.25 * e * e * Math.sin(2 * mRad))) /
    RAD;

  // 真太阳时 → 时角
  const utcMinutes = (ms / MINUTE_MS) % 1440;
  let trueSolarTime = (utcMinutes + eqTime + 4 * lng) % 1440;
  if (trueSolarTime < 0) trueSolarTime += 1440;
  const hourAngle = trueSolarTime / 4 - 180;

  // 高度角
  const latRad = lat * RAD;
  const declRad = decl * RAD;
  const haRad = hourAngle * RAD;
  const cosZenith =
    Math.sin(latRad) * Math.sin(declRad) +
    Math.cos(latRad) * Math.cos(declRad) * Math.cos(haRad);
  const zenith = Math.acos(Math.max(-1, Math.min(1, cosZenith))) / RAD;
  const elevation = 90 - zenith;

  // 方位角（自北顺时针）
  const azimuth =
    Math.atan2(
      Math.sin(haRad),
      Math.cos(haRad) * Math.sin(latRad) - Math.tan(declRad) * Math.cos(latRad)
    ) /
      RAD +
    180;

  return { elevation, azimuth: ((azimuth % 360) + 360) % 360 };
}

// ---------------------------------------------------------------------------
// 时区与当地时间
// ---------------------------------------------------------------------------

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(tz: string): Intl.DateTimeFormat {
  let fmt = formatterCache.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    formatterCache.set(tz, fmt);
  }
  return fmt;
}

interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

function getLocalParts(ms: number, tz: string): LocalParts {
  const parts = getFormatter(tz).formatToParts(new Date(ms));
  const bag: Record<string, number> = {};
  for (const p of parts) {
    if (p.type !== 'literal') bag[p.type] = parseInt(p.value, 10);
  }
  return {
    year: bag.year,
    month: bag.month,
    day: bag.day,
    hour: bag.hour % 24,
    minute: bag.minute,
  };
}

// ---------------------------------------------------------------------------
// 遮挡表
// ---------------------------------------------------------------------------

function normalizeAzimuth(az: number): number {
  return ((az % 360) + 360) % 360;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * 给定太阳方位角，按遮挡表线性插值（环形）得到该方向的遮挡高度角。
 * 空表 → 0（无遮挡）；同方位多条 → 取最大高度角。
 */
export function obstructionAngleAt(
  obstructions: Obstruction[],
  azimuth: number
): number {
  const entries = obstructions
    .filter(
      (o) => Number.isFinite(o.azimuth) && Number.isFinite(o.heightAngle)
    )
    .map((o) => ({
      azimuth: normalizeAzimuth(o.azimuth),
      heightAngle: clamp(o.heightAngle, 0, 90),
    }))
    .sort((a, b) => a.azimuth - b.azimuth);

  if (entries.length === 0) return 0;

  // 同方位去重，取最大高度角
  const deduped: { azimuth: number; heightAngle: number }[] = [];
  for (const entry of entries) {
    const last = deduped[deduped.length - 1];
    if (last && Math.abs(last.azimuth - entry.azimuth) < 1e-9) {
      last.heightAngle = Math.max(last.heightAngle, entry.heightAngle);
    } else {
      deduped.push({ ...entry });
    }
  }

  if (deduped.length === 1) return deduped[0].heightAngle;

  const az = normalizeAzimuth(azimuth);
  for (let i = 0; i < deduped.length; i++) {
    const a = deduped[i];
    const b = deduped[(i + 1) % deduped.length];
    const aAz = a.azimuth;
    const bAz = i === deduped.length - 1 ? b.azimuth + 360 : b.azimuth;
    const azAdj = az < aAz ? az + 360 : az;
    if (azAdj >= aAz && azAdj <= bAz) {
      const span = bAz - aAz;
      if (span < 1e-9) return Math.max(a.heightAngle, b.heightAngle);
      const t = (azAdj - aAz) / span;
      return a.heightAngle + t * (b.heightAngle - a.heightAngle);
    }
  }
  return 0;
}

// ---------------------------------------------------------------------------
// 指纹（确定性）：资料变动 → 指纹变化 → 旧结果失效
// ---------------------------------------------------------------------------

export interface SunlightInput {
  lat: number;
  lng: number;
  timezone: string;
  obstructions: Obstruction[];
  date: string;
  stepMinutes: number;
}

/** FNV-1a 哈希，对输入的规范化表示计算，纯确定性 */
export function sunlightFingerprint(input: SunlightInput): string {
  const canonical = JSON.stringify({
    lat: input.lat,
    lng: input.lng,
    tz: input.timezone,
    obs: input.obstructions
      .map((o) => [normalizeAzimuth(o.azimuth), clamp(o.heightAngle, 0, 90)])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1]),
    date: input.date,
    step: input.stepMinutes,
  });
  let h = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) {
    h ^= canonical.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function benchFingerprint(
  bench: Pick<Bench, 'lat' | 'lng' | 'timezone' | 'obstructions'>,
  date: string,
  stepMinutes: number
): string {
  return sunlightFingerprint({
    lat: bench.lat,
    lng: bench.lng,
    timezone: bench.timezone,
    obstructions: bench.obstructions,
    date,
    stepMinutes,
  });
}

/** 推演结果是否仍然有效（长椅日照相关资料未变动） */
export function isSimulationValid(
  bench: Pick<Bench, 'lat' | 'lng' | 'timezone' | 'obstructions'>,
  sim: SunlightSimulation
): boolean {
  return (
    sim.fingerprint === benchFingerprint(bench, sim.date, sim.stepMinutes)
  );
}

/** 取最新一条仍有效的推演结果（按日期倒序） */
export function getLatestValidSimulation(
  bench: Pick<Bench, 'lat' | 'lng' | 'timezone' | 'obstructions' | 'sunlightSimulations'>
): SunlightSimulation | null {
  const sorted = [...bench.sunlightSimulations].sort((a, b) =>
    b.date.localeCompare(a.date)
  );
  return sorted.find((sim) => isSimulationValid(bench, sim)) ?? null;
}

// ---------------------------------------------------------------------------
// 推演主流程
// ---------------------------------------------------------------------------

type BenchSunInput = Pick<Bench, 'lat' | 'lng' | 'timezone' | 'obstructions'>;

function invalidResult(
  fingerprint: string,
  date: string,
  stepMinutes: number,
  conclusion: string
): SunlightSimulation {
  return {
    id: `sim-${fingerprint}`,
    date,
    stepMinutes,
    fingerprint,
    status: 'invalid',
    conclusion,
    totalSunlitMinutes: 0,
    periods: { morning: 0, noon: 0, evening: 0 },
    sunrise: null,
    sunset: null,
    maxSunElevation: 0,
    simulatedAt: new Date().toISOString(),
  };
}

function formatLocalTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * 对一张长椅做全天日照推演。
 * 任何异常输入都返回带明确结论的结果对象，绝不抛错中断。
 */
export function simulateBenchSunlight(
  bench: BenchSunInput,
  date: string,
  stepMinutes: number = SIMULATION_STEP_MINUTES
): SunlightSimulation {
  const fingerprint = benchFingerprint(bench, date, stepMinutes);
  const step = Number.isFinite(stepMinutes) && stepMinutes > 0 ? stepMinutes : SIMULATION_STEP_MINUTES;

  try {
    // 1. 经纬度校验
    if (!isValidLatLng(bench.lat, bench.lng)) {
      return invalidResult(
        fingerprint,
        date,
        step,
        `经纬度非法（纬度 ${String(bench.lat)}，经度 ${String(bench.lng)}），无法推演`
      );
    }
    // 2. 时区校验
    if (!isValidTimeZone(bench.timezone)) {
      return invalidResult(
        fingerprint,
        date,
        step,
        `时区「${String(bench.timezone)}」非法，无法推演`
      );
    }
    // 3. 日期校验
    if (!isValidDateString(date)) {
      return invalidResult(fingerprint, date, step, `推演日期「${date}」非法，无法推演`);
    }

    const [year, month, day] = date.split('-').map(Number);
    const dayStartUtc = Date.UTC(year, month - 1, day);

    // 4. 固定步长采样：枚举 UTC 时刻，保留落在当地目标日历日内的样本。
    //    前后各扩 16 小时以覆盖所有时区偏移（UTC-12 ~ UTC+14）。
    interface Sample {
      localMinutes: number;
      elevation: number;
      azimuth: number;
    }
    const samples: Sample[] = [];
    for (
      let ms = dayStartUtc - 16 * HOUR_MS;
      ms <= dayStartUtc + 40 * HOUR_MS;
      ms += step * MINUTE_MS
    ) {
      const lp = getLocalParts(ms, bench.timezone);
      if (lp.year !== year || lp.month !== month || lp.day !== day) continue;
      const pos = sunPosition(ms, bench.lat, bench.lng);
      samples.push({
        localMinutes: lp.hour * 60 + lp.minute,
        elevation: pos.elevation,
        azimuth: pos.azimuth,
      });
    }

    if (samples.length === 0) {
      return invalidResult(fingerprint, date, step, '未能生成任何采样点，无法推演');
    }

    const elevations = samples.map((s) => s.elevation);
    const maxElev = Math.max(...elevations);
    const minElev = Math.min(...elevations);

    const base = {
      id: `sim-${fingerprint}`,
      date,
      stepMinutes: step,
      fingerprint,
      totalSunlitMinutes: 0,
      periods: { morning: 0, noon: 0, evening: 0 } as Record<SunlightPeriodKey, number>,
      sunrise: null as string | null,
      sunset: null as string | null,
      maxSunElevation: Math.round(maxElev * 10) / 10,
      simulatedAt: new Date().toISOString(),
    };

    // 5. 极夜：全天太阳都在地平线以下（太阳整天不露面）
    if (maxElev <= 0) {
      return {
        ...base,
        status: 'polar-night',
        conclusion: '极夜：太阳全天位于地平线以下，整天不露面，无日照',
      };
    }

    const isPolarDay = minElev > 0;
    const hasObstructions = bench.obstructions.length > 0;

    // 6. 逐时刻判定：太阳高度角 > 该方位遮挡高度角 → 见光
    let total = 0;
    const periods: Record<SunlightPeriodKey, number> = {
      morning: 0,
      noon: 0,
      evening: 0,
    };
    let sunriseMin: number | null = null;
    let sunsetMin: number | null = null;

    for (const s of samples) {
      if (s.elevation <= 0) continue;
      if (sunriseMin === null) sunriseMin = s.localMinutes;
      sunsetMin = s.localMinutes;

      const threshold = obstructionAngleAt(bench.obstructions, s.azimuth);
      if (s.elevation > threshold) {
        total += step;
        const period = SUNLIGHT_PERIODS.find(
          (p) =>
            s.localMinutes >= p.startHour * 60 && s.localMinutes < p.endHour * 60
        );
        if (period) periods[period.key] += step;
      }
    }

    // 7. 汇总结论
    const status: SunlightStatus = isPolarDay ? 'polar-day' : 'ok';
    let conclusion: string;
    if (isPolarDay) {
      conclusion =
        total > 0
          ? `极昼：太阳全天不落，累计日照 ${total} 分钟`
          : '极昼：太阳全天不落，但被周边遮挡，全天无日照';
    } else if (total === 0) {
      conclusion = hasObstructions
        ? '太阳虽升起，但全天未越过周边遮挡，无日照'
        : '太阳全天不露面，无日照';
    } else {
      conclusion = `全天日照 ${total} 分钟`;
    }

    return {
      ...base,
      status,
      conclusion,
      totalSunlitMinutes: total,
      periods,
      sunrise: isPolarDay ? null : sunriseMin !== null ? formatLocalTime(sunriseMin) : null,
      sunset: isPolarDay ? null : sunsetMin !== null ? formatLocalTime(sunsetMin) : null,
    };
  } catch (error) {
    // 兜底：任何意外都不中断批量推演
    console.error('Sunlight simulation failed:', error);
    return invalidResult(
      fingerprint,
      date,
      step,
      `推演过程出现异常：${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// ---------------------------------------------------------------------------
// 展示辅助
// ---------------------------------------------------------------------------

const COMPASS_DIRECTIONS = [
  '北',
  '东北',
  '东',
  '东南',
  '南',
  '西南',
  '西',
  '西北',
] as const;

/** 方位角 → 八方位名称 */
export function azimuthToCompass(azimuth: number): string {
  const idx = Math.round(normalizeAzimuth(azimuth) / 45) % 8;
  return COMPASS_DIRECTIONS[idx];
}

/** 分钟数 → 「X小时Y分」 */
export function formatMinutes(minutes: number): string {
  if (minutes <= 0) return '0 分钟';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} 分钟`;
  if (m === 0) return `${h} 小时`;
  return `${h} 小时 ${m} 分`;
}
