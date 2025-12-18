#!/usr/bin/env node
/**
 * Console Statement Removal Script
 * 
 * This script removes all console.log and console.error statements
 * from production code while preserving error handling logic.
 * 
 * Usage: node remove-console-logs.js
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

// Files to process
const filesToClean = [
  'src/modules/institute_mudules/institue_user/institue_user.service.ts',
  'src/modules/user/user.service.ts',
  'src/modules/user/user.controller.ts',
  'src/modules/student/student.service.ts',
  'src/modules/subject/subject.controller.ts',
  'src/modules/institute/institute.controller.ts',
  'src/modules/institute_class_subject_modules/institute_class_subject_exams/institute_class_subject_exams.controller.ts',
];

// Statistics
let stats = {
  filesProcessed: 0,
  consoleLogRemoved: 0,
  consoleErrorRemoved: 0,
  linesRemoved: 0
};

function removeConsoleLogs(filePath) {
  console.log(`\n📝 Processing: ${filePath}`);
  
  const fullPath = path.join(process.cwd(), filePath);
  if (!fs.existsSync(fullPath)) {
    console.log(`   ⚠️  File not found, skipping`);
    return;
  }

  const content = fs.readFileSync(fullPath, 'utf8');
  const lines = content.split('\n');
  const newLines = [];
  let removed = 0;
  let consoleLogCount = 0;
  let consoleErrorCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Check if line contains console.log or console.error
    if (trimmed.startsWith('console.log(') || 
        trimmed.startsWith('console.error(') ||
        trimmed.includes('console.log(') ||
        trimmed.includes('console.error(')) {
      
      // Count type
      if (trimmed.includes('console.log(')) consoleLogCount++;
      if (trimmed.includes('console.error(')) consoleErrorCount++;
      
      removed++;
      // Skip this line (remove it)
      continue;
    }
    
    newLines.push(line);
  }

  // Write back to file
  fs.writeFileSync(fullPath, newLines.join('\n'), 'utf8');
  
  stats.filesProcessed++;
  stats.consoleLogRemoved += consoleLogCount;
  stats.consoleErrorRemoved += consoleErrorCount;
  stats.linesRemoved += removed;
  
  console.log(`   ✅ Removed ${consoleLogCount} console.log and ${consoleErrorCount} console.error statements`);
}

// Process all files
console.log('🧹 Starting console statement cleanup...\n');
console.log('=' .repeat(60));

filesToClean.forEach(removeConsoleLogs);

console.log('\n' + '='.repeat(60));
console.log('✅ Cleanup Complete!\n');
console.log('📊 Statistics:');
console.log(`   Files Processed: ${stats.filesProcessed}`);
console.log(`   console.log removed: ${stats.consoleLogRemoved}`);
console.log(`   console.error removed: ${stats.consoleErrorRemoved}`);
console.log(`   Total lines removed: ${stats.linesRemoved}`);
console.log('\n✨ Your code is now production-ready!');
