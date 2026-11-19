import { z } from 'zod';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A calendar date as YYYY-MM-DD. Rejects impossible dates like 2025-02-30. */
export const isoDate = z
  .string()
  .regex(ISO_DATE, 'Must be a date in YYYY-MM-DD format')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, 'Must be a real calendar date');

export const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address')),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(200, 'Password must be at most 200 characters'),
});

export const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

const macro = z.number().min(0, 'Must be 0 or more').max(1000, 'Must be 1000 g or less');

export const entrySchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100, 'Name must be 100 characters or less'),
  meal: z.enum(MEALS),
  calories: z.number().int('Calories must be a whole number').min(0).max(10000),
  protein: macro.default(0),
  carbs: macro.default(0),
  fat: macro.default(0),
  date: isoDate,
});

export const entryPatchSchema = z
  .object({
    name: entrySchema.shape.name,
    meal: entrySchema.shape.meal,
    calories: entrySchema.shape.calories,
    protein: macro,
    carbs: macro,
    fat: macro,
    date: isoDate,
  })
  .partial()
  .refine((p) => Object.keys(p).length > 0, 'Provide at least one field to update');

export const goalsSchema = z.object({
  calories: z.number().int().min(500).max(10000),
  protein: macro,
  carbs: macro,
  fat: macro,
});

export const profileSchema = z.object({
  sex: z.enum(['female', 'male'], 'Choose a sex'),
  age: z
    .number('Enter your age')
    .int('Age must be a whole number')
    .min(19, 'Recommendations are available for ages 19 and up')
    .max(100, 'Age must be 100 or less'),
  heightCm: z
    .number('Enter your height')
    .min(90, 'Height must be between 90 and 250 cm (about 3 ft to 8 ft 2 in)')
    .max(250, 'Height must be between 90 and 250 cm (about 3 ft to 8 ft 2 in)'),
  weightKg: z
    .number('Enter your weight')
    .min(25, 'Weight must be between 25 and 300 kg (about 55 to 660 lb)')
    .max(300, 'Weight must be between 25 and 300 kg (about 55 to 660 lb)'),
  activity: z.enum(['inactive', 'low_active', 'active', 'very_active'], 'Choose an activity level'),
  units: z.enum(['imperial', 'metric']).default('imperial'),
  /** Also overwrite the user's daily goals with the calculated recommendations. */
  applyToGoals: z.boolean().default(true),
});

export const idParam =z.object({ id: z.coerce.number().int().positive() });

export const dateQuery = z.object({ date: isoDate });

export const rangeQuery = z
  .object({ from: isoDate, to: isoDate })
  .refine((q) => q.from <= q.to, { message: '`from` must be on or before `to`', path: ['from'] })
  .refine((q) => (Date.parse(q.to) - Date.parse(q.from)) / 86_400_000 < 366, {
    message: 'Range can be at most 366 days',
    path: ['to'],
  });
