import findMatchingCompany from './src/companyMatcher.js';

// const companyName = 'International Business Machines';
// const experiences = [
//   { company: 'IBM Corporation' },
//   { company: 'Microsoft Inc' },
//   { company: 'Google LLC' },
// ];

// const emailDomain = 'ibm.com';

const companyName = 'Hostellerie Cedre & Spa';

const experiences = [
  { company: 'Beauvallon Collection' },
  { company: 'IBM Corporation' },
  { company: 'Google LLC' },
];

const emailDomain = 'cedrebeaune.com';

const [matchedExperience, matchType, index] = findMatchingCompany(
  companyName,
  experiences,
  emailDomain
);

console.log('Result:', matchedExperience, matchType, index);
