// Manual test to check if primitives are syntactically valid
const fs = require('fs');
const path = require('path');

console.log('🔍 Checking Primitive Files\n');

const categories = ['execution', 'aggregation', 'confidence', 'control'];
let totalFiles = 0;
let issues = 0;

// Check each category
categories.forEach(category => {
  const dirPath = path.join(__dirname, '..', category);
  
  try {
    const files = fs.readdirSync(dirPath);
    const prismFiles = files.filter(f => f.endsWith('.prism'));
    
    console.log(`\n${category.toUpperCase()}:`);
    
    prismFiles.forEach(file => {
      totalFiles++;
      const content = fs.readFileSync(path.join(dirPath, file), 'utf8');
      
      // Basic syntax checks
      const checks = {
        hasExports: content.includes('export'),
        hasConfidence: content.includes('~>') || content.includes('~'),
        hasFunction: content.includes('=>') || content.includes('function'),
        hasImports: !content.includes('executeTask') || content.includes('import')
      };
      
      const passed = Object.values(checks).every(v => v);
      
      if (passed) {
        console.log(`  ✓ ${file}`);
      } else {
        console.log(`  ✗ ${file}`);
        Object.entries(checks).forEach(([check, result]) => {
          if (!result) {
            console.log(`    - Missing: ${check}`);
            issues++;
          }
        });
      }
    });
  } catch (error) {
    console.log(`  Error reading ${category}: ${error.message}`);
  }
});

// Check index
console.log('\nINDEX:');
try {
  const indexContent = fs.readFileSync(path.join(__dirname, '..', 'index.prism'), 'utf8');
  if (indexContent.includes('export') && indexContent.includes('from')) {
    console.log('  ✓ index.prism');
  } else {
    console.log('  ✗ index.prism - missing exports');
    issues++;
  }
  totalFiles++;
} catch (error) {
  console.log('  ✗ index.prism - ' + error.message);
  issues++;
}

// Summary
console.log('\n📊 Summary:');
console.log(`Total files: ${totalFiles}`);
console.log(`Issues found: ${issues}`);

if (issues === 0) {
  console.log('\n✅ All primitives look valid!');
} else {
  console.log('\n❌ Some issues found - review the files above');
}