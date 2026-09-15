export type MaterialType = 'wood' | 'metal' | 'stone' | 'plastic' | 'mixed';
export type OrientationType = 'east' | 'south' | 'west' | 'north' | 'southeast' | 'northeast' | 'southwest' | 'northwest';
export type ShadeLevelType = 'none' | 'partial' | 'full';
export type NoiseLevelType = 'quiet' | 'moderate' | 'noisy';
export type StayDurationType = 'short' | 'medium' | 'long' | 'verylong';
export type TimePeriodType = 'morning' | 'noon' | 'afternoon' | 'evening' | 'night';

export interface BenchExperience {
  id: string;
  benchId: string;
  timePeriod: TimePeriodType;
  notes: string;
  rating: number;
}

/** 周边遮挡：某个方位上的遮挡物高度角 */
export interface Obstruction {
  id: string;
  /** 方位角（度）：0=北，90=东，180=南，270=西，顺时针 */
  azimuth: number;
  /** 遮挡高度角（度）：0-90，该方位上遮挡物顶端相对水平线的仰角 */
  heightAngle: number;
  /** 备注，如「东侧高楼」「梧桐树冠」 */
  note: string;
}

/** 日照推演状态 */
export type SunlightStatus = 'ok' | 'polar-day' | 'polar-night' | 'invalid';

/** 日照汇总时段：早 / 中 / 晚 */
export type SunlightPeriodKey = 'morning' | 'noon' | 'evening';

/** 一次日照推演的结果（随长椅档案持久化） */
export interface SunlightSimulation {
  id: string;
  /** 推演日期 YYYY-MM-DD（长椅当地时区下的日历日） */
  date: string;
  /** 采样步长（分钟） */
  stepMinutes: number;
  /** 输入指纹：经纬度/时区/遮挡表/日期/步长的哈希，资料变动后旧结果失效 */
  fingerprint: string;
  status: SunlightStatus;
  /** 明确的人类可读结论（极昼极夜、全天无日照、数据非法等） */
  conclusion: string;
  /** 全天日照总分钟数 */
  totalSunlitMinutes: number;
  /** 早 / 中 / 晚各时段日照分钟数 */
  periods: Record<SunlightPeriodKey, number>;
  /** 当地日出 / 日落时间 HH:mm，极昼极夜时为 null */
  sunrise: string | null;
  sunset: string | null;
  /** 全天最大太阳高度角（度） */
  maxSunElevation: number;
  /** 推演执行时间 ISO 字符串 */
  simulatedAt: string;
}

export interface Bench {
  id: string;
  name: string;
  location: string;
  lat: number;
  lng: number;
  /** IANA 时区名，如 Asia/Shanghai */
  timezone: string;
  /** 周边遮挡表（按方位记录高度角），空表表示无遮挡 */
  obstructions: Obstruction[];
  /** 历史日照推演结果 */
  sunlightSimulations: SunlightSimulation[];
  material: MaterialType;
  orientation: OrientationType;
  hasBackrest: boolean;
  shadeLevel: ShadeLevelType;
  noiseLevel: NoiseLevelType;
  stayDuration: StayDurationType;
  rating: number;
  review: string;
  experiences: BenchExperience[];
  createdAt: string;
  updatedAt: string;
}

export const MATERIAL_LABELS: Record<MaterialType, string> = {
  wood: '木质',
  metal: '金属',
  stone: '石质',
  plastic: '塑料',
  mixed: '混合材质',
};

export const ORIENTATION_LABELS: Record<OrientationType, string> = {
  east: '东',
  south: '南',
  west: '西',
  north: '北',
  southeast: '东南',
  northeast: '东北',
  southwest: '西南',
  northwest: '西北',
};

export const SHADE_LABELS: Record<ShadeLevelType, string> = {
  none: '无遮阴',
  partial: '部分遮阴',
  full: '完全遮阴',
};

export const NOISE_LABELS: Record<NoiseLevelType, string> = {
  quiet: '安静',
  moderate: '一般',
  noisy: '嘈杂',
};

export const STAY_DURATION_LABELS: Record<StayDurationType, string> = {
  short: '少于15分钟',
  medium: '15-30分钟',
  long: '30-60分钟',
  verylong: '1小时以上',
};

export const TIME_PERIOD_LABELS: Record<TimePeriodType, string> = {
  morning: '早晨',
  noon: '中午',
  afternoon: '下午',
  evening: '傍晚',
  night: '夜晚',
};

export const TIME_PERIOD_ICONS: Record<TimePeriodType, string> = {
  morning: 'sunrise',
  noon: 'sun',
  afternoon: 'cloud-sun',
  evening: 'sunset',
  night: 'moon',
};

export const SUNLIGHT_STATUS_LABELS: Record<SunlightStatus, string> = {
  ok: '正常',
  'polar-day': '极昼',
  'polar-night': '极夜',
  invalid: '数据非法',
};

export const SUNLIGHT_PERIOD_LABELS: Record<SunlightPeriodKey, string> = {
  morning: '早晨',
  noon: '中午',
  evening: '傍晚',
};
