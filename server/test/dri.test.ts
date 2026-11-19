import { describe, expect, it } from 'vitest';
import { calculateDri, type Body } from '../src/dri.js';

const LB = 0.45359237;
const IN = 2.54;

const valueOf = (list: { key: string; amount: number | null; upperLimit: number | null }[], key: string) => {
  const n = list.find((x) => x.key === key);
  if (!n) throw new Error(`missing ${key}`);
  return [n.amount, n.upperLimit];
};

describe('calculateDri', () => {
  // Reference output from the USDA DRI Calculator for this exact person.
  const usdaExample: Body = {
    sex: 'female',
    age: 21,
    heightCm: 59 * IN, // 4 ft 11 in
    weightKg: 89 * LB,
    activity: 'low_active',
  };

  it('matches the USDA calculator for energy, BMI, and macronutrients', () => {
    const r = calculateDri(usdaExample);
    expect(r.calories).toBe(1908);
    expect(Math.round(r.bmi.value)).toBe(18);
    expect(r.bmi.category).toBe('Underweight');
    expect(r.macros).toEqual({
      carbs: { min: 215, max: 310 },
      fiber: 27,
      protein: 32,
      fat: { min: 42, max: 74 },
      alphaLinolenicAcid: 1.1,
      linoleicAcid: 12,
      waterLiters: 2.7,
    });
  });

  it('matches the USDA calculator for vitamins and minerals', () => {
    const r = calculateDri(usdaExample);
    expect(valueOf(r.vitamins, 'vitaminA')).toEqual([700, 3000]);
    expect(valueOf(r.vitamins, 'vitaminD')).toEqual([15, 100]);
    expect(valueOf(r.vitamins, 'vitaminK')).toEqual([90, null]);
    expect(valueOf(r.vitamins, 'folate')).toEqual([400, 1000]);
    expect(valueOf(r.vitamins, 'choline')).toEqual([425, 3500]);
    expect(valueOf(r.minerals, 'calcium')).toEqual([1000, 2500]);
    expect(valueOf(r.minerals, 'iron')).toEqual([18, 45]);
    expect(valueOf(r.minerals, 'magnesium')).toEqual([310, 350]);
    expect(valueOf(r.minerals, 'potassium')).toEqual([2600, null]);
    expect(valueOf(r.minerals, 'sodium')).toEqual([1500, 2300]);
    expect(valueOf(r.minerals, 'zinc')).toEqual([8, 40]);
  });

  it('suggests goals in the middle of the carb and fat ranges, with protein at the RDA', () => {
    expect(calculateDri(usdaExample).suggestedGoals).toEqual({ calories: 1908, protein: 32, carbs: 263, fat: 58 });
  });

  it('uses male equations and values', () => {
    const r = calculateDri({ sex: 'male', age: 30, heightCm: 178, weightKg: 77, activity: 'active' });
    // 1004.82 - 10.83*30 + 4.31*178 + 15.59*77
    expect(r.calories).toBe(Math.round(1004.82 - 324.9 + 767.18 + 1200.43));
    expect(r.macros.protein).toBe(62);
    expect(r.macros.waterLiters).toBe(3.7);
    expect(valueOf(r.minerals, 'iron')).toEqual([8, 45]);
    expect(valueOf(r.minerals, 'zinc')).toEqual([11, 40]);
  });

  it('applies age bands', () => {
    const base = { sex: 'female', heightCm: 165, weightKg: 60, activity: 'inactive' } as const;
    const at40 = calculateDri({ ...base, age: 40 });
    const at60 = calculateDri({ ...base, age: 60 });
    const at75 = calculateDri({ ...base, age: 75 });

    expect(valueOf(at40.minerals, 'magnesium')[0]).toBe(320);
    expect(valueOf(at60.minerals, 'iron')[0]).toBe(8); // post-menopause
    expect(valueOf(at60.minerals, 'calcium')).toEqual([1200, 2000]);
    expect(valueOf(at60.vitamins, 'vitaminB6')[0]).toBe(1.5);
    expect(valueOf(at75.vitamins, 'vitaminD')[0]).toBe(20);
    expect(at60.macros.linoleicAcid).toBe(11);
    expect(at75.calories).toBeLessThan(at40.calories);
  });

  it('increases energy needs with activity level', () => {
    const levels = ['inactive', 'low_active', 'active', 'very_active'] as const;
    const kcal = levels.map((activity) => calculateDri({ ...usdaExample, activity }).calories);
    expect([...kcal].sort((a, b) => a - b)).toEqual(kcal);
  });
});
