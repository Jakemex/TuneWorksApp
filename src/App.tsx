import React, { useMemo, useState, useEffect } from "react";
import gturboFitment from "./data/gturbo-fitment.json";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

type Make = "Toyota";
type Model = "Hilux" | "LandCruiser 70" | "LandCruiser 200" | "LandCruiser 300";

type VariantKey =
  | "HILUX_N70_1KD"
  | "HILUX_N80_1GD"
  | "LC70_1VD"
  | "LC70_1GD"
  | "LC200_1VD"
  | "LC300_33D";

type Emissions = "Intact" | "Modified"; // "Modified" = DPF delete / emissions modified (wording kept neutral)

// include all turbos referenced
type Turbo = "Stock" | "G250" | "G300" | "G333" | "G380" | "G400" | "G450";

type Tuning = "Single Tune" | "Multi Mapping";

// Multi-map modes (only used when tuning === "Multi Mapping")
type MapMode = "Stock" | "Everyday" | "Tow" | "Performance";

type InjectorSizeGD = "Stock" | "+35" | "+100";

// Make generic injector sizes cover what you actually use in variants
type InjectorSizeGeneric = "Stock" | "+20" | "+40" | "+50" | "+60" | "+80" | "+150";

type ModKey =
  | "airbox"
  | "frontMount"
  | "powerpipe"
  | "heatExchanger"
  | "injectors"
  | "strokerPump";

type Variant = {
  key: VariantKey;
  make: Make;
  model: Model;
  label: string;
  engine: "1KD" | "1GD" | "1VD" | "3.3D";
  rpmMin: number;
  rpmMax: number;

  allowedTurbos: Turbo[];
  allowedTuning: Tuning[];
  allowedMods: ModKey[];

  injectorSizes?: readonly string[];

  // Base power ranges in kW@wheels by turbo+tuning
  basePower: Partial<Record<Turbo, Partial<Record<Tuning, [number, number]>>>>;

  // Optional per-variant mod adds (kW@wheels range). Falls back to defaults.
  modAdds?: Partial<Record<ModKey, [number, number]>>;

  // Optional hard cap in kW @ wheels per turbo (after all adds/mults)
  capsKw?: Partial<Record<Turbo, number>>;
};

const DEFAULT_MOD_ADDS: Record<ModKey, [number, number]> = {
  frontMount: [3, 15],
  airbox: [1, 4],
  powerpipe: [1, 10],
  heatExchanger: [1, 3],
  injectors: [0, 0], // injector adds handled separately
  strokerPump: [5, 15],
};

// Injector add tables (kW adds)
const INJ_ADDS_GENERIC: Record<InjectorSizeGeneric, [number, number]> = {
  Stock: [0, 0],
  "+20": [3, 7],
  "+40": [8, 15],
  "+50": [10, 20],
  "+60": [12, 25],
  "+80": [15, 35],
  "+150": [25, 60],
};

const INJ_ADDS_1GD: Record<InjectorSizeGD, [number, number]> = {
  Stock: [0, 0],
  "+35": [6, 12],
  "+100": [14, 55],
};

// Emissions multiplier (applies to BOTH kW and Nm targets)
const EMISSIONS_MULT: Record<Emissions, number> = {
  Intact: 1.0,
  Modified: 1.1, // tweak anytime
};

// Map-mode scaling (relative to your baseline target)
const MAP_MODE_MULT: Record<MapMode, number> = {
  Stock: 0.5,
  Everyday: 0.86,
  Tow: 0.94,
  Performance: 1.1,
};

// ---- GTurbo fitment helper (scraped list + your hard rules) ----
type FitmentKey = keyof typeof gturboFitment.platformTurbos;

function fitment(key: FitmentKey, allow: Turbo[]): Turbo[] {
  const scraped = (gturboFitment.platformTurbos?.[key] ?? []) as Turbo[];
  const merged: Turbo[] = ["Stock", ...scraped];
  return Array.from(new Set(merged)).filter((t) => allow.includes(t));
}

const CONFIG = {
  makes: ["Toyota"] as const,
  modelsByMake: {
    Toyota: ["Hilux", "LandCruiser 70", "LandCruiser 200", "LandCruiser 300"] as const,
  },
  emissions: ["Intact", "Modified"] as const,
  tuning: ["Single Tune", "Multi Mapping"] as const,
  mapModes: ["Stock", "Everyday", "Tow", "Performance"] as const,

  variants: [
    {
      key: "HILUX_N70_1KD",
      make: "Toyota",
      model: "Hilux",
      label: "Hilux N70 (1KD)",
      engine: "1KD",
      rpmMin: 1500,
      rpmMax: 4200,
      allowedTurbos: fitment("HILUX", ["Stock", "G250", "G300"]),
      allowedTuning: ["Single Tune"],
      allowedMods: ["frontMount", "airbox", "injectors"],
      injectorSizes: ["Stock", "+60"] as const,
      basePower: {
        Stock: { "Single Tune": [70, 80] },
        G250: { "Single Tune": [140, 155] },
        G300: { "Single Tune": [150, 170] },
      },
    },

    {
      key: "HILUX_N80_1GD",
      make: "Toyota",
      model: "Hilux",
      label: "Hilux N80 (1GD)",
      engine: "1GD",
      rpmMin: 1200,
      rpmMax: 4000,
      allowedTurbos: fitment("HILUX", ["Stock", "G300", "G333"]),
      allowedTuning: ["Single Tune", "Multi Mapping"],
      allowedMods: ["frontMount", "airbox", "powerpipe", "injectors", "strokerPump"],
      injectorSizes: ["Stock", "+35", "+100"] as const,
      basePower: {
        Stock: { "Single Tune": [125, 145], "Multi Mapping": [125, 145] },
        G300: { "Single Tune": [175, 195], "Multi Mapping": [180, 200] },
        G333: { "Single Tune": [175, 195], "Multi Mapping": [180, 200] },
      },
    },

    {
      key: "LC70_1VD",
      make: "Toyota",
      model: "LandCruiser 70",
      label: "70 Series (1VD)",
      engine: "1VD",
      rpmMin: 1200,
      rpmMax: 3800,
      allowedTurbos: fitment("LC70_1VD", ["Stock", "G333", "G400"]),
      allowedTuning: ["Single Tune", "Multi Mapping"],
      allowedMods: ["frontMount", "airbox", "powerpipe", "injectors"],
      injectorSizes: ["Stock", "+50", "+80", "+150"] as const,
      basePower: {
        Stock: { "Single Tune": [135, 155], "Multi Mapping": [135, 155] },
        G333: { "Single Tune": [185, 205], "Multi Mapping": [190, 215] },
        G400: { "Single Tune": [195, 220], "Multi Mapping": [205, 235] },
      },
    },

    {
      key: "LC70_1GD",
      make: "Toyota",
      model: "LandCruiser 70",
      label: "70 Series (1GD)",
      engine: "1GD",
      rpmMin: 1200,
      rpmMax: 4000,
      allowedTurbos: fitment("HILUX", ["Stock", "G333"]),
      allowedTuning: ["Single Tune", "Multi Mapping"],
      allowedMods: ["frontMount", "airbox", "powerpipe", "heatExchanger", "injectors", "strokerPump"],
      injectorSizes: ["Stock", "+35", "+100"] as const,
      basePower: {
        Stock: { "Single Tune": [130, 150], "Multi Mapping": [130, 150] },
        G333: { "Single Tune": [175, 195], "Multi Mapping": [180, 200] },
      },
    },

    {
      key: "LC200_1VD",
      make: "Toyota",
      model: "LandCruiser 200",
      label: "200 Series (1VD)",
      engine: "1VD",
      rpmMin: 1200,
      rpmMax: 3800,
      allowedTurbos: fitment("LC200_1VD", ["Stock", "G380", "G450"]),
      allowedTuning: ["Single Tune", "Multi Mapping"],
      allowedMods: ["frontMount", "airbox", "powerpipe", "heatExchanger", "injectors"],
      injectorSizes: ["Stock", "+20", "+40", "+60", "+80"] as const,
      basePower: {
        Stock: { "Single Tune": [145, 165], "Multi Mapping": [145, 165] },
        G380: { "Single Tune": [190, 215], "Multi Mapping": [200, 225] },
        G450: { "Single Tune": [210, 240], "Multi Mapping": [220, 255] },
      },
    },

    {
      key: "LC300_33D",
      make: "Toyota",
      model: "LandCruiser 300",
      label: "300 Series (3.3D)",
      engine: "3.3D",
      rpmMin: 1200,
      rpmMax: 4200,
      allowedTurbos: ["Stock"],
      allowedTuning: ["Single Tune", "Multi Mapping"],
      allowedMods: ["airbox", "heatExchanger"],
      basePower: {
        Stock: { "Single Tune": [185, 205], "Multi Mapping": [190, 210] },
      },
      modAdds: { heatExchanger: [2, 5] },
    },
  ] as const satisfies readonly Variant[],
};

function addRange(a: [number, number], b: [number, number]) {
  return [Math.round(a[0] + b[0]), Math.round(a[1] + b[1])] as [number, number];
}
function mid([a, b]: [number, number]) {
  return (a + b) / 2;
}
function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}
function applyMult(range: [number, number], mult: number): [number, number] {
  return [Math.round(range[0] * mult), Math.round(range[1] * mult)];
}
function capRange(range: [number, number], capKw?: number): [number, number] {
  if (!capKw || !Number.isFinite(capKw)) return range;
  return [Math.min(range[0], capKw), Math.min(range[1], capKw)];
}

// Dyno-like curve: GTurbo style = earlier, sharper response on many combos
function makeDynoCurve(opts: { rpmMin: number; rpmMax: number; peakKw: number; turbo: Turbo }) {
  const { rpmMin, rpmMax, peakKw, turbo } = opts;

  const spoolCenter =
    turbo === "Stock" ? 2000 :
    turbo === "G250" ? 1900 :
    turbo === "G300" ? 1850 :
    turbo === "G333" ? 1750 :
    turbo === "G380" ? 1700 :
    turbo === "G400" ? 1650 :
    /* G450 */        1600;

  // lower sharpness = quicker ramp
  const spoolSharpness =
    turbo === "Stock" ? 420 :
    turbo === "G250" ? 380 :
    turbo === "G300" ? 360 :
    turbo === "G333" ? 330 :
    turbo === "G380" ? 320 :
    turbo === "G400" ? 310 :
    /* G450 */        300;

  const peakRpm =
    turbo === "Stock" ? 3300 :
    turbo === "G250" ? 3300 :
    turbo === "G300" ? 3350 :
    turbo === "G333" ? 3400 :
    turbo === "G380" ? 3450 :
    turbo === "G400" ? 3500 :
    /* G450 */        3550;

  const points: Array<{ rpm: number; kw: number; nm: number }> = [];
  for (let rpm = rpmMin; rpm <= rpmMax; rpm += 100) {
    const spool = 1 / (1 + Math.exp(-(rpm - spoolCenter) / spoolSharpness));
    const taper = Math.exp(-Math.pow((rpm - peakRpm) / 900, 2) * 0.55);

    let kw = peakKw * spool * (0.55 + 0.45 * taper);
    if (rpm > peakRpm) kw *= 1 - ((rpm - peakRpm) / (rpmMax - peakRpm)) * 0.08;

    kw = clamp(kw, 0, peakKw * 1.02);

    const nm = rpm > 0 ? (kw * 9549) / rpm : 0;
    points.push({ rpm, kw: Math.round(kw), nm: Math.round(nm) });
  }
  return points;
}

function classNames(...xs: Array<string | false | undefined>) {
  return xs.filter(Boolean).join(" ");
}
function pill(on: boolean) {
  return on
    ? "bg-emerald-500/15 border-emerald-400/30 text-emerald-200"
    : "bg-zinc-900 border-zinc-800 text-zinc-200 hover:bg-zinc-800";
}
function card() {
  return "rounded-3xl border border-zinc-800 bg-zinc-900/40 p-5";
}
function miniCard() {
  return "rounded-3xl border border-zinc-800 bg-zinc-950/40 p-4";
}

function Select({
  value,
  onChange,
  options,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={classNames(
        "w-full rounded-2xl border bg-zinc-950 px-3 py-2 text-sm",
        disabled ? "border-zinc-900 text-zinc-600" : "border-zinc-700"
      )}
    >
      {options.map((x) => (
        <option key={x} value={x}>
          {x}
        </option>
      ))}
    </select>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-zinc-400 mb-1">{label}</div>
      {children}
    </div>
  );
}

function Toggle({
  label,
  on,
  setOn,
  disabled,
  hint,
}: {
  label: string;
  on: boolean;
  setOn: (v: boolean) => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <div className={miniCard()}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-medium">{label}</div>
          {hint ? <div className="text-xs text-zinc-500 mt-1">{hint}</div> : null}
        </div>
        <button
          disabled={disabled}
          className={classNames(
            "rounded-2xl border px-3 py-1 text-sm transition",
            disabled ? "bg-zinc-900 border-zinc-900 text-zinc-600" : pill(on)
          )}
          onClick={() => setOn(!on)}
        >
          {on ? "On" : "Off"}
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [make, setMake] = useState<Make>("Toyota");
  const [model, setModel] = useState<Model>("Hilux");

  const modelVariants = useMemo(
    () => CONFIG.variants.filter((v) => v.make === make && v.model === model),
    [make, model]
  );

  const [variantKey, setVariantKey] = useState<VariantKey>("HILUX_N80_1GD");

  const variant = useMemo(() => {
    const found = CONFIG.variants.find((v) => v.key === variantKey);
    return found ?? modelVariants[0];
  }, [variantKey, modelVariants]);

  const [emissions, setEmissions] = useState<Emissions>("Intact");

  const allowedTurbos = variant.allowedTurbos;
  const allowedTuning = variant.allowedTuning;
  const allowedMods = new Set(variant.allowedMods);

  const [turbo, setTurbo] = useState<Turbo>(allowedTurbos[0] ?? "Stock");
  const [tuning, setTuning] = useState<Tuning>(allowedTuning[0] ?? "Single Tune");

  // Multi-map overlays (sticky buttons)
  const [mapModes, setMapModes] = useState<Record<MapMode, boolean>>({
    Stock: true,
    Everyday: true,
    Tow: true,
    Performance: true,
  });

  // Mods toggles
  const [frontMount, setFrontMount] = useState(false);
  const [airbox, setAirbox] = useState(false);
  const [powerpipe, setPowerpipe] = useState(false);
  const [heatExchanger, setHeatExchanger] = useState(false);

  // Injectors
  const injectorsAllowed = allowedMods.has("injectors");
  const [injectorsEnabled, setInjectorsEnabled] = useState(false);

  const injectorSizeOptions = (variant.injectorSizes ?? ["Stock"]) as readonly string[];
  const [injectorSize, setInjectorSize] = useState<string>(injectorSizeOptions[0] ?? "Stock");

  // Stroker pump (GD only)
  const strokerAllowed = allowedMods.has("strokerPump");
  const [strokerPump, setStrokerPump] = useState(false);

  // When variant changes, enforce compatibility + clear disallowed toggles
  useEffect(() => {
    if (!allowedTurbos.includes(turbo)) setTurbo(allowedTurbos[0]);
    if (!allowedTuning.includes(tuning)) setTuning(allowedTuning[0]);

    if (!allowedMods.has("frontMount")) setFrontMount(false);
    if (!allowedMods.has("airbox")) setAirbox(false);
    if (!allowedMods.has("powerpipe")) setPowerpipe(false);
    if (!allowedMods.has("heatExchanger")) setHeatExchanger(false);

    if (!allowedMods.has("injectors")) setInjectorsEnabled(false);

    const nextOpts = (variant.injectorSizes ?? ["Stock"]) as readonly string[];
    setInjectorSize(nextOpts[0] ?? "Stock");

    if (!allowedMods.has("strokerPump")) setStrokerPump(false);

    // reset overlays on variant change
    setMapModes({ Stock: true, Everyday: true, Tow: true, Performance: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variantKey]);

  // If 1GD +100, stroker pump is required
  const strokerRequired =
    variant.engine === "1GD" && injectorsAllowed && injectorsEnabled && injectorSize === "+100";

  useEffect(() => {
    if (strokerRequired) setStrokerPump(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strokerRequired]);

  // Base range (kW)
  const baseRange = useMemo<[number, number]>(() => {
    const r = variant.basePower[turbo]?.[tuning];
    return (r ?? [0, 0]) as [number, number];
  }, [variant, turbo, tuning]);

  // Apply mod adds + injector adds (kW range)
  const preMapRange = useMemo<[number, number]>(() => {
    let r = baseRange;

    const modAdds = { ...DEFAULT_MOD_ADDS, ...(variant.modAdds ?? {}) };

    if (allowedMods.has("frontMount") && frontMount) r = addRange(r, modAdds.frontMount);
    if (allowedMods.has("airbox") && airbox) r = addRange(r, modAdds.airbox);
    if (allowedMods.has("powerpipe") && powerpipe) r = addRange(r, modAdds.powerpipe);
    if (allowedMods.has("heatExchanger") && heatExchanger) r = addRange(r, modAdds.heatExchanger);

    // Injectors
    if (injectorsAllowed && injectorsEnabled) {
      if (variant.engine === "1GD") {
        const add = INJ_ADDS_1GD[injectorSize as InjectorSizeGD] ?? [0, 0];
        r = addRange(r, add);
      } else {
        const add = INJ_ADDS_GENERIC[injectorSize as InjectorSizeGeneric] ?? [0, 0];
        r = addRange(r, add);
      }
    }

    // Stroker pump: you set it as a small add in DEFAULT_MOD_ADDS, so apply when on
    if (strokerAllowed && strokerPump) r = addRange(r, modAdds.strokerPump);

    return r;
  }, [
    baseRange,
    variant.modAdds,
    variant.engine,
    allowedMods,
    frontMount,
    airbox,
    powerpipe,
    heatExchanger,
    injectorsAllowed,
    injectorsEnabled,
    injectorSize,
    strokerAllowed,
    strokerPump,
  ]);

  // Headline power range (apply emissions + optional cap only)
  const powerRange = useMemo<[number, number]>(() => {
    const emissionsMult = EMISSIONS_MULT[emissions];
    let r = applyMult(preMapRange, emissionsMult);

    const cap = variant.capsKw?.[turbo];
    r = capRange(r, cap);

    return r;
  }, [preMapRange, emissions, variant.capsKw, turbo]);

  // Headline peak
  const peakKw = useMemo(() => Math.round(mid(powerRange)), [powerRange]);

  // Multi-map overlays
  const dynoSeries = useMemo(() => {
    const emissionsMult = EMISSIONS_MULT[emissions];
    const modes: MapMode[] = ["Stock", "Everyday", "Tow", "Performance"];

    const include = (mode: MapMode) =>
      tuning !== "Multi Mapping" ? mode === "Performance" : !!mapModes[mode];

    const series = modes
      .filter(include)
      .map((mode) => {
        const modeMult = tuning === "Multi Mapping" ? MAP_MODE_MULT[mode] : 1.0;
        const modePeak = Math.round(mid(applyMult(preMapRange, emissionsMult * modeMult)));

        return {
          mode,
          data: makeDynoCurve({ rpmMin: 1500, rpmMax: 4000, peakKw: modePeak, turbo }),
        };
      });

    // never allow empty
    if (!series.length) {
      const fallbackPeak = Math.round(mid(applyMult(preMapRange, emissionsMult)));
      return [
        {
          mode: "Performance" as MapMode,
          data: makeDynoCurve({ rpmMin: 1500, rpmMax: 4000, peakKw: fallbackPeak, turbo }),
        },
      ];
    }

    return series;
  }, [tuning, mapModes, preMapRange, emissions, turbo]);

  // Merge for recharts multi-lines
  const mergedDynoData = useMemo(() => {
    const map = new Map<number, any>();

    for (const s of dynoSeries) {
      for (const p of s.data) {
        const row = map.get(p.rpm) ?? { rpm: p.rpm };
        row[`kw_${s.mode}`] = p.kw;
        row[`nm_${s.mode}`] = p.nm;
        map.set(p.rpm, row);
      }
    }

    return Array.from(map.values()).sort((a, b) => a.rpm - b.rpm);
  }, [dynoSeries]);

  // Peaks across visible series
  const peaks = useMemo(() => {
    let maxKw = { rpm: 0, kw: 0 };
    let maxNm = { rpm: 0, nm: 0 };

    for (const s of dynoSeries) {
      for (const p of s.data) {
        if (p.kw > maxKw.kw) maxKw = { rpm: p.rpm, kw: p.kw };
        if (p.nm > maxNm.nm) maxNm = { rpm: p.rpm, nm: p.nm };
      }
    }

    return { maxKw, maxNm };
  }, [dynoSeries]);

  const customerSummary = useMemo(() => {
    const mods: string[] = [];

    const emissionsLine =
      emissions === "Modified"
        ? "Emissions: Modified (includes DPF delete where applicable)."
        : "Emissions: Intact.";

    if (allowedMods.has("airbox") && airbox) mods.push("Airbox upgrade");
    if (allowedMods.has("heatExchanger") && heatExchanger) mods.push("Heat exchanger");
    if (allowedMods.has("frontMount") && frontMount) mods.push("Front mount intercooler");
    if (allowedMods.has("powerpipe") && powerpipe) mods.push("Powerpipe");

    if (injectorsAllowed && injectorsEnabled) {
      mods.push(`Injectors (${injectorSize})`);
      if (strokerAllowed && strokerPump) mods.push("Stroker pump");
    } else if (strokerAllowed && strokerPump) {
      mods.push("Stroker pump");
    }

    const [pMin, pMax] = powerRange;

    const mapsLine =
      tuning === "Multi Mapping"
        ? `Maps shown: ${(["Stock", "Everyday", "Tow", "Performance"] as const)
            .filter((m) => mapModes[m])
            .join(", ") || "none"}.`
        : "";

    const req = strokerRequired ? "Note: +100 injectors require stroker pump (enabled)." : "";

    return [
      `TuneWorks Performance Package`,
      `${make} ${model} — ${variant.label}`,
      `Turbo: ${turbo}. Tuning: ${tuning}.`,
      mapsLine,
      emissionsLine,
      `Estimated power: ~${pMin}–${pMax} kW at wheels (setup-dependent).`,
      `Supporting mods: ${mods.length ? mods.join(", ") : "none selected"}.`,
      req,
    ]
      .filter(Boolean)
      .join("\n");
  }, [
    make,
    model,
    variant.label,
    turbo,
    tuning,
    emissions,
    allowedMods,
    airbox,
    heatExchanger,
    frontMount,
    powerpipe,
    injectorsAllowed,
    injectorsEnabled,
    injectorSize,
    strokerAllowed,
    strokerPump,
    powerRange,
    strokerRequired,
    mapModes,
  ]);

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      window.prompt("Copy this:", text);
    }
  }

  function onMakeChange(v: string) {
    const mk = v as Make;
    setMake(mk);
    const firstModel = CONFIG.modelsByMake[mk][0] as Model;
    setModel(firstModel);
    const firstVariant = CONFIG.variants.find((x) => x.make === mk && x.model === firstModel);
    if (firstVariant) setVariantKey(firstVariant.key);
  }

  function onModelChange(v: string) {
    const m = v as Model;
    setModel(m);
    const firstVariant = CONFIG.variants.find((x) => x.make === make && x.model === m);
    if (firstVariant) setVariantKey(firstVariant.key);
  }

  const variantOptions = modelVariants.map((v) => ({ key: v.key, label: v.label }));
  const hideTurbo = allowedTurbos.length <= 1;

  const mapsShownLabel =
    tuning === "Multi Mapping"
      ? (["Stock", "Everyday", "Tow", "Performance"] as const).filter((m) => mapModes[m]).join(", ") || "none"
      : "Performance";

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-7xl px-6 py-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-zinc-800 grid place-items-center font-bold">TW</div>
            <div>
              <div className="text-xl font-semibold">TuneWorks Package Builder</div>
              <div className="text-sm text-zinc-400">Turbo compatibility + injector rules + multi-map overlays</div>
            </div>
          </div>
          <button
            onClick={() => copy(customerSummary)}
            className="rounded-2xl bg-zinc-100 px-4 py-2 text-zinc-900 font-semibold hover:opacity-90"
          >
            Copy for customer
          </button>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-7">
          {/* Builder */}
          <div className="lg:col-span-3 space-y-6">
            <div className={card()}>
              <div className="text-sm text-zinc-400">Vehicle</div>

              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Make">
                  <Select value={make} onChange={onMakeChange} options={CONFIG.makes} />
                </Field>
                <Field label="Model">
                  <Select value={model} onChange={onModelChange} options={CONFIG.modelsByMake[make]} />
                </Field>

                <Field label="Variant">
                  <select
                    value={variantKey}
                    onChange={(e) => setVariantKey(e.target.value as VariantKey)}
                    className="w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
                  >
                    {variantOptions.map((o) => (
                      <option key={o.key} value={o.key}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Emissions equipment">
                  <Select
                    value={emissions}
                    onChange={(v) => setEmissions(v as Emissions)}
                    options={CONFIG.emissions}
                  />
                </Field>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {!hideTurbo ? (
                  <Field label="Turbo (compatible)">
                    <Select value={turbo} onChange={(v) => setTurbo(v as Turbo)} options={allowedTurbos} />
                  </Field>
                ) : (
                  <Field label="Turbo (compatible)">
                    <Select value={allowedTurbos[0]} onChange={() => {}} options={allowedTurbos} disabled />
                  </Field>
                )}

                <Field label="Tuning">
                  <Select value={tuning} onChange={(v) => setTuning(v as Tuning)} options={allowedTuning} />
                </Field>
              </div>

              {/* Multi-map overlays */}
              {tuning === "Multi Mapping" ? (
                <div className="mt-4">
                  <div className="text-xs text-zinc-400 mb-2">Multi-map overlays</div>
                  <div className="grid grid-cols-2 gap-2">
                    {(CONFIG.mapModes as readonly MapMode[]).map((m) => (
                      <button
                        key={m}
                        onClick={() => setMapModes((prev) => ({ ...prev, [m]: !prev[m] }))}
                        className={classNames(
                          "rounded-2xl border px-3 py-2 text-sm transition",
                          mapModes[m]
                            ? "bg-zinc-100 text-zinc-900 border-zinc-100 font-semibold"
                            : "bg-zinc-950/60 text-zinc-300 border-zinc-800 hover:bg-zinc-900"
                        )}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 text-xs text-zinc-500">Toggle modes to overlay multiple runs.</div>
                </div>
              ) : null}
            </div>

            <div className={card()}>
              <div className="text-sm text-zinc-400">Supporting mods</div>
              <div className="text-lg font-semibold">Options for this platform</div>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Toggle label="Airbox" on={airbox} setOn={setAirbox} disabled={!allowedMods.has("airbox")} />
                <Toggle
                  label="Heat exchanger"
                  on={heatExchanger}
                  setOn={setHeatExchanger}
                  disabled={!allowedMods.has("heatExchanger")}
                />

                <Toggle
                  label="Front mount"
                  on={frontMount}
                  setOn={setFrontMount}
                  disabled={!allowedMods.has("frontMount")}
                  hint={variant.key === "LC300_33D" ? "Not offered on 300 series" : undefined}
                />
                <Toggle
                  label="Powerpipe"
                  on={powerpipe}
                  setOn={setPowerpipe}
                  disabled={!allowedMods.has("powerpipe")}
                  hint={variant.key === "LC300_33D" ? "Not offered on 300 series" : undefined}
                />

                {/* Injectors */}
                <div className={miniCard()}>
                  <div className="flex items-center justify-between">
                    <div className="font-medium">Injectors</div>
                    <button
                      disabled={!injectorsAllowed}
                      className={classNames(
                        "rounded-2xl border px-3 py-1 text-sm transition",
                        !injectorsAllowed ? "bg-zinc-900 border-zinc-900 text-zinc-600" : pill(injectorsEnabled)
                      )}
                      onClick={() => setInjectorsEnabled((s) => !s)}
                    >
                      {injectorsEnabled ? "On" : "Off"}
                    </button>
                  </div>

                  <div className="mt-3">
                    <div className="text-xs text-zinc-400 mb-1">Size</div>
                    <select
                      disabled={!injectorsAllowed || !injectorsEnabled}
                      value={injectorSize}
                      onChange={(e) => setInjectorSize(e.target.value)}
                      className={classNames(
                        "w-full rounded-2xl border bg-zinc-950 px-3 py-2 text-sm",
                        injectorsAllowed && injectorsEnabled ? "border-zinc-700" : "border-zinc-900 text-zinc-600"
                      )}
                    >
                      {injectorSizeOptions.map((x) => (
                        <option key={x} value={x}>
                          {x}
                        </option>
                      ))}
                    </select>

                    {variant.engine === "1GD" ? (
                      <div className="mt-2 text-xs text-zinc-500">GD sizes: +35 / +100. +100 requires stroker pump.</div>
                    ) : null}
                  </div>
                </div>

                {/* Stroker pump */}
                <Toggle
                  label="Stroker pump"
                  on={strokerPump}
                  setOn={setStrokerPump}
                  disabled={!strokerAllowed || strokerRequired}
                  hint={strokerRequired ? "Required for +100 injectors" : undefined}
                />
              </div>

              <div className="mt-4 text-xs text-zinc-500">
                Note: “Emissions Modified” covers DPF delete where applicable. Use in line with your business policy and local regs.
              </div>
            </div>

            <div className={card()}>
              <div className="text-sm text-zinc-400">Summary</div>
              <div className="mt-2 text-sm text-zinc-200 whitespace-pre-line rounded-2xl bg-zinc-950/70 border border-zinc-800 p-3">
                {customerSummary}
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => copy(customerSummary)}
                  className="flex-1 rounded-2xl border border-zinc-700 bg-zinc-100 px-4 py-2 text-zinc-900 font-semibold hover:opacity-90"
                >
                  Copy summary
                </button>
                <button
                  onClick={() => window.print()}
                  className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-zinc-200 hover:bg-zinc-800"
                >
                  Print dyno
                </button>
              </div>
            </div>
          </div>

          {/* Dyno sheet */}
          <div className="lg:col-span-4 space-y-6">
            <div className={card()}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm text-zinc-400">Dyno sheet (emulated)</div>
                  <div className="text-lg font-semibold">
                    {make} {model} — {variant.label}
                  </div>
                  <div className="mt-1 text-sm text-zinc-400">
                    {turbo} • {tuning}
                    {tuning === "Multi Mapping" ? ` • ${mapsShownLabel}` : ""}
                    {" • "}Estimated peak ~{peakKw} kW @ wheels
                  </div>
                </div>
                <button
                  onClick={() =>
                    copy(
                      `DYNO (EMULATED)\n${make} ${model} — ${variant.label}\nTurbo: ${turbo}\nTuning: ${tuning}${
                        tuning === "Multi Mapping" ? ` (${mapsShownLabel})` : ""
                      }\nPeak: ${peaks.maxKw.kw} kW @ ${peaks.maxKw.rpm} rpm\nTorque: ${peaks.maxNm.nm} Nm @ ${peaks.maxNm.rpm} rpm`
                    )
                  }
                  className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-2 text-zinc-200 hover:bg-zinc-800"
                >
                  Copy dyno text
                </button>
              </div>

              <div className="mt-4 h-[360px] rounded-2xl border border-zinc-800 bg-zinc-950/60 p-3">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={mergedDynoData}>
                    <CartesianGrid strokeDasharray="4 6" />
                    <XAxis dataKey="rpm" type="number" domain={[1500, 4000]} tick={{ fill: "#a1a1aa" }} />
                    <YAxis
                      yAxisId="left"
                      type="number"
                      domain={[0, 350]}
                      tick={{ fill: "#a1a1aa" }}
                      label={{ value: "kW", angle: -90, position: "insideLeft" }}
                    />
                    <YAxis
                      yAxisId="right"
                      type="number"
                      orientation="right"
                      domain={[0, 1300]}
                      tick={{ fill: "#a1a1aa" }}
                      label={{ value: "Nm", angle: -90, position: "insideRight" }}
                    />
                    <Tooltip />
                    <Legend />

                    {dynoSeries.map((s) => (
                      <Line
                        key={`kw_${s.mode}`}
                        yAxisId="left"
                        type="monotone"
                        dataKey={`kw_${s.mode}`}
                        name={`Power (${s.mode})`}
                        dot={false}
                        strokeWidth={2}
                      />
                    ))}
                    {dynoSeries.map((s) => (
                      <Line
                        key={`nm_${s.mode}`}
                        yAxisId="right"
                        type="monotone"
                        dataKey={`nm_${s.mode}`}
                        name={`Torque (${s.mode})`}
                        dot={false}
                        strokeWidth={2}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className={miniCard()}>
                  <div className="text-xs text-zinc-400">Peak power</div>
                  <div className="mt-1 text-lg font-semibold">{peaks.maxKw.kw} kW</div>
                  <div className="text-xs text-zinc-500">@ {peaks.maxKw.rpm} rpm</div>
                </div>
                <div className={miniCard()}>
                  <div className="text-xs text-zinc-400">Peak torque</div>
                  <div className="mt-1 text-lg font-semibold">{peaks.maxNm.nm} Nm</div>
                  <div className="text-xs text-zinc-500">@ {peaks.maxNm.rpm} rpm</div>
                </div>
                <div className={miniCard()}>
                  <div className="text-xs text-zinc-400">RPM window</div>
                  <div className="mt-1 text-lg font-semibold">1500–4000</div>
                  <div className="text-xs text-zinc-500">Fixed sweep</div>
                </div>
              </div>

              <div className="mt-4 text-xs text-zinc-500">
                Dyno sheet is an emulation for package comparison/call handling — not a measured result.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}