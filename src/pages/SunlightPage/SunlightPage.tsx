import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sun,
  Sunrise,
  Sunset,
  Play,
  Trash2,
  MapPin,
  AlertTriangle,
  Cloudy,
  SunDim,
  CalendarDays,
} from 'lucide-react';
import { useBenchStore } from '@/store/useBenchStore';
import { SUNLIGHT_STATUS_LABELS, SUNLIGHT_PERIOD_LABELS } from '@/types';
import type { SunlightSimulation, SunlightStatus } from '@/types';
import {
  SIMULATION_STEP_MINUTES,
  formatMinutes,
  isSimulationValid,
  isValidDateString,
} from '@/utils/sunlight';

function todayLocalDateString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const STATUS_STYLES: Record<SunlightStatus, { badge: string; icon: typeof Sun }> = {
  ok: { badge: 'bg-moss-green/10 text-moss-green', icon: Sun },
  'polar-day': { badge: 'bg-ochre/10 text-ochre', icon: SunDim },
  'polar-night': { badge: 'bg-deep-brown/10 text-ink-light', icon: Cloudy },
  invalid: { badge: 'bg-red-500/10 text-red-500', icon: AlertTriangle },
};

export default function SunlightPage() {
  const navigate = useNavigate();
  const {
    benches,
    initialize,
    initialized,
    runSunlightSimulation,
    clearSunlightSimulations,
  } = useBenchStore();

  const [date, setDate] = useState(todayLocalDateString);
  const [ranDate, setRanDate] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  useEffect(() => {
    if (!initialized) {
      initialize();
    }
  }, [initialized, initialize]);

  const dateValid = isValidDateString(date);

  const handleRun = () => {
    if (!dateValid) return;
    runSunlightSimulation(date);
    setRanDate(date);
  };

  // 汇总：每张长椅在选定日期下的最新推演结果及其有效性
  const rows = useMemo(() => {
    return benches.map((bench) => {
      const sim: SunlightSimulation | undefined = bench.sunlightSimulations.find(
        (s) => s.date === date
      );
      const valid = sim ? isSimulationValid(bench, sim) : false;
      return { bench, sim, valid };
    });
  }, [benches, date]);

  const simulatedCount = rows.filter((r) => r.sim).length;
  const staleCount = rows.filter((r) => r.sim && !r.valid).length;
  const anySimulationAnywhere = benches.some((b) => b.sunlightSimulations.length > 0);

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-6">
        <h2 className="font-serif text-2xl font-semibold text-deep-brown mb-1">
          日照推演
        </h2>
        <p className="text-ink-light text-sm">
          按固定步长（{SIMULATION_STEP_MINUTES} 分钟）推算全天太阳轨迹，结合周边遮挡判断各时刻是否见光
        </p>
      </div>

      {/* 推演控制区 */}
      <div className="paper-texture rounded-xl shadow-paper p-5 mb-6 fade-in opacity-0 stagger-1">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-sm font-medium text-deep-brown mb-1.5">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="w-4 h-4 text-ochre" />
                推演日期
              </span>
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="px-4 py-2.5 bg-white/50 border border-deep-brown/10 rounded-lg text-deep-brown focus:bg-white transition-colors"
            />
          </div>

          <button
            onClick={handleRun}
            disabled={!dateValid || benches.length === 0}
            className="flex items-center gap-2 px-5 py-2.5 bg-moss-green text-white rounded-lg font-medium text-sm hover:bg-moss-light transition-colors shadow-md hover:shadow-lg disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
          >
            <Play className="w-4 h-4" />
            批量推演全部长椅（{benches.length} 张）
          </button>

          {anySimulationAnywhere && (
            <button
              onClick={() => setShowClearConfirm(true)}
              className="flex items-center gap-1.5 px-3 py-2.5 text-sm text-red-500 hover:bg-red-50 rounded-lg transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              清空推演结果
            </button>
          )}
        </div>

        {!dateValid && (
          <p className="mt-3 text-sm text-red-500 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4" />
            日期非法，请重新选择
          </p>
        )}

        {ranDate === date && dateValid && (
          <p className="mt-3 text-sm text-moss-green">
            已完成 {date} 的批量推演，共 {benches.length} 张长椅，结果已随档案保存。
          </p>
        )}

        {staleCount > 0 && (
          <p className="mt-3 text-sm text-ochre flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4" />
            有 {staleCount} 张长椅的资料在推演后发生变动，旧结果已失效，请重新推演。
          </p>
        )}
      </div>

      {/* 结果列表 */}
      {simulatedCount > 0 ? (
        <div className="space-y-3">
          {rows.map(({ bench, sim, valid }, index) => {
            if (!sim) return null;
            const style = STATUS_STYLES[sim.status];
            const StatusIcon = style.icon;
            return (
              <div
                key={bench.id}
                onClick={() => navigate(`/bench/${bench.id}`)}
                className={`paper-texture rounded-xl shadow-paper p-4 cursor-pointer card-hover fade-in opacity-0 stagger-${Math.min(index + 1, 6)} ${
                  valid ? '' : 'opacity-70'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className="w-11 h-11 rounded-xl bg-ochre/10 flex items-center justify-center flex-shrink-0">
                    <StatusIcon className="w-5 h-5 text-ochre" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <h3 className="font-serif font-semibold text-deep-brown truncate">
                        {bench.name}
                      </h3>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${style.badge}`}>
                        {SUNLIGHT_STATUS_LABELS[sim.status]}
                      </span>
                      {!valid && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-500">
                          已失效
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1 text-ink-light text-sm mb-2">
                      <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="truncate">{bench.location}</span>
                      <span className="text-ink-light/60">
                        （{bench.lat.toFixed(4)}, {bench.lng.toFixed(4)} · {bench.timezone}）
                      </span>
                    </div>

                    <p className="text-sm text-ink-light mb-3">{sim.conclusion}</p>

                    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                      <span className="text-deep-brown font-medium">
                        全天 {formatMinutes(sim.totalSunlitMinutes)}
                      </span>
                      {(Object.keys(SUNLIGHT_PERIOD_LABELS) as Array<keyof typeof SUNLIGHT_PERIOD_LABELS>).map((key) => (
                        <span key={key} className="text-ink-light">
                          {SUNLIGHT_PERIOD_LABELS[key]}{' '}
                          <span className="text-deep-brown font-medium">
                            {formatMinutes(sim.periods[key])}
                          </span>
                        </span>
                      ))}
                      {sim.sunrise && sim.sunset && (
                        <span className="flex items-center gap-1.5 text-ink-light">
                          <Sunrise className="w-3.5 h-3.5 text-ochre" />
                          {sim.sunrise}
                          <Sunset className="w-3.5 h-3.5 text-ochre ml-1" />
                          {sim.sunset}
                        </span>
                      )}
                      <span className="text-xs text-ink-light/60">
                        最大高度角 {sim.maxSunElevation.toFixed(1)}° · 遮挡 {bench.obstructions.length} 条
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="paper-texture rounded-xl shadow-paper p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-ochre/10 flex items-center justify-center mx-auto mb-4">
            <Sun className="w-8 h-8 text-ochre/50" />
          </div>
          <h3 className="font-serif text-lg font-medium text-deep-brown mb-2">
            {dateValid ? `${date} 还没有推演结果` : '日期非法'}
          </h3>
          <p className="text-ink-light text-sm">
            {benches.length === 0
              ? '先添加几张长椅档案，再来做日照推演'
              : dateValid
                ? '点击上方「批量推演全部长椅」开始推演'
                : '请选择合法的推演日期'}
          </p>
        </div>
      )}

      {showClearConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="paper-texture rounded-xl shadow-paper-hover p-6 max-w-sm w-full fade-in">
            <h3 className="font-serif text-lg font-semibold text-deep-brown mb-2">
              清空推演结果
            </h3>
            <p className="text-ink-light text-sm mb-6">
              将删除全部长椅的所有日照推演结果，此操作无法撤销。
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 px-4 py-2 text-sm text-deep-brown bg-warm-beige hover:bg-warm-beige/80 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => {
                  clearSunlightSimulations();
                  setShowClearConfirm(false);
                }}
                className="flex-1 px-4 py-2 text-sm text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
              >
                清空
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
