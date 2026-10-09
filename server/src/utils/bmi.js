/**
 * Calculate BMI
 * BMI = weight (kg) / (height (m) ^ 2)
 */
function calculateBMI(heightCm, weightKg) {
  if (!heightCm || !weightKg) return null;

  const heightM = heightCm / 100;
  if (heightM <= 0) return null;

  const bmi = weightKg / (heightM * heightM);

  // round to 1 decimal
  return Math.round(bmi * 10) / 10;
}

/**
 * Optional: classify BMI
 */
function getBMICategory(bmi) {
  if (bmi == null) return null;
  if (bmi < 18.5) return "Underweight";
  if (bmi < 25) return "Normal";
  if (bmi < 30) return "Overweight";
  return "Obese";
}

module.exports = {
  calculateBMI,
  getBMICategory,
};

