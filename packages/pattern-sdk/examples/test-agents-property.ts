import { createValidator } from '@prism-lang/validator';

const validator = createValidator();

// Test 1: config.agents
const test1 = `
export const test = (config) => {
  const list = config.agents
  return list
}
`;

// Test 2: config.agentList
const test2 = `
export const test = (config) => {
  const list = config.agentList
  return list
}
`;

// Test 3: config["agents"]
const test3 = `
export const test = (config) => {
  const list = config["agents"]
  return list
}
`;

console.log('Test 1 - config.agents:');
let result = validator.validateAll(test1);
console.log('Valid:', result.valid);
if (!result.valid && result.formattedErrors) {
  console.log('Error:', result.formattedErrors[0].message);
}

console.log('\nTest 2 - config.agentList:');
result = validator.validateAll(test2);
console.log('Valid:', result.valid);
if (!result.valid && result.formattedErrors) {
  console.log('Error:', result.formattedErrors[0].message);
}

console.log('\nTest 3 - config["agents"]:');
result = validator.validateAll(test3);
console.log('Valid:', result.valid);
if (!result.valid && result.formattedErrors) {
  console.log('Error:', result.formattedErrors[0].message);
}