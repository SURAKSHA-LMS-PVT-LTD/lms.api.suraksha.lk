import { DynamoDBClient, ScanCommand, QueryCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const tableName = process.env.DYNAMODB_ATTENDANCE_TABLE || 'attendance_events';

/**
 * View DynamoDB Attendance Records
 * Shows the new calendar fields (calendarDayId, eventId)
 */
async function viewAttendanceRecords() {
  console.log('🔍 Querying DynamoDB table:', tableName);
  console.log('═══════════════════════════════════════════════════\n');

  try {
    // Scan table (limit to 10 items for testing)
    const scanCommand = new ScanCommand({
      TableName: tableName,
      Limit: 10,
    });

    const response = await client.send(scanCommand);

    if (!response.Items || response.Items.length === 0) {
      console.log('❌ No records found in the table\n');
      console.log('💡 Try marking some attendance first to populate the table\n');
      return;
    }

    console.log(`✅ Found ${response.Items.length} records:\n`);

    // Parse and display records
    response.Items.forEach((item, index) => {
      const record = unmarshall(item);
      
      console.log(`📝 Record ${index + 1}:`);
      console.log('─────────────────────────────────────────────────');
      console.log(`  Student ID:       ${record.studentId || 'N/A'}`);
      console.log(`  Student Name:     ${record.studentName || 'N/A'}`);
      console.log(`  Institute ID:     ${record.instituteId || 'N/A'}`);
      console.log(`  Date:             ${record.date || 'N/A'}`);
      console.log(`  Status:           ${record.status === 1 ? '✅ Present' : record.status === 0 ? '❌ Absent' : record.status === 2 ? '⏰ Late' : 'Unknown'}`);
      console.log(`  User Type:        ${record.userType || 'Not set'}`);
      console.log(`  🆕 Calendar Day ID: ${record.calendarDayId || '❌ NOT SET (old record)'}`);
      console.log(`  🆕 Event ID:        ${record.eventId || '❌ NOT SET (old record)'}`);
      
      if (record.classId) {
        console.log(`  Class ID:         ${record.classId}`);
      }
      if (record.subjectId) {
        console.log(`  Subject ID:       ${record.subjectId}`);
      }
      if (record.location) {
        console.log(`  Location:         ${record.location}`);
      }
      if (record.markingMethod) {
        console.log(`  Marking Method:   ${record.markingMethod}`);
      }
      
      console.log(`  Timestamp:        ${new Date(record.timestamp).toISOString()}`);
      console.log('─────────────────────────────────────────────────\n');
    });

    console.log(`\n📊 Total scanned: ${response.ScannedCount}`);
    console.log(`📊 Total returned: ${response.Items.length}`);
    
    if (response.LastEvaluatedKey) {
      console.log(`\n⚠️  More records available. Showing first 10 only.`);
    }

  } catch (error: any) {
    console.error('❌ Error querying DynamoDB:', error.message);
    console.error('\n💡 Make sure:');
    console.error('  1. AWS credentials are configured in .env');
    console.error('  2. DynamoDB table exists');
    console.error('  3. IAM permissions allow dynamodb:Scan');
  }
}

/**
 * Query recent records for a specific institute
 */
async function viewInstituteRecords(instituteId: string, limit: number = 5) {
  console.log(`\n🏫 Querying records for institute: ${instituteId}`);
  console.log('═══════════════════════════════════════════════════\n');

  try {
    const queryCommand = new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: {
        ':pk': { S: `I#${instituteId}` },
      },
      Limit: limit,
      ScanIndexForward: false, // Most recent first
    });

    const response = await client.send(queryCommand);

    if (!response.Items || response.Items.length === 0) {
      console.log(`❌ No records found for institute ${instituteId}\n`);
      return;
    }

    console.log(`✅ Found ${response.Items.length} recent records:\n`);

    response.Items.forEach((item, index) => {
      const record = unmarshall(item);
      console.log(`${index + 1}. ${record.studentName} - ${record.date} - Status: ${record.status === 1 ? 'Present' : 'Absent'} - 🆕 Calendar: ${record.calendarDayId ? '✅' : '❌'}`);
    });

  } catch (error: any) {
    console.error('❌ Error querying DynamoDB:', error.message);
  }
}

// Run the queries
async function main() {
  // View all records
  await viewAttendanceRecords();

  // Uncomment to query specific institute:
  // await viewInstituteRecords('YOUR_INSTITUTE_ID', 10);
}

main()
  .then(() => {
    console.log('\n✅ Query complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Query failed:', error);
    process.exit(1);
  });
