/**
 * Dietary Reference Intake (DRI) calculator for adults (19+), following the
 * National Academies DRIs used by the USDA DRI Calculator for Healthcare Professionals:
 *  - Energy: 2023 Estimated Energy Requirement (EER) equations
 *  - Carbohydrate & fat: Acceptable Macronutrient Distribution Ranges (AMDR)
 *  - Protein: RDA of 0.8 g per kg body weight
 *  - Fiber: 14 g per 1,000 kcal
 *  - Vitamins & minerals: RDA (or AI where no RDA exists) and Tolerable Upper Intake Level (UL)
 *
 * Pregnancy, lactation, and people under 19 use different equations and are not supported.
 */

export type Sex = 'female' | 'male';
export type ActivityLevel = 'inactive' | 'low_active' | 'active' | 'very_active';

export interface Body {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  activity: ActivityLevel;
}

export interface Range {
  min: number;
  max: number;
}

export interface Nutrient {
  key: string;
  name: string;
  unit: 'g' | 'mg' | 'mcg';
  /** RDA, or AI when no RDA is set. null = not determined. */
  amount: number | null;
  /** Tolerable Upper Intake Level. null = not determinable. */
  upperLimit: number | null;
  note?: string;
}

export interface Recommendations {
  bmi: { value: number; category: string };
  calories: number;
  macros: {
    carbs: Range;
    fiber: number;
    protein: number;
    fat: Range;
    alphaLinolenicAcid: number;
    linoleicAcid: number;
    waterLiters: number;
  };
  vitamins: Nutrient[];
  minerals: Nutrient[];
  /** Daily goals derived from the above, in the shape the goals table stores. */
  suggestedGoals: { calories: number; protein: number; carbs: number; fat: number };
}

// 2023 EER equations for adults 19+: kcal/day = a + b*age + c*height(cm) + d*weight(kg)
const EER: Record<Sex, Record<ActivityLevel, readonly [number, number, number, number]>> = {
  male: {
    inactive: [753.07, -10.83, 6.5, 14.1],
    low_active: [581.47, -10.83, 8.3, 14.94],
    active: [1004.82, -10.83, 4.31, 15.59],
    very_active: [-517.88, -10.83, 18.61, 25.84],
  },
  female: {
    inactive: [584.9, -7.01, 5.72, 11.71],
    low_active: [575.77, -7.01, 6.6, 12.14],
    active: [710.25, -7.01, 6.54, 12.34],
    very_active: [511.83, -7.01, 9.07, 12.56],
  },
};

export function estimatedEnergyRequirement({ sex, age, heightCm, weightKg, activity }: Body): number {
  const [a, b, c, d] = EER[sex][activity];
  return Math.round(a + b * age + c * heightCm + d * weightKg);
}

export function bmi(heightCm: number, weightKg: number): { value: number; category: string } {
  const value = weightKg / (heightCm / 100) ** 2;
  const category =
    value < 18.5 ? 'Underweight' : value < 25 ? 'Healthy weight' : value < 30 ? 'Overweight' : 'Obesity';
  return { value: Math.round(value * 10) / 10, category };
}

type Rule = (b: Body) => number | null;
const bySex =
  (male: number, female: number): Rule =>
  (b) =>
    b.sex === 'male' ? male : female;
const always =
  (n: number | null): Rule =>
  () =>
    n;

interface NutrientDef {
  key: string;
  name: string;
  unit: Nutrient['unit'];
  amount: Rule;
  upperLimit: Rule;
  note?: string;
}

const VITAMINS: NutrientDef[] = [
  { key: 'vitaminA', name: 'Vitamin A', unit: 'mcg', amount: bySex(900, 700), upperLimit: always(3000),
    note: 'Upper limit applies to preformed vitamin A (retinol) only.' },
  { key: 'vitaminC', name: 'Vitamin C', unit: 'mg', amount: bySex(90, 75), upperLimit: always(2000) },
  { key: 'vitaminD', name: 'Vitamin D', unit: 'mcg', amount: (b) => (b.age > 70 ? 20 : 15), upperLimit: always(100) },
  { key: 'vitaminE', name: 'Vitamin E', unit: 'mg', amount: always(15), upperLimit: always(1000),
    note: 'Upper limit applies to supplements and fortified foods.' },
  { key: 'vitaminK', name: 'Vitamin K', unit: 'mcg', amount: bySex(120, 90), upperLimit: always(null) },
  { key: 'thiamin', name: 'Thiamin (B1)', unit: 'mg', amount: bySex(1.2, 1.1), upperLimit: always(null) },
  { key: 'riboflavin', name: 'Riboflavin (B2)', unit: 'mg', amount: bySex(1.3, 1.1), upperLimit: always(null) },
  { key: 'niacin', name: 'Niacin (B3)', unit: 'mg', amount: bySex(16, 14), upperLimit: always(35),
    note: 'Upper limit applies to supplements and fortified foods.' },
  { key: 'pantothenicAcid', name: 'Pantothenic Acid (B5)', unit: 'mg', amount: always(5), upperLimit: always(null) },
  { key: 'vitaminB6', name: 'Vitamin B6', unit: 'mg', amount: (b) => (b.age <= 50 ? 1.3 : b.sex === 'male' ? 1.7 : 1.5),
    upperLimit: always(100) },
  { key: 'biotin', name: 'Biotin (B7)', unit: 'mcg', amount: always(30), upperLimit: always(null) },
  { key: 'folate', name: 'Folate (B9)', unit: 'mcg', amount: always(400), upperLimit: always(1000),
    note: 'Upper limit applies to folic acid from supplements and fortified foods.' },
  { key: 'vitaminB12', name: 'Vitamin B12', unit: 'mcg', amount: always(2.4), upperLimit: always(null) },
  { key: 'choline', name: 'Choline', unit: 'mg', amount: bySex(550, 425), upperLimit: always(3500) },
];

const MINERALS: NutrientDef[] = [
  { key: 'calcium', name: 'Calcium', unit: 'mg',
    amount: (b) => (b.age > 70 ? 1200 : b.age > 50 ? (b.sex === 'male' ? 1000 : 1200) : 1000),
    upperLimit: (b) => (b.age > 50 ? 2000 : 2500) },
  { key: 'chloride', name: 'Chloride', unit: 'g', amount: (b) => (b.age > 70 ? 1.8 : b.age > 50 ? 2.0 : 2.3),
    upperLimit: always(3.6) },
  { key: 'chromium', name: 'Chromium', unit: 'mcg',
    amount: (b) => (b.age > 50 ? (b.sex === 'male' ? 30 : 20) : b.sex === 'male' ? 35 : 25), upperLimit: always(null) },
  { key: 'copper', name: 'Copper', unit: 'mcg', amount: always(900), upperLimit: always(10000) },
  { key: 'fluoride', name: 'Fluoride', unit: 'mg', amount: bySex(4, 3), upperLimit: always(10) },
  { key: 'iodine', name: 'Iodine', unit: 'mcg', amount: always(150), upperLimit: always(1100) },
  { key: 'iron', name: 'Iron', unit: 'mg', amount: (b) => (b.sex === 'male' || b.age > 50 ? 8 : 18),
    upperLimit: always(45) },
  { key: 'magnesium', name: 'Magnesium', unit: 'mg',
    amount: (b) => (b.age <= 30 ? (b.sex === 'male' ? 400 : 310) : b.sex === 'male' ? 420 : 320),
    upperLimit: always(350), note: 'Upper limit applies to supplements only, not magnesium from food.' },
  { key: 'manganese', name: 'Manganese', unit: 'mg', amount: bySex(2.3, 1.8), upperLimit: always(11) },
  { key: 'molybdenum', name: 'Molybdenum', unit: 'mcg', amount: always(45), upperLimit: always(2000) },
  { key: 'phosphorus', name: 'Phosphorus', unit: 'mg', amount: always(700),
    upperLimit: (b) => (b.age > 70 ? 3000 : 4000) },
  { key: 'potassium', name: 'Potassium', unit: 'mg', amount: bySex(3400, 2600), upperLimit: always(null) },
  { key: 'selenium', name: 'Selenium', unit: 'mcg', amount: always(55), upperLimit: always(400) },
  { key: 'sodium', name: 'Sodium', unit: 'mg', amount: always(1500), upperLimit: always(2300),
    note: '2,300 mg is the Chronic Disease Risk Reduction intake: eating less than this lowers chronic disease risk.' },
  { key: 'zinc', name: 'Zinc', unit: 'mg', amount: bySex(11, 8), upperLimit: always(40) },
];

function evaluate(defs: NutrientDef[], body: Body): Nutrient[] {
  return defs.map(({ amount, upperLimit, ...rest }) => ({
    ...rest,
    amount: amount(body),
    upperLimit: upperLimit(body),
  }));
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export function calculateDri(body: Body): Recommendations {
  const calories = estimatedEnergyRequirement(body);
  const carbs = { min: Math.round((calories * 0.45) / 4), max: Math.round((calories * 0.65) / 4) };
  const fat = { min: Math.round((calories * 0.2) / 9), max: Math.round((calories * 0.35) / 9) };
  const protein = Math.round(0.8 * body.weightKg);
  const isMale = body.sex === 'male';

  return {
    bmi: bmi(body.heightCm, body.weightKg),
    calories,
    macros: {
      carbs,
      fiber: Math.round((14 * calories) / 1000),
      protein,
      fat,
      alphaLinolenicAcid: isMale ? 1.6 : 1.1,
      linoleicAcid: body.age <= 50 ? (isMale ? 17 : 12) : isMale ? 14 : 11,
      waterLiters: isMale ? 3.7 : 2.7,
    },
    vitamins: evaluate(VITAMINS, body),
    minerals: evaluate(MINERALS, body),
    // Carbs and fat aim for the middle of their ranges; protein targets the RDA, which is a minimum.
    suggestedGoals: {
      calories: clamp(calories, 500, 10000),
      protein: clamp(protein, 0, 1000),
      carbs: clamp(Math.round((carbs.min + carbs.max) / 2), 0, 1000),
      fat: clamp(Math.round((fat.min + fat.max) / 2), 0, 1000),
    },
  };
}
