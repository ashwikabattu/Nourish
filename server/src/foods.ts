/**
 * Food lookup backed by USDA FoodData Central (https://fdc.nal.usda.gov).
 * Results are normalized to nutrients per 100 g (or 100 ml) plus a list of
 * portions, so the client can scale nutrition to whatever amount was eaten.
 */

export interface Macros {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface Portion {
  label: string;
  /** Size of one portion in `baseUnit`. */
  amount: number;
}

export interface FoodResult {
  fdcId: number;
  name: string;
  brand: string | null;
  source: 'generic' | 'branded';
  /** Nutrients in `per100` are per 100 of this unit. */
  baseUnit: 'g' | 'ml';
  per100: Macros;
  portions: Portion[];
}

export interface FoodSearch {
  search(query: string): Promise<FoodResult[]>;
}

export class FoodSearchError extends Error {
  constructor(
    message: string,
    public readonly rateLimited = false,
  ) {
    super(message);
  }
}

// --- raw FoodData Central shapes (only the fields we use) ---
interface FdcNutrient {
  nutrientId: number;
  unitName?: string;
  value?: number;
}
interface FdcMeasure {
  disseminationText?: string;
  gramWeight?: number;
}
interface FdcFood {
  fdcId: number;
  description: string;
  dataType: string;
  brandOwner?: string;
  brandName?: string;
  servingSize?: number;
  servingSizeUnit?: string;
  householdServingFullText?: string;
  foodNutrients?: FdcNutrient[];
  foodMeasures?: FdcMeasure[];
}

const NUTRIENT = {
  energyKcal: 1008,
  energyAtwaterSpecific: 2048,
  energyAtwaterGeneral: 2047,
  protein: 1003,
  fat: 1004,
  carbs: 1005,
} as const;

const ENERGY_IDS = new Set<number>([NUTRIENT.energyKcal, NUTRIENT.energyAtwaterSpecific, NUTRIENT.energyAtwaterGeneral]);

const GENERIC_TYPES =['Foundation', 'SR Legacy', 'Survey (FNDDS)'];
const BRANDED_TYPES = ['Branded'];

const round1 = (n: number) => Math.round(n * 10) / 10;

/** "GREEK YOGURT, PLAIN" -> "Greek Yogurt, Plain". Leaves mixed-case text alone. */
export function tidyCase(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ');
  if (t !== t.toUpperCase()) return t;
  return t.toLowerCase().replace(/(^|[\s,(/&-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

function nutrientValue(food: FdcFood, id: number): number | undefined {
  const n = food.foodNutrients?.find((x) => x.nutrientId === id);
  if (n?.value == null || Number.isNaN(n.value)) return undefined;
  if (ENERGY_IDS.has(id) && n.unitName && n.unitName.toUpperCase() !== 'KCAL') return undefined; // skip kJ
  return n.value;
}

function unitOf(raw: string | undefined): 'g' | 'ml' | null {
  const u = raw?.trim().toLowerCase();
  if (u === 'g' || u === 'grm') return 'g';
  if (u === 'ml' || u === 'mlt') return 'ml';
  return null;
}

export function normalizeFood(food: FdcFood): FoodResult | null {
  const protein = nutrientValue(food, NUTRIENT.protein) ?? 0;
  const fat = nutrientValue(food, NUTRIENT.fat) ?? 0;
  const carbs = nutrientValue(food, NUTRIENT.carbs) ?? 0;
  // Foundation foods often report energy only as Atwater factors; fall back to 4/4/9 as a last resort.
  const calories =
    nutrientValue(food, NUTRIENT.energyKcal) ??
    nutrientValue(food, NUTRIENT.energyAtwaterSpecific) ??
    nutrientValue(food, NUTRIENT.energyAtwaterGeneral) ??
    (protein || carbs || fat ? protein * 4 + carbs * 4 + fat * 9 : undefined);
  if (calories === undefined) return null;

  const branded = food.dataType === 'Branded';
  const servingUnit = unitOf(food.servingSizeUnit);
  const baseUnit = branded && servingUnit === 'ml' ? 'ml' : 'g';

  const portions: Portion[] = [];
  if (branded) {
    if (servingUnit && food.servingSize && food.servingSize > 0) {
      const household = food.householdServingFullText?.trim().toLowerCase();
      const size = `${round1(food.servingSize)} ${servingUnit}`;
      portions.push({ label: household ? `serving (${household}, ${size})` : `serving (${size})`, amount: food.servingSize });
    }
  } else {
    const seen = new Set<string>();
    for (const m of food.foodMeasures ?? []) {
      if (!m.disseminationText || !m.gramWeight || m.gramWeight <= 0) continue;
      const text = m.disseminationText === 'Quantity not specified' ? 'typical serving' : m.disseminationText;
      const label = `${text} (${round1(m.gramWeight)} g)`;
      if (seen.has(label)) continue;
      seen.add(label);
      portions.push({ label, amount: m.gramWeight });
    }
  }

  const brand = branded ? food.brandName || food.brandOwner : undefined;
  return {
    fdcId: food.fdcId,
    name: tidyCase(food.description),
    brand: brand ? tidyCase(brand) : null,
    source: branded ? 'branded' : 'generic',
    baseUnit,
    per100: { calories: Math.round(calories), protein: round1(protein), carbs: round1(carbs), fat: round1(fat) },
    portions: portions.slice(0, 8),
  };
}

export interface FdcClientOptions {
  apiKey: string;
  fetch?: typeof fetch;
  baseUrl?: string;
  cacheTtlMs?: number;
  cacheSize?: number;
  timeoutMs?: number;
}

export function createFdcClient({
  apiKey,
  fetch: fetchFn = globalThis.fetch,
  baseUrl = 'https://api.nal.usda.gov/fdc/v1',
  cacheTtlMs = 24 * 60 * 60 * 1000,
  cacheSize = 500,
  timeoutMs = 8000,
}: FdcClientOptions): FoodSearch {
  const cache = new Map<string, { at: number; results: FoodResult[] }>();

  async function query(text: string, dataType: string[], pageSize: number): Promise<FdcFood[]> {
    let res: Response;
    try {
      res = await fetchFn(`${baseUrl}/foods/search?api_key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: text, dataType, pageSize }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      throw new FoodSearchError(`FoodData Central unreachable: ${String(err)}`);
    }
    if (res.status === 429) throw new FoodSearchError('FoodData Central rate limit reached', true);
    if (!res.ok) throw new FoodSearchError(`FoodData Central returned ${res.status}`);
    const body = (await res.json()) as { foods?: FdcFood[] };
    return body.foods ?? [];
  }

  return {
    async search(raw) {
      const key = raw.trim().toLowerCase().replace(/\s+/g, ' ');
      const hit = cache.get(key);
      if (hit && Date.now() - hit.at < cacheTtlMs) return hit.results;

      // Generic foods ("Banana, raw") first, then branded products, which otherwise crowd them out.
      const [generic, branded] = await Promise.allSettled([
        query(key, GENERIC_TYPES, 10),
        query(key, BRANDED_TYPES, 6),
      ]);
      if (generic.status === 'rejected' && branded.status === 'rejected') throw generic.reason;

      const seen = new Set<number>();
      const results: FoodResult[] = [];
      for (const settled of [generic, branded]) {
        if (settled.status !== 'fulfilled') continue;
        for (const food of settled.value) {
          if (seen.has(food.fdcId)) continue;
          const normalized = normalizeFood(food);
          if (!normalized) continue;
          seen.add(food.fdcId);
          results.push(normalized);
        }
      }

      if (cache.size >= cacheSize) cache.delete(cache.keys().next().value!);
      cache.set(key, { at: Date.now(), results });
      return results;
    },
  };
}
