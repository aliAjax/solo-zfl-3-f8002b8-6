import { create } from 'zustand';
import type { Bench, BenchExperience, MaterialType, OrientationType, ShadeLevelType, NoiseLevelType } from '@/types';
import { loadBenches, saveBenches } from '@/utils/storage';
import { generateId } from '@/utils/comfort';
import {
  MAX_STORED_SIMULATIONS,
  SIMULATION_STEP_MINUTES,
  simulateBenchSunlight,
} from '@/utils/sunlight';
import { mockBenches } from '@/data/mockBenches';

interface BenchState {
  benches: Bench[];
  searchQuery: string;
  materialFilter: MaterialType | null;
  orientationFilter: OrientationType | null;
  shadeFilter: ShadeLevelType | null;
  noiseFilter: NoiseLevelType | null;
  initialized: boolean;
}

interface BenchActions {
  initialize: () => void;
  setSearchQuery: (query: string) => void;
  setMaterialFilter: (material: MaterialType | null) => void;
  setOrientationFilter: (orientation: OrientationType | null) => void;
  setShadeFilter: (shade: ShadeLevelType | null) => void;
  setNoiseFilter: (noise: NoiseLevelType | null) => void;
  clearFilters: () => void;
  addBench: (bench: Omit<Bench, 'id' | 'createdAt' | 'updatedAt' | 'experiences' | 'sunlightSimulations'>) => void;
  updateBench: (id: string, updates: Partial<Bench>) => void;
  deleteBench: (id: string) => void;
  getBenchById: (id: string) => Bench | undefined;
  addExperience: (benchId: string, experience: Omit<BenchExperience, 'id' | 'benchId'>) => void;
  updateExperience: (benchId: string, expId: string, updates: Partial<BenchExperience>) => void;
  deleteExperience: (benchId: string, expId: string) => void;
  getFilteredBenches: () => Bench[];
  /** 批量推演：对全部长椅按选定日期做日照推演，结果随档案保存 */
  runSunlightSimulation: (date: string, stepMinutes?: number) => void;
  /** 清空全部长椅的日照推演结果 */
  clearSunlightSimulations: () => void;
}

const initialState: BenchState = {
  benches: [],
  searchQuery: '',
  materialFilter: null,
  orientationFilter: null,
  shadeFilter: null,
  noiseFilter: null,
  initialized: false,
};

export const useBenchStore = create<BenchState & BenchActions>((set, get) => ({
  ...initialState,

  initialize: () => {
    const stored = loadBenches();
    if (stored.length > 0) {
      set({ benches: stored, initialized: true });
    } else {
      set({ benches: mockBenches, initialized: true });
      saveBenches(mockBenches);
    }
  },

  setSearchQuery: (query) => set({ searchQuery: query }),
  setMaterialFilter: (material) => set({ materialFilter: material }),
  setOrientationFilter: (orientation) => set({ orientationFilter: orientation }),
  setShadeFilter: (shade) => set({ shadeFilter: shade }),
  setNoiseFilter: (noise) => set({ noiseFilter: noise }),

  clearFilters: () => set({
    searchQuery: '',
    materialFilter: null,
    orientationFilter: null,
    shadeFilter: null,
    noiseFilter: null,
  }),

  addBench: (benchData) => {
    const now = new Date().toISOString();
    const newBench: Bench = {
      ...benchData,
      id: generateId(),
      experiences: [],
      sunlightSimulations: [],
      createdAt: now,
      updatedAt: now,
    };
    const newBenches = [newBench, ...get().benches];
    set({ benches: newBenches });
    saveBenches(newBenches);
  },

  updateBench: (id, updates) => {
    const newBenches = get().benches.map((bench) =>
      bench.id === id
        ? { ...bench, ...updates, updatedAt: new Date().toISOString() }
        : bench
    );
    set({ benches: newBenches });
    saveBenches(newBenches);
  },

  deleteBench: (id) => {
    const newBenches = get().benches.filter((bench) => bench.id !== id);
    set({ benches: newBenches });
    saveBenches(newBenches);
  },

  getBenchById: (id) => {
    return get().benches.find((bench) => bench.id === id);
  },

  addExperience: (benchId, experienceData) => {
    const newExperience: BenchExperience = {
      ...experienceData,
      id: generateId(),
      benchId,
    };
    const newBenches = get().benches.map((bench) =>
      bench.id === benchId
        ? {
            ...bench,
            experiences: [...bench.experiences, newExperience],
            updatedAt: new Date().toISOString(),
          }
        : bench
    );
    set({ benches: newBenches });
    saveBenches(newBenches);
  },

  updateExperience: (benchId, expId, updates) => {
    const newBenches = get().benches.map((bench) =>
      bench.id === benchId
        ? {
            ...bench,
            experiences: bench.experiences.map((exp) =>
              exp.id === expId ? { ...exp, ...updates } : exp
            ),
            updatedAt: new Date().toISOString(),
          }
        : bench
    );
    set({ benches: newBenches });
    saveBenches(newBenches);
  },

  deleteExperience: (benchId, expId) => {
    const newBenches = get().benches.map((bench) =>
      bench.id === benchId
        ? {
            ...bench,
            experiences: bench.experiences.filter((exp) => exp.id !== expId),
            updatedAt: new Date().toISOString(),
          }
        : bench
    );
    set({ benches: newBenches });
    saveBenches(newBenches);
  },

  getFilteredBenches: () => {
    const { benches, searchQuery, materialFilter, orientationFilter, shadeFilter, noiseFilter } = get();

    return benches.filter((bench) => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchName = bench.name.toLowerCase().includes(query);
        const matchLocation = bench.location.toLowerCase().includes(query);
        const matchReview = bench.review.toLowerCase().includes(query);
        if (!matchName && !matchLocation && !matchReview) return false;
      }

      if (materialFilter && bench.material !== materialFilter) return false;
      if (orientationFilter && bench.orientation !== orientationFilter) return false;
      if (shadeFilter && bench.shadeLevel !== shadeFilter) return false;
      if (noiseFilter && bench.noiseLevel !== noiseFilter) return false;

      return true;
    });
  },

  runSunlightSimulation: (date, stepMinutes = SIMULATION_STEP_MINUTES) => {
    const newBenches = get().benches.map((bench) => {
      const sim = simulateBenchSunlight(bench, date, stepMinutes);
      // 同日期的新结果替换旧结果；指纹不同（资料已变动）的旧结果自然失效
      const rest = bench.sunlightSimulations.filter((s) => s.date !== date);
      return {
        ...bench,
        sunlightSimulations: [sim, ...rest].slice(0, MAX_STORED_SIMULATIONS),
      };
    });
    set({ benches: newBenches });
    saveBenches(newBenches);
  },

  clearSunlightSimulations: () => {
    const newBenches = get().benches.map((bench) => ({
      ...bench,
      sunlightSimulations: [],
    }));
    set({ benches: newBenches });
    saveBenches(newBenches);
  },
}));
