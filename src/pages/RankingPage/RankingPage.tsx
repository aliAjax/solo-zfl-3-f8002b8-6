import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trophy, MapPin, Star, Crown, Medal, Award, Sun, Sunrise, Sunset } from 'lucide-react';
import { useBenchStore } from '@/store/useBenchStore';
import { calculateComfortScore, getComfortLevel, getComfortColor } from '@/utils/comfort';
import { MATERIAL_LABELS, SHADE_LABELS, SUNLIGHT_STATUS_LABELS, SUNLIGHT_PERIOD_LABELS } from '@/types';
import type { Bench, SunlightSimulation } from '@/types';
import { formatMinutes, isSimulationValid } from '@/utils/sunlight';

type RankingMode = 'comfort' | 'sunlight';

export default function RankingPage() {
  const { benches, initialize, initialized } = useBenchStore();
  const navigate = useNavigate();
  const [mode, setMode] = useState<RankingMode>('comfort');

  useEffect(() => {
    if (!initialized) {
      initialize();
    }
  }, [initialized, initialize]);

  const rankedBenches = [...benches]
    .sort((a, b) => calculateComfortScore(b) - calculateComfortScore(a))
    .map((bench, index) => ({ bench, rank: index + 1 }));

  // 日照排行：取全体长椅中仍有效的推演结果里最新的日期，按该日期排名
  const sunlightRanking = useMemo(() => {
    const validSims: { bench: Bench; sim: SunlightSimulation }[] = [];
    for (const bench of benches) {
      for (const sim of bench.sunlightSimulations) {
        if (isSimulationValid(bench, sim)) {
          validSims.push({ bench, sim });
        }
      }
    }
    if (validSims.length === 0) {
      return { date: null as string | null, rows: [] as { bench: Bench; sim: SunlightSimulation }[] };
    }
    const latestDate = validSims.reduce(
      (max, { sim }) => (sim.date > max ? sim.date : max),
      validSims[0].sim.date
    );
    const rows = validSims
      .filter(({ sim }) => sim.date === latestDate)
      .sort((a, b) => b.sim.totalSunlitMinutes - a.sim.totalSunlitMinutes);
    return { date: latestDate, rows };
  }, [benches]);

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Crown className="w-5 h-5 text-yellow-500" />;
    if (rank === 2) return <Medal className="w-5 h-5 text-gray-400" />;
    if (rank === 3) return <Award className="w-5 h-5 text-amber-600" />;
    return <span className="text-base font-bold text-ink-light">{rank}</span>;
  };

  const getRankBg = (rank: number) => {
    if (rank === 1) return 'bg-gradient-to-r from-yellow-50/80 to-amber-50/80 border-yellow-200/50';
    if (rank === 2) return 'bg-gradient-to-r from-gray-50/80 to-slate-50/80 border-gray-200/50';
    if (rank === 3) return 'bg-gradient-to-r from-orange-50/80 to-amber-50/80 border-orange-200/50';
    return 'bg-white/50 border-deep-brown/5';
  };

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-6">
        <h2 className="font-serif text-2xl font-semibold text-deep-brown mb-1">
          {mode === 'comfort' ? '舒适度排行' : '日照排行'}
        </h2>
        <p className="text-ink-light text-sm">
          {mode === 'comfort'
            ? '综合评分最高的长椅'
            : sunlightRanking.date
              ? `${sunlightRanking.date} 全天日照时长排名`
              : '按全天日照时长排名'}
        </p>
      </div>

      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setMode('comfort')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            mode === 'comfort'
              ? 'bg-moss-green text-white shadow-md'
              : 'text-ink-light hover:bg-deep-brown/5'
          }`}
        >
          <Trophy className="w-4 h-4" />
          舒适度
        </button>
        <button
          onClick={() => setMode('sunlight')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            mode === 'sunlight'
              ? 'bg-moss-green text-white shadow-md'
              : 'text-ink-light hover:bg-deep-brown/5'
          }`}
        >
          <Sun className="w-4 h-4" />
          日照时长
        </button>
      </div>

      {mode === 'comfort' && (
        <div className="space-y-3">
          {rankedBenches.map(({ bench, rank }) => {
            const comfortScore = calculateComfortScore(bench);
            const comfortLevel = getComfortLevel(comfortScore);
            const comfortColor = getComfortColor(comfortScore);

            return (
              <div
                key={bench.id}
                onClick={() => navigate(`/bench/${bench.id}`)}
                className={`paper-texture rounded-xl shadow-paper p-4 border ${
                  getRankBg(rank)
                } cursor-pointer card-hover fade-in opacity-0 stagger-${Math.min(rank, 6)}`}
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-warm-beige flex items-center justify-center flex-shrink-0">
                    {getRankIcon(rank)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-serif font-semibold text-deep-brown truncate">
                        {bench.name}
                      </h3>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${comfortColor} bg-white/80`}>
                        {comfortLevel}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 text-ink-light text-sm mb-2">
                      <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="truncate">{bench.location}</span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <span className="text-xs text-ink-light px-2 py-0.5 bg-white/60 rounded">
                        {MATERIAL_LABELS[bench.material]}
                      </span>
                      <span className="text-xs text-ink-light px-2 py-0.5 bg-white/60 rounded">
                        {SHADE_LABELS[bench.shadeLevel]}
                      </span>
                      <div className="flex items-center gap-1 text-xs text-ink-light px-2 py-0.5 bg-white/60 rounded">
                        <Star className="w-3 h-3 fill-ochre text-ochre" />
                        <span>{bench.rating.toFixed(1)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <div className={`text-2xl font-bold font-serif ${comfortColor}`}>
                      {comfortScore}
                    </div>
                    <div className="text-xs text-ink-light">
                      舒适度
                    </div>
                  </div>
                </div>

                <div className="mt-3 pl-16">
                  <div className="h-2 bg-warm-beige rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${
                        comfortScore >= 4 ? 'bg-moss-green' :
                        comfortScore >= 3 ? 'bg-ochre' :
                        'bg-ink-light'
                      }`}
                      style={{ width: `${(comfortScore / 5) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {mode === 'sunlight' && sunlightRanking.rows.length > 0 && (
        <div className="space-y-3">
          {sunlightRanking.rows.map(({ bench, sim }, index) => {
            const rank = index + 1;
            const maxMinutes = sunlightRanking.rows[0].sim.totalSunlitMinutes || 1;
            return (
              <div
                key={bench.id}
                onClick={() => navigate(`/bench/${bench.id}`)}
                className={`paper-texture rounded-xl shadow-paper p-4 border ${
                  getRankBg(rank)
                } cursor-pointer card-hover fade-in opacity-0 stagger-${Math.min(rank, 6)}`}
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-warm-beige flex items-center justify-center flex-shrink-0">
                    {getRankIcon(rank)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-serif font-semibold text-deep-brown truncate">
                        {bench.name}
                      </h3>
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-ochre/10 text-ochre">
                        {SUNLIGHT_STATUS_LABELS[sim.status]}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 text-ink-light text-sm mb-2">
                      <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="truncate">{bench.location}</span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {(Object.keys(SUNLIGHT_PERIOD_LABELS) as Array<keyof typeof SUNLIGHT_PERIOD_LABELS>).map((key) => (
                        <span key={key} className="text-xs text-ink-light px-2 py-0.5 bg-white/60 rounded">
                          {SUNLIGHT_PERIOD_LABELS[key]} {formatMinutes(sim.periods[key])}
                        </span>
                      ))}
                      {sim.sunrise && sim.sunset && (
                        <span className="flex items-center gap-1 text-xs text-ink-light px-2 py-0.5 bg-white/60 rounded">
                          <Sunrise className="w-3 h-3 text-ochre" />
                          {sim.sunrise}
                          <Sunset className="w-3 h-3 text-ochre" />
                          {sim.sunset}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <div className="text-2xl font-bold font-serif text-ochre">
                      {formatMinutes(sim.totalSunlitMinutes)}
                    </div>
                    <div className="text-xs text-ink-light">
                      全天日照
                    </div>
                  </div>
                </div>

                <div className="mt-3 pl-16">
                  <div className="h-2 bg-warm-beige rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-ochre transition-all duration-700"
                      style={{ width: `${(sim.totalSunlitMinutes / maxMinutes) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {mode === 'sunlight' && sunlightRanking.rows.length === 0 && (
        <div className="paper-texture rounded-xl shadow-paper p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-ochre/10 flex items-center justify-center mx-auto mb-4">
            <Sun className="w-8 h-8 text-ochre/50" />
          </div>
          <h3 className="font-serif text-lg font-medium text-deep-brown mb-2">
            还没有日照推演数据
          </h3>
          <p className="text-ink-light text-sm mb-4">
            先到「日照」页选择日期，批量推演全部长椅
          </p>
          <button
            onClick={() => navigate('/sunlight')}
            className="px-4 py-2 bg-moss-green text-white rounded-lg text-sm font-medium hover:bg-moss-light transition-colors"
          >
            去做日照推演
          </button>
        </div>
      )}

      {mode === 'comfort' && rankedBenches.length === 0 && (
        <div className="paper-texture rounded-xl shadow-paper p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-moss-green/10 flex items-center justify-center mx-auto mb-4">
            <Trophy className="w-8 h-8 text-moss-green/50" />
          </div>
          <h3 className="font-serif text-lg font-medium text-deep-brown mb-2">
            还没有排行数据
          </h3>
          <p className="text-ink-light text-sm">
            添加一些长椅档案后，这里会显示舒适度排行榜
          </p>
        </div>
      )}
    </div>
  );
}
