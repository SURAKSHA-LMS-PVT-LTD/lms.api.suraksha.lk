// Script to help identify remaining date/time issues
const fs = require('fs');
const path = require('path');

const filesToCheck = [
  'src/modules/attendance/attendance.service.ts',
  'src/modules/user/user.service.ts', 
  'src/modules/user/user.controller.ts',
  'src/modules/student/student.service.ts',
  'src/modules/sms/services/sms.service.ts',
  'src/modules/structured-lectures/structured-lectures.service.typeorm.ts',
  'src/common/services/security-monitoring.service.ts'
];

console.log('Files with remaining date/time issues:\n');

filesToCheck.forEach(file => {
  try {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    
    const issues = [];
    lines.forEach((line, idx) => {
      if (line.match(/new Date\(\)(?!.*timezone\.util)/i) || 
          line.match(/Date\.now\(\)(?!.*timezone\.util)/i)) {
        if (!line.includes('//') && !line.includes('validator') && !line.includes('transformer')) {
          issues.push(`  Line ${idx + 1}: ${line.trim()}`);
        }
      }
    });
    
    if (issues.length > 0) {
      console.log(`\n${file}: ${issues.length} issues`);
      issues.slice(0, 5).forEach(issue => console.log(issue));
      if (issues.length > 5) console.log(`  ... and ${issues.length - 5} more`);
    }
  } catch (e) {
    console.log(`Could not read ${file}`);
  }
});
