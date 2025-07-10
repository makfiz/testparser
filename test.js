import findMatchingCompany from './src/companyMatcher.js';

const companyName = 'UCHealth';
const experiences = [
  // { company: 'IBM Corporation' },
  // { company: 'Microsoft Inc' },
  { company: 'University of Colorado Health Sciences Library' },
];

const emailDomain = 'mike.campbell@uchealth.org';

// const companyName = 'Blue Cross and Blue Shield of Nebraska';

// const experiences = [
//   { company: 'Beauvallon Collection' },
//   { company: 'IBM Corporation' },
//   { company: 'Blue Cross and Blue Shield of Nebraska' },
// ];

// const emailDomain = 'nebraskablue.com';

const [matchedExperience, matchType, index] = findMatchingCompany(
  companyName,
  experiences,
  emailDomain
);

console.log('Result:', matchedExperience, matchType, index);
