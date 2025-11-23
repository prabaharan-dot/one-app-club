#!/usr/bin/env node
/**
 * Test script for debugging "create a meeting tomorrow 9am" issue
 */

// Mock the datetime to get consistent results
const now = new Date('2025-11-23T10:00:00Z'); // Saturday
const tomorrow = new Date(now.getTime() + 24*60*60*1000); // Sunday

console.log('🔍 **Debugging "create a meeting tomorrow 9am"**\n');

console.log('📅 **Date Calculation Test**');
console.log('Current date:', now.toISOString());
console.log('Tomorrow date:', tomorrow.toISOString());
console.log('Tomorrow date string:', tomorrow.toISOString().split('T')[0]);
console.log();

console.log('🕘 **Time Parsing Test**');
const testInput = "create a meeting tomorrow 9am";

// Test regex patterns for time extraction
const timePatterns = [
    /\b(\d{1,2}):?(\d{2})?\s*(am|pm)\b/i,
    /\b(\d{1,2})\s*(am|pm)\b/i,
    /\b(\d{1,2}):(\d{2})\b/,
    /\b(\d{1,2})\s*(?::|\.)\s*(\d{2})\b/
];

console.log('Testing time extraction patterns:');
timePatterns.forEach((pattern, index) => {
    const match = testInput.match(pattern);
    console.log(`Pattern ${index + 1}:`, pattern.source, '→', match ? match[0] : 'no match');
});

// Test the manual parsing logic
function parseManualDateTime(input) {
    console.log('\n🔧 **Manual DateTime Parsing**');
    console.log('Input:', input);
    
    const dateKeywords = {
        'today': now.toISOString().split('T')[0],
        'tomorrow': tomorrow.toISOString().split('T')[0]
    };
    
    let dateStr = null;
    
    // Check for date keywords
    for (const [keyword, date] of Object.entries(dateKeywords)) {
        if (input.toLowerCase().includes(keyword)) {
            dateStr = date;
            console.log(`Found date keyword "${keyword}" → ${dateStr}`);
            break;
        }
    }
    
    if (!dateStr) {
        console.log('❌ No date found');
        return { success: false, error: 'No date found' };
    }
    
    // Extract time
    const timeMatch = input.match(/\b(\d{1,2}):?(\d{2})?\s*(am|pm)\b/i) || 
                     input.match(/\b(\d{1,2})\s*(am|pm)\b/i);
    
    if (!timeMatch) {
        console.log('❌ No time found in:', input);
        return { success: false, error: 'No time found' };
    }
    
    console.log('Time match:', timeMatch);
    
    let hour = parseInt(timeMatch[1]);
    const minute = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
    const period = timeMatch[3] ? timeMatch[3].toLowerCase() : '';
    
    console.log('Parsed time parts:', { hour, minute, period });
    
    // Convert to 24-hour format
    if (period === 'pm' && hour !== 12) hour += 12;
    if (period === 'am' && hour === 12) hour = 0;
    
    console.log('24-hour format:', hour);
    
    // Create datetime strings
    const startDateTime = `${dateStr}T${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`;
    const endDateTime = `${dateStr}T${(hour).toString().padStart(2, '0')}:${(minute + 30).toString().padStart(2, '0')}:00`;
    
    console.log('Generated start:', startDateTime);
    console.log('Generated end:', endDateTime);
    
    return {
        success: true,
        start_datetime: startDateTime,
        end_datetime: endDateTime,
        title: "Meeting"
    };
}

// Test the manual parsing
const result = parseManualDateTime(testInput);
console.log('\n✅ **Final Result**');
console.log(JSON.stringify(result, null, 2));

console.log('\n🎯 **Expected LLM Output**');
const expectedOutput = {
    "title": "Meeting",
    "start_datetime": "2025-11-24T09:00:00",
    "end_datetime": "2025-11-24T09:30:00"
};
console.log(JSON.stringify(expectedOutput, null, 2));

console.log('\n🔄 **Date Validation Test**');
const startDate = new Date(expectedOutput.start_datetime);
const endDate = new Date(expectedOutput.end_datetime);
console.log('Start date valid:', !isNaN(startDate.getTime()), startDate.toISOString());
console.log('End date valid:', !isNaN(endDate.getTime()), endDate.toISOString());
console.log('Start before end:', startDate < endDate);

console.log('\n📝 **Summary**');
console.log('Input: "create a meeting tomorrow 9am"');
console.log('Should produce:');
console.log('- Title: "Meeting"');
console.log('- Start: 2025-11-24T09:00:00 (Sunday 9:00 AM)');
console.log('- End: 2025-11-24T09:30:00 (Sunday 9:30 AM)');
console.log('- Duration: 30 minutes');
console.log();
console.log('If this doesn\'t work, check:');
console.log('1. Processor detection logs');
console.log('2. LLM system prompt and examples');
console.log('3. Date/time validation logic');
console.log('4. Manual parsing fallback');
console.log();
console.log('🏁 Debug test complete!');
