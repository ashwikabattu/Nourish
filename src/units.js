export const CM_PER_INCH = 2.54
export const KG_PER_LB = 0.45359237

export function cmToFeetInches(cm) {
  const totalInches = Math.round(cm / CM_PER_INCH)
  return { feet: Math.floor(totalInches / 12), inches: totalInches % 12 }
}

export function kgToLb(kg) {
  return Math.round((kg / KG_PER_LB) * 10) / 10
}

export function formatHeight(cm, units) {
  if (units === 'metric') return `${Math.round(cm)} cm`
  const { feet, inches } = cmToFeetInches(cm)
  return `${feet} ft ${inches} in`
}

export function formatWeight(kg, units) {
  return units === 'metric' ? `${Math.round(kg * 10) / 10} kg` : `${kgToLb(kg)} lb`
}

export function formatNumber(n) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

/** Live BMI for the profile form. Uses the same formula and categories as server/src/dri.ts. */
export function bmiOf(heightCm, weightKg) {
  if (!(heightCm >= 90 && heightCm <= 250 && weightKg >= 25 && weightKg <= 300)) return null
  const value = Math.round((weightKg / (heightCm / 100) ** 2) * 10) / 10
  const exact = weightKg / (heightCm / 100) ** 2
  const category = exact < 18.5 ? 'Underweight' : exact < 25 ? 'Healthy weight' : exact < 30 ? 'Overweight' : 'Obesity'
  return { value, category }
}
